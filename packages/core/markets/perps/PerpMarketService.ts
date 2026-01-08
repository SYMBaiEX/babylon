import { logger } from '@babylon/shared';
import type {
  PerpCloseInput,
  PerpDbPort,
  PerpMarketRecord,
  PerpOpenInput,
  PerpPositionRecord,
  PerpServiceDeps,
  PerpSide,
  PerpTradeResult,
} from './types';

/** Summary of price update operations */
export interface PriceUpdateSummary {
  marketsUpdated: number;
  positionsUpdated: number;
  liquidations: number;
  errors: Array<{ key: string; positionId?: string; error: string }>;
}

const DEFAULT_MAX_LEVERAGE = 100;
const DEFAULT_MIN_ORDER_SIZE = 10;
const MIN_MAX_POSITION_SIZE = 10_000;
const OPEN_INTEREST_LIMIT_RATIO = 0.1;
const FUNDING_PERIOD_HOURS = 8;
const BASE_FUNDING_RATE = 0.01; // 1% APR base
const MAX_FUNDING_RATE = 0.5; // 50% APR cap
const IMBALANCE_EXPONENT = 3.0;

/** Maximum total notional exposure per user across all positions */
const MAX_USER_EXPOSURE = 1_000_000;
/** Maximum number of open positions per user */
const MAX_POSITIONS_PER_USER = 50;

/**
 * PerpMarketService
 *
 * Thin domain service wrapper for perpetual markets.
 * Goal: expose a single market view and clean open/close flows,
 * decoupled from app framework concerns.
 */
export class PerpMarketService {
  private readonly db: PerpDbPort;
  private readonly deps: PerpServiceDeps;

  constructor(deps: PerpServiceDeps) {
    this.deps = deps;
    this.db = deps.db;
  }

  /**
   * Return current market snapshot (single source of truth).
   */
  async getMarketsSnapshot(): Promise<PerpMarketRecord[]> {
    return this.db.listMarkets();
  }

  /**
   * Open a perp position.
   *
   * @param input.maxSlippage - Maximum price deviation allowed from expected (0-1).
   */
  async openPosition(input: PerpOpenInput): Promise<PerpTradeResult> {
    const { ticker, side, size, leverage, maxSlippage } = input;
    const markets = await this.db.listMarkets();
    const market = markets.find((m) => m.ticker === ticker);
    if (!market) {
      throw new Error(`Market not found: ${ticker}`);
    }

    const minOrderSize = market.minOrderSize ?? DEFAULT_MIN_ORDER_SIZE;
    const maxLeverage = market.maxLeverage ?? DEFAULT_MAX_LEVERAGE;

    if (size < minOrderSize) {
      throw new Error(`Order size below minimum (${minOrderSize})`);
    }
    if (leverage < 1 || leverage > maxLeverage) {
      throw new Error(`Invalid leverage (1-${maxLeverage})`);
    }

    const maxPositionSize = this.calculateMaxPositionSize(market.openInterest);
    if (size > maxPositionSize) {
      throw new Error(
        `Order size exceeds market limit (${maxPositionSize.toLocaleString()})`
      );
    }

    // Check for existing position on same ticker → rebalance instead of rejecting
    const existingPosition = await this.db.getOpenPositionByUserAndTicker(
      input.userId,
      ticker
    );
    if (existingPosition) {
      if (existingPosition.side === side) {
        // Same side → add to position (increase size, average entry price)
        return this.addToPosition(existingPosition, input, market);
      } else {
        // Opposite side → reduce, close, or flip position
        return this.reduceOrFlipPosition(existingPosition, input, market);
      }
    }

    // Check total user exposure across all positions
    const userPositions = await this.db.getOpenPositionsByUser(input.userId);
    const currentExposure = userPositions.reduce(
      (sum, p) => sum + p.size * p.leverage,
      0
    );
    const newNotional = size * leverage;
    if (currentExposure + newNotional > MAX_USER_EXPOSURE) {
      throw new Error(
        `Total exposure would exceed limit: current ${currentExposure.toLocaleString()}, ` +
          `new ${newNotional.toLocaleString()}, max ${MAX_USER_EXPOSURE.toLocaleString()}`
      );
    }
    if (userPositions.length >= MAX_POSITIONS_PER_USER) {
      throw new Error(
        `Maximum positions reached (${MAX_POSITIONS_PER_USER}). Close a position first.`
      );
    }

    const entryPrice = market.currentPrice;

    // Slippage protection: if mark price differs significantly from spot, reject
    if (maxSlippage !== undefined && maxSlippage > 0 && market.markPrice) {
      const priceDeviation =
        Math.abs(entryPrice - market.markPrice) / market.markPrice;
      if (priceDeviation > maxSlippage) {
        throw new Error(
          `Slippage exceeded: spot/mark price deviation ${(priceDeviation * 100).toFixed(2)}% ` +
            `(max allowed: ${(maxSlippage * 100).toFixed(2)}%)`
        );
      }
    }
    const liquidationPrice = calculateLiquidationPrice(
      entryPrice,
      side,
      leverage
    );
    const marginRequired = size / leverage;
    const fee = this.calculateFee(size);
    const totalCost = marginRequired + fee;

    await this.deps.wallet.debit({
      userId: input.userId,
      amount: totalCost,
      reason: 'perp_open',
      description: `Open ${leverage}x ${side} ${ticker}`,
    });

    const now = this.deps.clock?.now() ?? new Date();
    const position = await this.db.upsertPosition({
      id: undefined,
      userId: input.userId,
      ticker,
      organizationId: market.organizationId,
      side,
      entryPrice,
      currentPrice: entryPrice,
      size,
      leverage,
      liquidationPrice,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      fundingPaid: 0,
      openedAt: now,
      lastUpdated: now,
    });

    // Open interest = sum of notional values (size), not leveraged exposure
    const newOpenInterest = market.openInterest + size;
    await this.db.updateMarketStats(ticker, {
      openInterest: newOpenInterest,
      volume24h: market.volume24h + size,
    });

    if (this.deps.feeProcessor) {
      await this.deps.feeProcessor.processTradingFee({
        userId: input.userId,
        amount: size,
        type: 'perp_open',
        relatedId: ticker,
        positionId: position.id,
      });
    }

    const result: PerpTradeResult = {
      positionId: position.id,
      ticker,
      side,
      size,
      leverage,
      entryPrice,
      liquidationPrice,
      marginPaid: marginRequired,
      feePaid: fee,
      balance: (await this.deps.wallet.getBalance(input.userId)).balance,
    };

    // Broadcast trade event for real-time UI updates
    await this.emitTradeEvent({
      type: 'perp_trade',
      action: 'open',
      ticker,
      side,
      size,
      leverage,
      entryPrice,
      positionId: position.id,
      openInterest: newOpenInterest,
      volume24h: market.volume24h + size,
      timestamp: now.toISOString(),
    });

    return result;
  }

  /**
   * Close a perp position (full or partial).
   *
   * @param input.percentage - Close a portion (0-1). Defaults to 1 (full close).
   * @param input.maxSlippage - Maximum price deviation from entry. Rejects if exceeded.
   */
  async closePosition(input: PerpCloseInput): Promise<PerpTradeResult> {
    const position = await this.db.getPositionById(input.positionId);
    if (!position) {
      throw new Error(`Position not found: ${input.positionId}`);
    }
    if (position.userId !== input.userId) {
      throw new Error('Not your position');
    }
    if (position.closedAt) {
      throw new Error('Position already closed');
    }

    const markets = await this.db.listMarkets();
    const market = markets.find((m) => m.ticker === position.ticker);
    if (!market) {
      throw new Error(
        `Market not found for position ticker ${position.ticker}`
      );
    }

    const exitPrice = input.exitPriceOverride ?? market.currentPrice;

    // Slippage protection: reject if execution price deviates too far from mark price
    // This protects against executing at a price that differs significantly from fair value
    if (input.maxSlippage !== undefined && input.maxSlippage > 0) {
      // Use mark price as the reference (more stable), falling back to position's tracked price
      const referencePrice = market.markPrice ?? market.currentPrice;
      const priceDeviation =
        Math.abs(exitPrice - referencePrice) / referencePrice;
      if (priceDeviation > input.maxSlippage) {
        throw new Error(
          `Slippage exceeded: execution price ${exitPrice.toFixed(2)} deviates ` +
            `${(priceDeviation * 100).toFixed(2)}% from mark price ${referencePrice.toFixed(2)} ` +
            `(max allowed: ${(input.maxSlippage * 100).toFixed(2)}%)`
        );
      }
    }

    // Determine close percentage (default to full close)
    const closePercentage = Math.min(1, Math.max(0, input.percentage ?? 1));
    if (closePercentage <= 0) {
      throw new Error('Close percentage must be greater than 0');
    }

    const closeSize = position.size * closePercentage;
    const remainingSize = position.size - closeSize;
    const isFullClose = remainingSize < 0.01; // Treat tiny remainders as full close

    // Calculate PnL for the portion being closed
    const { pnl } = calculateUnrealizedPnL(
      position.entryPrice,
      exitPrice,
      position.side,
      closeSize
    );
    // Proportional funding paid for the closed portion
    const proportionalFunding = position.fundingPaid * closePercentage;
    const realizedPnL = pnl - proportionalFunding;
    const marginPaid = closeSize / position.leverage;
    const grossSettlement = marginPaid + realizedPnL;
    const fee = this.calculateFee(closeSize);
    const netSettlement = Math.max(0, grossSettlement - fee);

    if (netSettlement > 0) {
      await this.deps.wallet.credit({
        userId: input.userId,
        amount: netSettlement,
        reason: isFullClose ? 'perp_close' : 'perp_partial_close',
        description: `${isFullClose ? 'Close' : `Partial close ${(closePercentage * 100).toFixed(0)}%`} ${position.leverage}x ${position.side} ${position.ticker}`,
        relatedId: position.id,
      });
    }

    await this.deps.wallet.recordPnL({
      userId: input.userId,
      pnl: realizedPnL,
      reason: isFullClose ? 'perp_close' : 'perp_partial_close',
      relatedId: position.id,
    });

    const now = this.deps.clock?.now() ?? new Date();

    if (isFullClose) {
      // Full close: mark position as closed
      await this.db.closePosition(position.id, {
        currentPrice: exitPrice,
        closedAt: now,
        realizedPnL: (position.realizedPnL ?? 0) + realizedPnL,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
      });
    } else {
      // Partial close: reduce position size and funding
      const remainingFunding = position.fundingPaid - proportionalFunding;
      const { pnl: remainingPnl, pnlPercent: remainingPnlPercent } =
        calculateUnrealizedPnL(
          position.entryPrice,
          exitPrice,
          position.side,
          remainingSize
        );
      await this.db.updateOpenPosition(position.id, {
        size: remainingSize,
        fundingPaid: remainingFunding,
        currentPrice: exitPrice,
        unrealizedPnL: remainingPnl,
        unrealizedPnLPercent: remainingPnlPercent,
        lastUpdated: now,
      });
    }

    // OI decreases by the closed portion
    const newOpenInterest = Math.max(0, market.openInterest - closeSize);
    await this.db.updateMarketStats(position.ticker, {
      openInterest: newOpenInterest,
      volume24h: market.volume24h + closeSize,
    });

    if (this.deps.feeProcessor) {
      await this.deps.feeProcessor.processTradingFee({
        userId: input.userId,
        amount: position.size,
        type: 'perp_close',
        relatedId: position.ticker,
        positionId: position.id,
      });
    }

    const result: PerpTradeResult = {
      positionId: position.id,
      ticker: position.ticker,
      side: position.side,
      size: closeSize,
      leverage: position.leverage,
      entryPrice: position.entryPrice,
      exitPrice,
      liquidationPrice: position.liquidationPrice,
      realizedPnL,
      feePaid: fee,
      marginPaid,
      balance: (await this.deps.wallet.getBalance(input.userId)).balance,
      remainingSize: isFullClose ? 0 : remainingSize,
      fullyClosed: isFullClose,
    };

    // Broadcast trade event for real-time UI updates
    await this.emitTradeEvent({
      type: 'perp_trade',
      action: isFullClose ? 'close' : 'partial_close',
      ticker: position.ticker,
      side: position.side,
      size: closeSize,
      leverage: position.leverage,
      entryPrice: position.entryPrice,
      exitPrice,
      positionId: position.id,
      realizedPnL,
      openInterest: newOpenInterest,
      volume24h: market.volume24h + closeSize,
      timestamp: (this.deps.clock?.now() ?? new Date()).toISOString(),
    });

    return result;
  }

  /**
   * Update open positions with new prices, apply liquidations, and update market stats.
   *
   * @returns Summary of updates applied, including any errors encountered.
   */
  async applyPriceUpdates(
    priceUpdates:
      | Map<string, number>
      | Record<string, number>
      | Array<[string, number]>
  ): Promise<PriceUpdateSummary> {
    const summary: PriceUpdateSummary = {
      marketsUpdated: 0,
      positionsUpdated: 0,
      liquidations: 0,
      errors: [],
    };

    const priceMap = normalizePriceMap(priceUpdates);
    if (priceMap.size === 0) return summary;

    // Filter out invalid prices (must be positive finite numbers)
    for (const [key, price] of priceMap.entries()) {
      if (!Number.isFinite(price) || price <= 0) {
        priceMap.delete(key);
        summary.errors.push({
          key,
          error: 'Invalid price (must be positive finite number)',
        });
      }
    }
    if (priceMap.size === 0) return summary;

    const markets = await this.db.listMarkets();
    const marketByOrg = new Map(markets.map((m) => [m.organizationId, m]));
    const marketByTicker = new Map(markets.map((m) => [m.ticker, m]));

    const positions = await this.db.listOpenPositions();

    for (const position of positions) {
      const newPrice =
        priceMap.get(position.organizationId) ??
        priceMap.get(position.ticker) ??
        null;
      if (newPrice === null || newPrice === undefined) continue;

      // Update unrealized
      const { pnl, pnlPercent } = calculateUnrealizedPnL(
        position.entryPrice,
        newPrice,
        position.side,
        position.size
      );

      const market =
        marketByOrg.get(position.organizationId) ??
        marketByTicker.get(position.ticker);

      const now = this.deps.clock?.now() ?? new Date();

      // Liquidation check
      if (shouldLiquidate(newPrice, position.liquidationPrice, position.side)) {
        const marginLoss = position.size / position.leverage;
        // OI decreases by notional (size), not leveraged exposure
        const newOpenInterest = Math.max(
          0,
          (market?.openInterest ?? 0) - position.size
        );

        try {
          await this.db.closePosition(position.id, {
            currentPrice: newPrice,
            closedAt: now,
            realizedPnL: -marginLoss,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
          });

          await this.deps.wallet.recordPnL({
            userId: position.userId,
            pnl: -marginLoss,
            reason: 'perp_liquidation',
            relatedId: position.id,
          });

          if (market) {
            await this.db.updateMarketStats(position.ticker, {
              openInterest: newOpenInterest,
            });
          }
          summary.liquidations++;
        } catch (err) {
          summary.errors.push({
            key: position.ticker,
            positionId: position.id,
            error: `Liquidation failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        continue;
      }

      // Persist open position metrics
      try {
        await this.db.updateOpenPosition(position.id, {
          currentPrice: newPrice,
          unrealizedPnL: pnl,
          unrealizedPnLPercent: pnlPercent,
          lastUpdated: now,
        });
        summary.positionsUpdated++;
      } catch (err) {
        summary.errors.push({
          key: position.ticker,
          positionId: position.id,
          error: `Position update failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Update market prices (simple stats update)
    for (const [key, price] of priceMap.entries()) {
      const market =
        marketByOrg.get(key) ??
        marketByTicker.get(key) ??
        markets.find((m) => m.organizationId === key || m.ticker === key);
      if (!market) continue;

      // Calculate 24h change using price24hAgo (falls back to current if not set)
      const referencePrice = market.price24hAgo ?? market.currentPrice;
      const change24h = price - referencePrice;
      const changePercent24h =
        referencePrice === 0 ? 0 : (change24h / referencePrice) * 100;

      // Calculate mark price with funding premium
      const markPrice = this.calculateMarkPrice(price, market.fundingRate.rate);

      try {
        await this.db.updateMarketStats(market.ticker, {
          currentPrice: price,
          change24h,
          changePercent24h,
          high24h: Math.max(market.high24h, price),
          low24h: Math.min(market.low24h, price),
          markPrice,
        });
        summary.marketsUpdated++;
      } catch (err) {
        summary.errors.push({
          key: market.ticker,
          error: `Market stats update failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return summary;
  }

  /**
   * Run a funding step (8h by default), updating fundingPaid per position and fundingRate per market.
   * Funding is accrued to positions (not settled to wallets here; PnL is adjusted on close).
   */
  async processFundingStep(): Promise<void> {
    const markets = await this.db.listMarkets();
    const positions = await this.db.listOpenPositions();

    const positionsByTicker = new Map<string, PerpPositionAggregate>();
    for (const pos of positions) {
      const agg =
        positionsByTicker.get(pos.ticker) ||
        createPerpAggregate(pos.ticker, pos.organizationId);
      if (pos.side === 'long') {
        agg.longOpenInterest += pos.size * pos.leverage;
      } else {
        agg.shortOpenInterest += pos.size * pos.leverage;
      }
      agg.positions.push(pos);
      positionsByTicker.set(pos.ticker, agg);
    }

    const now = this.deps.clock?.now() ?? new Date();
    const nextFundingTime = new Date(
      now.getTime() + FUNDING_PERIOD_HOURS * 60 * 60 * 1000
    ).toISOString();

    for (const market of markets) {
      const agg = positionsByTicker.get(market.ticker);
      if (!agg) continue;

      const funding = calculateDynamicFundingRate({
        longOpenInterest: agg.longOpenInterest,
        shortOpenInterest: agg.shortOpenInterest,
        baseFundingRate: BASE_FUNDING_RATE,
        maxFundingRate: MAX_FUNDING_RATE,
        imbalanceExponent: IMBALANCE_EXPONENT,
      });

      const periodRate = funding.periodRate;
      for (const pos of agg.positions) {
        const payment = calculateFundingPayment(pos.size, periodRate);
        // Positive funding: longs pay shorts
        const delta =
          funding.paymentDirection === 'balanced'
            ? 0
            : funding.paymentDirection === 'longs_pay'
              ? pos.side === 'long'
                ? payment
                : -payment
              : pos.side === 'short'
                ? payment
                : -payment;

        if (delta !== 0) {
          await this.db.updateOpenPosition(pos.id, {
            fundingPaid: pos.fundingPaid + delta,
            lastUpdated: now,
          });
        }
      }

      await this.db.updateMarketStats(market.ticker, {
        fundingRate: {
          ticker: market.ticker,
          rate: funding.annualRate,
          nextFundingTime,
          predictedRate: funding.annualRate,
        },
      });
    }
  }

  /**
   * Convenience: run price updates + funding in one pass.
   *
   * @returns Summary of price update operations (if priceUpdates provided).
   */
  async processFundingAndLiquidations(
    priceUpdates?:
      | Map<string, number>
      | Record<string, number>
      | Array<[string, number]>
  ): Promise<PriceUpdateSummary | void> {
    let summary: PriceUpdateSummary | undefined;
    if (priceUpdates) {
      summary = await this.applyPriceUpdates(priceUpdates);
    }
    await this.processFundingStep();
    return summary;
  }

  private calculateFee(notional: number): number {
    const fee = notional * this.deps.fees.tradingFeeRate;
    return Math.max(fee, this.deps.fees.minFeeAmount);
  }

  /**
   * Emit a trade event via the broadcast port for real-time UI updates.
   * Silently skips if no broadcast port is configured.
   * Logs errors for observability but never fails the trade.
   */
  private async emitTradeEvent(
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.deps.broadcast) return;
    try {
      await this.deps.broadcast.emit('markets', payload);
    } catch (err) {
      // Broadcast is optional - don't fail the trade if SSE fails
      // Log for observability to help diagnose real-time update issues
      logger.warn(
        'Broadcast failed',
        { error: err instanceof Error ? err.message : String(err) },
        'PerpMarketService'
      );
    }
  }

  /**
   * Add to an existing position (same side).
   * Calculates weighted average entry price and increases position size.
   *
   * Uses transaction for atomicity to prevent race conditions when
   * multiple add-to-position requests arrive concurrently.
   */
  private async addToPosition(
    existing: PerpPositionRecord,
    input: PerpOpenInput,
    market: PerpMarketRecord
  ): Promise<PerpTradeResult> {
    const { size: addedSize } = input;
    const currentPrice = market.currentPrice;

    // Validate added size
    const minOrderSize = market.minOrderSize ?? DEFAULT_MIN_ORDER_SIZE;
    if (addedSize < minOrderSize) {
      throw new Error(`Order size below minimum (${minOrderSize})`);
    }

    // Check max position size
    const maxPositionSize = this.calculateMaxPositionSize(market.openInterest);
    const newTotalSize = existing.size + addedSize;
    if (newTotalSize > maxPositionSize) {
      throw new Error(
        `Total position size would exceed market limit (${maxPositionSize.toLocaleString()})`
      );
    }

    // Check total user exposure
    const userPositions = await this.db.getOpenPositionsByUser(input.userId);
    const currentExposure = userPositions.reduce(
      (sum, p) => sum + p.size * p.leverage,
      0
    );
    // Use existing leverage for the added portion (consistent with industry standard)
    const effectiveLeverage = existing.leverage;
    const addedNotional = addedSize * effectiveLeverage;
    if (currentExposure + addedNotional > MAX_USER_EXPOSURE) {
      throw new Error(
        `Total exposure would exceed limit: current ${currentExposure.toLocaleString()}, ` +
          `adding ${addedNotional.toLocaleString()}, max ${MAX_USER_EXPOSURE.toLocaleString()}`
      );
    }

    // Calculate margin and fees for added portion only
    const marginRequired = addedSize / effectiveLeverage;
    const fee = this.calculateFee(addedSize);
    const totalCost = marginRequired + fee;

    // Debit wallet for additional margin (outside transaction - wallet is separate service)
    await this.deps.wallet.debit({
      userId: input.userId,
      amount: totalCost,
      reason: 'perp_add_to_position',
      description: `Add ${addedSize} to ${effectiveLeverage}x ${existing.side} ${existing.ticker}`,
    });

    const now = this.deps.clock?.now() ?? new Date();

    // Use transaction for atomic position + market stats update
    // This prevents race conditions when concurrent requests modify the same position
    return this.db.transaction(async (tx) => {
      // Re-fetch position inside transaction to get latest state
      const freshPosition = await tx.getPositionById(existing.id);
      if (!freshPosition || freshPosition.closedAt) {
        throw new Error('Position no longer exists or was closed');
      }

      // Recalculate with fresh position data to handle concurrent updates
      const actualNewSize = freshPosition.size + addedSize;
      const newEntryPrice =
        (freshPosition.size * freshPosition.entryPrice +
          addedSize * currentPrice) /
        actualNewSize;

      // Recalculate liquidation price with new entry
      const newLiquidationPrice = calculateLiquidationPrice(
        newEntryPrice,
        freshPosition.side,
        effectiveLeverage
      );

      // Calculate unrealized PnL with new entry price
      const { pnl, pnlPercent } = calculateUnrealizedPnL(
        newEntryPrice,
        currentPrice,
        freshPosition.side,
        actualNewSize
      );

      // Update the existing position
      await tx.updateOpenPosition(freshPosition.id, {
        size: actualNewSize,
        entryPrice: newEntryPrice,
        currentPrice,
        liquidationPrice: newLiquidationPrice,
        unrealizedPnL: pnl,
        unrealizedPnLPercent: pnlPercent,
        lastUpdated: now,
      });

      // Update market stats
      const newOpenInterest = market.openInterest + addedSize;
      await tx.updateMarketStats(freshPosition.ticker, {
        openInterest: newOpenInterest,
        volume24h: market.volume24h + addedSize,
      });

      // Process fees (outside transaction - fee service is separate)
      if (this.deps.feeProcessor) {
        await this.deps.feeProcessor.processTradingFee({
          userId: input.userId,
          amount: addedSize,
          type: 'perp_add_to_position',
          relatedId: freshPosition.ticker,
          positionId: freshPosition.id,
        });
      }

      const result: PerpTradeResult = {
        positionId: freshPosition.id,
        ticker: freshPosition.ticker,
        side: freshPosition.side,
        size: actualNewSize,
        leverage: effectiveLeverage,
        entryPrice: newEntryPrice,
        liquidationPrice: newLiquidationPrice,
        marginPaid: marginRequired,
        feePaid: fee,
        balance: (await this.deps.wallet.getBalance(input.userId)).balance,
        isRebalance: true,
        rebalanceType: 'add',
        previousSize: freshPosition.size,
        previousEntryPrice: freshPosition.entryPrice,
      };

      // Broadcast trade event
      await this.emitTradeEvent({
        type: 'perp_trade',
        action: 'add_to_position',
        ticker: freshPosition.ticker,
        side: freshPosition.side,
        size: actualNewSize,
        addedSize,
        leverage: effectiveLeverage,
        entryPrice: newEntryPrice,
        previousEntryPrice: freshPosition.entryPrice,
        positionId: freshPosition.id,
        openInterest: newOpenInterest,
        volume24h: market.volume24h + addedSize,
        timestamp: now.toISOString(),
      });

      return result;
    });
  }

  /**
   * Reduce, close, or flip an existing position (opposite side trade).
   *
   * - If tradeSize < existingSize: Partial close (reduce position)
   * - If tradeSize = existingSize: Full close (flatten)
   * - If tradeSize > existingSize: Close existing + open inverse (flip)
   */
  private async reduceOrFlipPosition(
    existing: PerpPositionRecord,
    input: PerpOpenInput,
    market: PerpMarketRecord
  ): Promise<PerpTradeResult> {
    const { size: tradeSize, side: tradeSide, leverage } = input;

    // Validate trade size
    const minOrderSize = market.minOrderSize ?? DEFAULT_MIN_ORDER_SIZE;
    if (tradeSize < minOrderSize) {
      throw new Error(`Order size below minimum (${minOrderSize})`);
    }

    const now = this.deps.clock?.now() ?? new Date();

    if (tradeSize < existing.size) {
      // REDUCE: Partial close of existing position
      const closePercentage = tradeSize / existing.size;
      const closeResult = await this.closePosition({
        userId: input.userId,
        positionId: existing.id,
        percentage: closePercentage,
      });

      return {
        ...closeResult,
        isRebalance: true,
        rebalanceType: 'reduce',
        previousSize: existing.size,
        previousEntryPrice: existing.entryPrice,
      };
    } else if (Math.abs(tradeSize - existing.size) < 0.01) {
      // CLOSE: Full close (sizes are equal within tolerance)
      const closeResult = await this.closePosition({
        userId: input.userId,
        positionId: existing.id,
        percentage: 1,
      });

      return {
        ...closeResult,
        isRebalance: true,
        rebalanceType: 'close',
        previousSize: existing.size,
        previousEntryPrice: existing.entryPrice,
      };
    } else {
      // FLIP: Close existing and open inverse position
      // Use transaction for atomicity - all DB operations use tx
      return this.db.transaction(async (tx) => {
        const exitPrice = market.currentPrice;

        // === STEP 1: Close existing position (inline logic for atomicity) ===

        // Calculate PnL for the closed position
        const { pnl: closePnl } = calculateUnrealizedPnL(
          existing.entryPrice,
          exitPrice,
          existing.side,
          existing.size
        );
        const realizedPnL = closePnl - existing.fundingPaid;
        const closeMarginPaid = existing.size / existing.leverage;
        const closeFee = this.calculateFee(existing.size);
        const grossSettlement = closeMarginPaid + realizedPnL;
        const netSettlement = Math.max(0, grossSettlement - closeFee);

        // Credit wallet for closed position (wallet ops outside DB tx)
        if (netSettlement > 0) {
          await this.deps.wallet.credit({
            userId: input.userId,
            amount: netSettlement,
            reason: 'perp_close',
            description: `Close ${existing.leverage}x ${existing.side} ${existing.ticker}`,
            relatedId: existing.id,
          });
        }

        await this.deps.wallet.recordPnL({
          userId: input.userId,
          pnl: realizedPnL,
          reason: 'perp_close',
          relatedId: existing.id,
        });

        // Close position in DB using transaction
        await tx.closePosition(existing.id, {
          currentPrice: exitPrice,
          closedAt: now,
          realizedPnL: (existing.realizedPnL ?? 0) + realizedPnL,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        });

        // === STEP 2: Open inverse position ===

        const inverseSize = tradeSize - existing.size;
        const maxLeverage = market.maxLeverage ?? DEFAULT_MAX_LEVERAGE;
        const effectiveLeverage = Math.min(leverage, maxLeverage);

        const entryPrice = market.currentPrice;
        const liquidationPrice = calculateLiquidationPrice(
          entryPrice,
          tradeSide,
          effectiveLeverage
        );
        const marginRequired = inverseSize / effectiveLeverage;
        const openFee = this.calculateFee(inverseSize);
        const totalCost = marginRequired + openFee;

        // Debit wallet for new position (wallet ops outside DB tx)
        await this.deps.wallet.debit({
          userId: input.userId,
          amount: totalCost,
          reason: 'perp_flip_position',
          description: `Flip to ${effectiveLeverage}x ${tradeSide} ${existing.ticker}`,
        });

        // Create new position using transaction
        const newPosition = await tx.upsertPosition({
          id: undefined,
          userId: input.userId,
          ticker: existing.ticker,
          organizationId: existing.organizationId,
          side: tradeSide,
          entryPrice,
          currentPrice: entryPrice,
          size: inverseSize,
          leverage: effectiveLeverage,
          liquidationPrice,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          fundingPaid: 0,
          openedAt: now,
          lastUpdated: now,
        });

        // === STEP 3: Update market stats atomically ===
        // OI change: -existing.size (closed) + inverseSize (opened)
        const netOiChange = inverseSize - existing.size;
        const newOpenInterest = Math.max(0, market.openInterest + netOiChange);
        const volumeTraded = existing.size + inverseSize;

        await tx.updateMarketStats(existing.ticker, {
          openInterest: newOpenInterest,
          volume24h: market.volume24h + volumeTraded,
        });

        // Process fees for both legs (outside DB tx)
        if (this.deps.feeProcessor) {
          await this.deps.feeProcessor.processTradingFee({
            userId: input.userId,
            amount: existing.size,
            type: 'perp_close',
            relatedId: existing.ticker,
            positionId: existing.id,
          });
          await this.deps.feeProcessor.processTradingFee({
            userId: input.userId,
            amount: inverseSize,
            type: 'perp_flip_position',
            relatedId: existing.ticker,
            positionId: newPosition.id,
          });
        }

        const totalFees = closeFee + openFee;
        const result: PerpTradeResult = {
          positionId: newPosition.id,
          ticker: existing.ticker,
          side: tradeSide,
          size: inverseSize,
          leverage: effectiveLeverage,
          entryPrice,
          liquidationPrice,
          marginPaid: marginRequired,
          feePaid: totalFees,
          realizedPnL,
          balance: (await this.deps.wallet.getBalance(input.userId)).balance,
          isRebalance: true,
          rebalanceType: 'flip',
          previousSize: existing.size,
          previousEntryPrice: existing.entryPrice,
        };

        // Broadcast flip event
        await this.emitTradeEvent({
          type: 'perp_trade',
          action: 'flip_position',
          ticker: existing.ticker,
          previousSide: existing.side,
          newSide: tradeSide,
          closedSize: existing.size,
          newSize: inverseSize,
          leverage: effectiveLeverage,
          entryPrice,
          realizedPnL,
          positionId: newPosition.id,
          previousPositionId: existing.id,
          openInterest: newOpenInterest,
          volume24h: market.volume24h + volumeTraded,
          timestamp: now.toISOString(),
        });

        return result;
      });
    }
  }

  private calculateMaxPositionSize(openInterest: number): number {
    const fromOi = openInterest * OPEN_INTEREST_LIMIT_RATIO;
    return Math.max(fromOi, MIN_MAX_POSITION_SIZE);
  }

  /**
   * Calculate mark price from spot price and funding rate.
   *
   * Mark price = Spot price × (1 + funding premium)
   * Funding premium = annual funding rate / periods per year
   *
   * This helps prevent unnecessary liquidations during short-term volatility.
   */
  private calculateMarkPrice(
    spotPrice: number,
    annualFundingRate: number
  ): number {
    const fundingPremium = annualFundingRate / periodsPerYear();
    return spotPrice * (1 + fundingPremium);
  }
}

function calculateLiquidationPrice(
  entryPrice: number,
  side: PerpSide,
  leverage: number
): number {
  // Guard against division by zero - leverage must be >= 1
  if (leverage < 1) leverage = 1;
  const liquidationThreshold = 0.9 / leverage;
  if (side === 'long') {
    return entryPrice * (1 - liquidationThreshold);
  }
  return entryPrice * (1 + liquidationThreshold);
}

function calculateUnrealizedPnL(
  entryPrice: number,
  currentPrice: number,
  side: PerpSide,
  size: number
): { pnl: number; pnlPercent: number } {
  // Guard against division by zero
  if (entryPrice <= 0 || size <= 0) {
    return { pnl: 0, pnlPercent: 0 };
  }
  const pnl =
    side === 'long'
      ? ((currentPrice - entryPrice) / entryPrice) * size
      : ((entryPrice - currentPrice) / entryPrice) * size;
  const pnlPercent = (pnl / size) * 100;
  return { pnl, pnlPercent };
}

function normalizePriceMap(
  input: Map<string, number> | Record<string, number> | Array<[string, number]>
): Map<string, number> {
  if (input instanceof Map) return input;
  if (Array.isArray(input)) return new Map(input);
  return new Map(
    Object.entries(input).map(([k, v]) => [k, Number(v)] as [string, number])
  );
}

interface PerpPositionAggregate {
  ticker: string;
  organizationId: string;
  longOpenInterest: number;
  shortOpenInterest: number;
  positions: PerpPositionRecord[];
}

function createPerpAggregate(
  ticker: string,
  organizationId: string
): PerpPositionAggregate {
  return {
    ticker,
    organizationId,
    longOpenInterest: 0,
    shortOpenInterest: 0,
    positions: [],
  };
}

interface FundingRateResult {
  annualRate: number;
  periodRate: number;
  imbalance: number;
  isSeverelyImbalanced: boolean;
  paymentDirection: 'longs_pay' | 'shorts_pay' | 'balanced';
}

function calculateDynamicFundingRate(params: {
  longOpenInterest: number;
  shortOpenInterest: number;
  baseFundingRate?: number;
  maxFundingRate?: number;
  imbalanceExponent?: number;
}): FundingRateResult {
  const {
    longOpenInterest,
    shortOpenInterest,
    baseFundingRate = BASE_FUNDING_RATE,
    maxFundingRate = MAX_FUNDING_RATE,
    imbalanceExponent = IMBALANCE_EXPONENT,
  } = params;

  const totalOI = longOpenInterest + shortOpenInterest;
  if (totalOI === 0) {
    const base = baseFundingRate;
    return {
      annualRate: base,
      periodRate: base / periodsPerYear(),
      imbalance: 0,
      isSeverelyImbalanced: false,
      paymentDirection: 'balanced',
    };
  }

  const imbalance = (longOpenInterest - shortOpenInterest) / totalOI;
  let paymentDirection: 'longs_pay' | 'shorts_pay' | 'balanced';
  if (Math.abs(imbalance) < 0.05) {
    paymentDirection = 'balanced';
  } else if (imbalance > 0) {
    paymentDirection = 'longs_pay';
  } else {
    paymentDirection = 'shorts_pay';
  }

  const absImbalance = Math.abs(imbalance);
  // At max imbalance (1.0), rate should reach maxFundingRate
  // At zero imbalance, rate stays at baseFundingRate
  // Using polynomial curve: rate = base + (max - base) * imbalance^exponent
  const rateRange = maxFundingRate - baseFundingRate;
  const rateMultiplier = rateRange * absImbalance ** imbalanceExponent;

  let annualRate: number;
  if (absImbalance < 0.01) {
    annualRate = baseFundingRate;
  } else {
    const signedRate =
      (baseFundingRate + rateMultiplier) * Math.sign(imbalance);
    annualRate = Math.max(
      -maxFundingRate,
      Math.min(maxFundingRate, signedRate)
    );
  }

  const periodRate = annualRate / periodsPerYear();
  const isSeverelyImbalanced = absImbalance > 0.4;

  return {
    annualRate,
    periodRate,
    imbalance,
    isSeverelyImbalanced,
    paymentDirection,
  };
}

function calculateFundingPayment(size: number, fundingRate: number): number {
  return size * fundingRate;
}

function periodsPerYear(): number {
  return (365.25 * 24) / FUNDING_PERIOD_HOURS;
}

import { shouldLiquidate } from './utils';

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

const DEFAULT_MAX_LEVERAGE = 100;
const DEFAULT_MIN_ORDER_SIZE = 10;
const MIN_MAX_POSITION_SIZE = 10_000;
const OPEN_INTEREST_LIMIT_RATIO = 0.1;
const FUNDING_PERIOD_HOURS = 8;
const BASE_FUNDING_RATE = 0.01; // 1% APR base
const MAX_FUNDING_RATE = 0.5; // 50% APR cap
const IMBALANCE_EXPONENT = 3.0;

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
   */
  async openPosition(input: PerpOpenInput): Promise<PerpTradeResult> {
    const { ticker, side, size, leverage } = input;
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

    const entryPrice = market.currentPrice;
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

    const newOpenInterest = market.openInterest + size * leverage;
    await this.db.updateMarketStats(ticker, {
      openInterest: newOpenInterest,
      volume24h: market.volume24h + size,
    });

    return {
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
  }

  /**
   * Close a perp position.
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
    const { pnl } = calculateUnrealizedPnL(
      position.entryPrice,
      exitPrice,
      position.side,
      position.size
    );
    const realizedPnL = pnl - position.fundingPaid;
    const marginPaid = position.size / position.leverage;
    const grossSettlement = marginPaid + realizedPnL;
    const fee = this.calculateFee(position.size);
    const netSettlement = Math.max(0, grossSettlement - fee);

    if (netSettlement > 0) {
      await this.deps.wallet.credit({
        userId: input.userId,
        amount: netSettlement,
        reason: 'perp_close',
        description: `Close ${position.leverage}x ${position.side} ${position.ticker}`,
        relatedId: position.id,
      });
    }

    await this.deps.wallet.recordPnL({
      userId: input.userId,
      pnl: realizedPnL,
      reason: 'perp_close',
      relatedId: position.id,
    });

    const now = this.deps.clock?.now() ?? new Date();
    await this.db.closePosition(position.id, {
      currentPrice: exitPrice,
      closedAt: now,
      realizedPnL,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
    });

    const newOpenInterest = Math.max(
      0,
      market.openInterest - position.size * position.leverage
    );
    await this.db.updateMarketStats(position.ticker, {
      openInterest: newOpenInterest,
      volume24h: market.volume24h + position.size,
    });

    return {
      positionId: position.id,
      ticker: position.ticker,
      side: position.side,
      size: position.size,
      leverage: position.leverage,
      entryPrice: position.entryPrice,
      exitPrice,
      liquidationPrice: position.liquidationPrice,
      realizedPnL,
      feePaid: fee,
      marginPaid,
      balance: (await this.deps.wallet.getBalance(input.userId)).balance,
    };
  }

  /**
   * Update open positions with new prices, apply liquidations, and update market stats.
   */
  async applyPriceUpdates(
    priceUpdates:
      | Map<string, number>
      | Record<string, number>
      | Array<[string, number]>
  ): Promise<void> {
    const priceMap = normalizePriceMap(priceUpdates);
    if (priceMap.size === 0) return;

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
        const newOpenInterest = Math.max(
          0,
          (market?.openInterest ?? 0) - position.size * position.leverage
        );

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
        continue;
      }

      // Persist open position metrics
      await this.db.updateOpenPosition(position.id, {
        currentPrice: newPrice,
        unrealizedPnL: pnl,
        unrealizedPnLPercent: pnlPercent,
        lastUpdated: now,
      });
    }

    // Update market prices (simple stats update)
    for (const [key, price] of priceMap.entries()) {
      const market =
        marketByOrg.get(key) ??
        marketByTicker.get(key) ??
        markets.find((m) => m.organizationId === key || m.ticker === key);
      if (!market) continue;

      const change24h = price - market.currentPrice;
      const changePercent24h =
        market.currentPrice === 0 ? 0 : (change24h / market.currentPrice) * 100;

      await this.db.updateMarketStats(market.ticker, {
        currentPrice: price,
        change24h,
        changePercent24h,
        high24h: Math.max(market.high24h, price),
        low24h: Math.min(market.low24h, price),
        markPrice: price, // placeholder; could use index/funding adjustment
      });
    }
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
          rate: funding.annualRate,
          nextFundingTime,
          predictedRate: funding.annualRate,
        },
      });
    }
  }

  /**
   * Convenience: run price updates + funding in one pass.
   */
  async processFundingAndLiquidations(
    priceUpdates?:
      | Map<string, number>
      | Record<string, number>
      | Array<[string, number]>
  ): Promise<void> {
    if (priceUpdates) {
      await this.applyPriceUpdates(priceUpdates);
    }
    await this.processFundingStep();
  }

  private calculateFee(notional: number): number {
    const fee = notional * this.deps.fees.tradingFeeRate;
    return Math.max(fee, this.deps.fees.minFeeAmount);
  }

  private calculateMaxPositionSize(openInterest: number): number {
    const fromOi = openInterest * OPEN_INTEREST_LIMIT_RATIO;
    return Math.max(fromOi, MIN_MAX_POSITION_SIZE);
  }
}

function calculateLiquidationPrice(
  entryPrice: number,
  side: PerpSide,
  leverage: number
): number {
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
  const scaleFactor =
    (maxFundingRate - baseFundingRate) / 1 ** imbalanceExponent;
  const rateMultiplier = absImbalance ** imbalanceExponent * scaleFactor;

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

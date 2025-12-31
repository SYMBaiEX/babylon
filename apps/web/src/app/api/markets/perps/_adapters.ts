/**
 * Shared adapters and factories for perps API routes.
 *
 * Centralizes the creation of PerpMarketService instances to:
 * - Avoid code duplication across routes
 * - Ensure consistent configuration
 * - Enable SSE broadcast for real-time updates
 * - Apply price impact from user trades in real-time
 */

import { broadcastToChannel } from '@babylon/api';
import {
  PerpDbAdapter,
  PerpMarketService,
  type PerpServiceDeps,
} from '@babylon/core/markets/perps';
import type {
  BroadcastPort,
  FeeConfig,
  FeeProcessor,
  WalletPort,
} from '@babylon/core/markets/shared/common';
import {
  and,
  db,
  eq,
  isNull,
  organizations,
  perpMarketSnapshots,
  perpPositions,
} from '@babylon/db';
import {
  FEE_CONFIG,
  FeeService,
  PriceUpdateService,
  WalletService,
} from '@babylon/engine';
import {
  calculatePriceFromHoldings,
  type JsonValue,
  logger,
  PERP_MARKET_CONFIG,
} from '@babylon/shared';

/**
 * Creates a WalletPort adapter that wraps WalletService methods.
 * Used by PerpMarketService in API handlers.
 */
export function createWalletAdapter(): WalletPort {
  return {
    debit: async ({ userId, amount, reason, description, relatedId }) => {
      await WalletService.debit(
        userId,
        amount,
        reason,
        description ?? '',
        relatedId
      );
    },
    credit: async ({ userId, amount, reason, description, relatedId }) => {
      await WalletService.credit(
        userId,
        amount,
        reason,
        description ?? '',
        relatedId
      );
    },
    recordPnL: async ({ userId, pnl, reason, relatedId }) => {
      await WalletService.recordPnL(userId, pnl, reason, relatedId);
    },
    getBalance: (userId: string) => WalletService.getBalance(userId),
  };
}

/**
 * Creates a BroadcastPort adapter for SSE real-time updates.
 */
export function createBroadcastAdapter(): BroadcastPort {
  return {
    emit: async (channel: string, payload: Record<string, unknown>) => {
      await broadcastToChannel(
        channel as 'markets',
        payload as Record<string, JsonValue>
      );
    },
  };
}

/**
 * Creates a FeeProcessor adapter for trading fee handling.
 */
export function createFeeProcessorAdapter(): FeeProcessor {
  return {
    processTradingFee: ({ userId, amount, type, relatedId, positionId }) =>
      FeeService.processTradingFee(
        userId,
        type as (typeof FEE_CONFIG.FEE_TYPES)[keyof typeof FEE_CONFIG.FEE_TYPES],
        amount,
        positionId,
        relatedId
      ),
  };
}

/**
 * Standard fee config for perps trading.
 */
export const perpFeeConfig: FeeConfig = {
  tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
  platformShare: FEE_CONFIG.PLATFORM_SHARE,
  referrerShare: FEE_CONFIG.REFERRER_SHARE,
  minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
};

/**
 * Options for creating PerpMarketService.
 */
export interface CreatePerpServiceOptions {
  /** Include fee processor for trading fee handling. Default: false */
  withFeeProcessor?: boolean;
  /** Include broadcast adapter for SSE updates. Default: false */
  withBroadcast?: boolean;
}

/**
 * Creates a fully configured PerpMarketService instance.
 *
 * This factory centralizes service creation to:
 * - Reduce code duplication across API routes
 * - Ensure consistent configuration
 * - Enable optional SSE broadcast for real-time updates
 *
 * @example
 * ```ts
 * // Read-only (listing markets)
 * const service = createPerpMarketService();
 *
 * // With trading (open/close positions)
 * const service = createPerpMarketService({
 *   withFeeProcessor: true,
 *   withBroadcast: true,
 * });
 * ```
 */
export function createPerpMarketService(
  options: CreatePerpServiceOptions = {}
): PerpMarketService {
  const deps: PerpServiceDeps = {
    db: new PerpDbAdapter(),
    wallet: createWalletAdapter(),
    fees: perpFeeConfig,
  };

  if (options.withBroadcast) {
    deps.broadcast = createBroadcastAdapter();
  }

  if (options.withFeeProcessor) {
    deps.feeProcessor = createFeeProcessorAdapter();
  }

  return new PerpMarketService(deps);
}

/**
 * Price impact uses centralized config from @babylon/shared.
 *
 * With LIQUIDITY_FACTOR = 20 and SYNTHETIC_SUPPLY = 10000:
 * - effectiveSupply = 500
 * - $100 trade → ~0.02% impact
 * - $1000 trade → ~0.2% impact
 * - $5000 trade → ~1% impact
 *
 * This makes our simulation markets 20x less liquid than real exchanges,
 * providing visible price impact from user trades.
 *
 * @see PERP_MARKET_CONFIG in @babylon/shared
 */

/**
 * Applies price impact from a user trade in real-time.
 *
 * This mirrors the logic in game-tick.ts `updateMarketPricesFromTrades`,
 * but executes immediately after each user trade to provide real-time
 * price feedback.
 *
 * Formula:
 * - netHoldings = sum(long positions) - sum(short positions)
 * - newMarketCap = baseMarketCap + netHoldings
 * - newPrice = newMarketCap / syntheticSupply
 * - Clamped to ±20% per trade and 25%-400% of initial price
 *
 * @param ticker - The market ticker (e.g., "AIPHB")
 */
export async function applyUserTradePriceImpact(ticker: string): Promise<void> {
  try {
    // 1. Get organizationId from perpMarketSnapshots (ticker -> orgId mapping)
    const [snapshot] = await db
      .select({
        organizationId: perpMarketSnapshots.organizationId,
        currentPrice: perpMarketSnapshots.currentPrice,
      })
      .from(perpMarketSnapshots)
      .where(eq(perpMarketSnapshots.ticker, ticker))
      .limit(1);

    if (!snapshot) {
      logger.warn(
        'PerpMarketSnapshot not found for price impact',
        { ticker },
        'PerpPriceImpact'
      );
      return;
    }

    const organizationId = snapshot.organizationId;

    // 2. Get organization data (initialPrice, currentPrice)
    const [org] = await db
      .select({
        id: organizations.id,
        currentPrice: organizations.currentPrice,
        initialPrice: organizations.initialPrice,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      logger.warn(
        'Organization not found for price impact',
        { ticker, organizationId },
        'PerpPriceImpact'
      );
      return;
    }

    const initialPrice = Number(org.initialPrice ?? 100);
    const currentPrice = Number(org.currentPrice ?? initialPrice);

    // 3. Get all open positions for this ticker
    // Note: positions use ticker (e.g., "AIPHB"), not organizationId
    const openPositions = await db
      .select({
        side: perpPositions.side,
        size: perpPositions.size,
      })
      .from(perpPositions)
      .where(
        and(eq(perpPositions.ticker, ticker), isNull(perpPositions.closedAt))
      );

    // 4. Calculate net holdings (longs - shorts)
    let netHoldings = 0;
    for (const pos of openPositions) {
      const size = Number(pos.size);
      netHoldings += pos.side === 'long' ? size : -size;
    }

    // 5. Calculate new price using centralized vAMM formula with liquidity factor
    const newPrice = calculatePriceFromHoldings(
      initialPrice,
      currentPrice,
      netHoldings,
      PERP_MARKET_CONFIG
    );

    // 6. Only update if price actually changed meaningfully (at least 0.001% or $0.01)
    const change = newPrice - currentPrice;
    const effectiveSupply =
      PERP_MARKET_CONFIG.SYNTHETIC_SUPPLY / PERP_MARKET_CONFIG.LIQUIDITY_FACTOR;
    logger.info(
      `Price impact calculation: netHoldings=${netHoldings}, newPrice=${newPrice.toFixed(4)}, change=${change.toFixed(4)}, effectiveSupply=${effectiveSupply}`,
      {
        ticker,
        netHoldings,
        newPrice,
        change,
        currentPrice,
        initialPrice,
        liquidityFactor: PERP_MARKET_CONFIG.LIQUIDITY_FACTOR,
      },
      'PerpPriceImpact'
    );

    if (Math.abs(change) < 0.001) {
      logger.info(
        'Skipping price update - change too small',
        { change },
        'PerpPriceImpact'
      );
      return;
    }

    const changePercent = currentPrice > 0 ? (change / currentPrice) * 100 : 0;

    logger.info(
      `User trade price impact: ${ticker} (${organizationId}) ${currentPrice.toFixed(2)} -> ${newPrice.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
      { ticker, organizationId, currentPrice, newPrice, netHoldings, change },
      'PerpPriceImpact'
    );

    // 8. Apply price update via PriceUpdateService (updates org + broadcasts)
    await PriceUpdateService.applyUpdates([
      {
        organizationId, // Use the actual org ID, not the ticker
        newPrice,
        source: 'user_trade',
        reason: 'User trade price impact',
      },
    ]);

    // 9. Broadcast with ticker explicitly for UI hooks (useMarketPrices)
    // PriceUpdateService broadcasts with organizationId, but UI uses ticker
    try {
      await broadcastToChannel('markets', {
        type: 'perp_price_update',
        updates: [
          {
            ticker, // The ticker that UI hooks listen for (e.g., "AIPHB")
            organizationId,
            newPrice,
            price: newPrice,
            change,
            changePercent,
          },
        ],
      });
    } catch {
      // Non-critical, ignore broadcast errors
    }

    // 10. Also update perpMarketSnapshots for consistency
    const referencePrice = currentPrice;
    await db
      .update(perpMarketSnapshots)
      .set({
        currentPrice: newPrice,
        change24h: newPrice - referencePrice,
        changePercent24h: changePercent,
        high24h: Math.max(currentPrice, newPrice),
        low24h: Math.min(currentPrice, newPrice),
        updatedAt: new Date(),
      })
      .where(eq(perpMarketSnapshots.ticker, ticker));
  } catch (error) {
    // Don't throw - price impact is enhancement, not critical path
    logger.error(
      'Failed to apply user trade price impact',
      { ticker, error: error instanceof Error ? error.message : String(error) },
      'PerpPriceImpact'
    );
  }
}

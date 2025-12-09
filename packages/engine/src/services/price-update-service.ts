import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { db, eq, getDbInstance, organizations } from '@babylon/db';
import type { JsonValue } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { FEE_CONFIG } from '../config/fees';
import { WalletService } from './wallet-service';

export type PriceUpdateSource = 'user_trade' | 'npc_trade' | 'event' | 'system';

export interface PriceUpdateInput {
  organizationId: string;
  newPrice: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AppliedPriceUpdate {
  organizationId: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, JsonValue>;
  timestamp: string;
}

export class PriceUpdateService {
  /**
   * Apply a batch of price updates with persistence, engine sync, and SSE broadcast
   */
  static async applyUpdates(
    updates: PriceUpdateInput[]
  ): Promise<AppliedPriceUpdate[]> {
    if (updates.length === 0) return [];

    const perpService = new PerpMarketService({
      db: new PerpDbAdapter(),
      wallet: {
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
      },
      fees: {
        tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
        platformShare: FEE_CONFIG.PLATFORM_SHARE,
        referrerShare: FEE_CONFIG.REFERRER_SHARE,
        minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
      },
    });
    const appliedUpdates: AppliedPriceUpdate[] = [];
    const priceMap = new Map<string, number>();

    for (const update of updates) {
      if (!Number.isFinite(update.newPrice) || update.newPrice <= 0) {
        logger.warn(
          'Skipping invalid price update',
          { update },
          'PriceUpdateService'
        );
        continue;
      }

      const [organization] = await db
        .select({
          id: organizations.id,
          currentPrice: organizations.currentPrice,
        })
        .from(organizations)
        .where(eq(organizations.id, update.organizationId))
        .limit(1);

      if (!organization) {
        logger.warn(
          'Organization not found for price update',
          { organizationId: update.organizationId },
          'PriceUpdateService'
        );
        continue;
      }

      const oldPrice = Number(organization.currentPrice ?? update.newPrice);
      const change = update.newPrice - oldPrice;
      const changePercent = oldPrice === 0 ? 0 : (change / oldPrice) * 100;

      await db
        .update(organizations)
        .set({ currentPrice: update.newPrice, updatedAt: new Date() })
        .where(eq(organizations.id, organization.id));

      await getDbInstance().recordPriceUpdate(
        organization.id,
        update.newPrice,
        change,
        changePercent
      );

      priceMap.set(organization.id, update.newPrice);

      appliedUpdates.push({
        organizationId: organization.id,
        oldPrice,
        newPrice: update.newPrice,
        change,
        changePercent,
        source: update.source,
        reason: update.reason,
        metadata: update.metadata,
        timestamp: new Date().toISOString(),
      });
    }

    if (priceMap.size > 0) {
      await perpService.applyPriceUpdates(priceMap);

      // Broadcast price updates via API layer (non-blocking, optional)
      void import('@babylon/api').then(({ broadcastToChannel }) =>
        broadcastToChannel('markets', {
          type: 'price_update',
          updates: JSON.parse(JSON.stringify(appliedUpdates)) as JsonValue,
        })
      );

      logger.info(
        `Applied ${appliedUpdates.length} organization price updates`,
        { count: appliedUpdates.length },
        'PriceUpdateService'
      );
    }

    return appliedUpdates;
  }
}

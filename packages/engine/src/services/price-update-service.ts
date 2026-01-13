import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import {
  db,
  eq,
  getDbInstance,
  organizationState,
  organizations,
} from '@babylon/db';
import type { JsonValue } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { FEE_CONFIG } from '../config/fees';
import { broadcastToChannel } from './realtime-broadcaster';
import { WalletService } from './wallet-service';

export type PriceUpdateSource =
  | 'user_trade'
  | 'npc_trade'
  | 'event'
  | 'system'
  | 'volatility_simulation';

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
        debit: ({ userId, amount, reason, description, relatedId }) =>
          WalletService.debit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          ),
        credit: ({ userId, amount, reason, description, relatedId }) =>
          WalletService.credit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          ),
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
    const now = new Date();

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
        .set({ currentPrice: update.newPrice, updatedAt: now })
        .where(eq(organizations.id, organization.id));

      // Keep runtime price state in sync (used across engine + widgets)
      await db
        .insert(organizationState)
        .values({
          id: organization.id,
          currentPrice: update.newPrice,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: organizationState.id,
          set: { currentPrice: update.newPrice, updatedAt: now },
        });

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

      // Broadcast price updates (handled by API layer if available)
      try {
        const updatesForBroadcast: JsonValue = appliedUpdates.map((u) => ({
          organizationId: u.organizationId,
          oldPrice: u.oldPrice,
          newPrice: u.newPrice,
          change: u.change,
          changePercent: u.changePercent,
          source: u.source,
          reason: u.reason ?? null,
          metadata: u.metadata ?? null,
          timestamp: u.timestamp,
        }));

        await broadcastToChannel('markets', {
          type: 'price_update',
          updates: updatesForBroadcast,
        });

        // If any updates include a canonical perp ticker, also broadcast a
        // `perp_price_update` for real-time UI hooks/stores.
        const perpUpdates = appliedUpdates
          .map((u) => {
            const tickerRaw = u.metadata?.ticker;
            const ticker =
              typeof tickerRaw === 'string' && tickerRaw.length > 0
                ? tickerRaw.toUpperCase()
                : null;
            if (!ticker) return null;
            return {
              ticker,
              organizationId: u.organizationId,
              newPrice: u.newPrice,
              price: u.newPrice,
              change: u.change,
              changePercent: u.changePercent,
            };
          })
          .filter((u): u is NonNullable<typeof u> => u !== null);

        if (perpUpdates.length > 0) {
          await broadcastToChannel('markets', {
            type: 'perp_price_update',
            updates: perpUpdates,
          });
        }
      } catch {
        // Broadcast is optional - engine can work without it
      }

      logger.info(
        `Applied ${appliedUpdates.length} organization price updates`,
        { count: appliedUpdates.length },
        'PriceUpdateService'
      );
    }

    return appliedUpdates;
  }
}

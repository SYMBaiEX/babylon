import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { db, eq, getDbInstance, organizationState } from '@babylon/db';
import { type JsonValue, logger } from '@babylon/shared';
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
        debit: (params: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) =>
          WalletService.debit(
            params.userId,
            params.amount,
            params.reason,
            params.description ?? '',
            params.relatedId
          ),
        credit: (params: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) =>
          WalletService.credit(
            params.userId,
            params.amount,
            params.reason,
            params.description ?? '',
            params.relatedId
          ),
        recordPnL: async (params: {
          userId: string;
          pnl: number;
          reason: string;
          relatedId?: string;
        }) => {
          await WalletService.recordPnL(
            params.userId,
            params.pnl,
            params.reason,
            params.relatedId
          );
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

      const [orgState] = await db
        .select({
          id: organizationState.id,
          currentPrice: organizationState.currentPrice,
        })
        .from(organizationState)
        .where(eq(organizationState.id, update.organizationId))
        .limit(1);

      if (!orgState) {
        logger.warn(
          'Organization state not found for price update',
          { organizationId: update.organizationId },
          'PriceUpdateService'
        );
        continue;
      }

      const oldPrice = Number(orgState.currentPrice ?? update.newPrice);
      const change = update.newPrice - oldPrice;
      const changePercent = oldPrice === 0 ? 0 : (change / oldPrice) * 100;

      await db
        .update(organizationState)
        .set({ currentPrice: update.newPrice, updatedAt: new Date() })
        .where(eq(organizationState.id, orgState.id));

      await getDbInstance().recordPriceUpdate(
        orgState.id,
        update.newPrice,
        change,
        changePercent
      );

      priceMap.set(orgState.id, update.newPrice);

      appliedUpdates.push({
        organizationId: orgState.id,
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
      const api = await import('@babylon/api');
      // JSON.parse/stringify ensures clean JSON-serializable data
      // Using Record<string, unknown> for JSON-parsed data since the exact shape varies
      const serializedUpdates = JSON.parse(
        JSON.stringify(appliedUpdates)
      ) as Record<string, unknown>[];
      await api.broadcastToChannel('markets', {
        type: 'price_update',
        updates: serializedUpdates,
      } as Record<string, unknown> as Parameters<
        typeof api.broadcastToChannel
      >[1]);

      logger.info(
        `Applied ${appliedUpdates.length} organization price updates`,
        { count: appliedUpdates.length },
        'PriceUpdateService'
      );
    }

    return appliedUpdates;
  }
}

import { db } from '@/lib/database-service';
import { logger } from '@/lib/logger';
import { ensurePerpsEngineReady, getPerpsEngine } from '@/lib/perps-service';
import { prisma } from '@/lib/prisma';
import { broadcastToChannel } from '@/lib/sse/event-broadcaster';

export type PriceUpdateSource = 'user_trade' | 'npc_trade' | 'event' | 'system';

export interface PriceUpdateInput {
  organizationId: string;
  newPrice: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AppliedPriceUpdate {
  organizationId: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  source: PriceUpdateSource;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class PriceUpdateService {
  /**
   * Apply a batch of price updates, ensuring persistence + engine sync + SSE broadcast
   */
  static async applyUpdates(
    updates: PriceUpdateInput[]
  ): Promise<AppliedPriceUpdate[]> {
    if (updates.length === 0) return [];

    await ensurePerpsEngineReady();
    const perpsEngine = getPerpsEngine();

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

      const organization = await prisma.organization.findUnique({
        where: { id: update.organizationId },
        select: { id: true, currentPrice: true },
      });

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

      await prisma.organization.update({
        where: { id: organization.id },
        data: { currentPrice: update.newPrice },
      });

      await db.recordPriceUpdate(
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
      perpsEngine.updatePositions(priceMap);

      try {
        broadcastToChannel('markets', {
          type: 'price_update',
          updates: appliedUpdates,
        });
      } catch (error) {
        logger.debug(
          'Failed to broadcast price updates',
          { error },
          'PriceUpdateService'
        );
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

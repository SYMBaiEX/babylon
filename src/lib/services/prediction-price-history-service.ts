import { Prisma } from '@prisma/client';
import type { PredictionPriceHistory } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { generateSnowflakeId } from '@/lib/snowflake';

export type PredictionHistoryEventType = 'trade' | 'resolution';
export type PredictionHistorySource = 'user_trade' | 'npc_trade' | 'system';

export interface PredictionPriceSnapshot {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesShares: number;
  noShares: number;
  liquidity: number;
  eventType: PredictionHistoryEventType;
  source: PredictionHistorySource;
  createdAt?: Date;
}

export class PredictionPriceHistoryService {
  static async recordSnapshot(
    snapshot: PredictionPriceSnapshot,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma;

    await client.predictionPriceHistory.create({
      data: {
        id: await generateSnowflakeId(),
        marketId: snapshot.marketId,
        yesPrice: snapshot.yesPrice,
        noPrice: snapshot.noPrice,
        yesShares: new Prisma.Decimal(snapshot.yesShares),
        noShares: new Prisma.Decimal(snapshot.noShares),
        liquidity: new Prisma.Decimal(snapshot.liquidity),
        eventType: snapshot.eventType,
        source: snapshot.source,
        createdAt: snapshot.createdAt ?? new Date(),
      },
    });
  }

  static async getHistory(
    marketId: string,
    limit = 200
  ): Promise<PredictionPriceHistory[]> {
    return prisma.predictionPriceHistory.findMany({
      where: { marketId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

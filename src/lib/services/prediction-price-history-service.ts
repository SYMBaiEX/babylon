import { Decimal, type Transaction } from '@/db';
import type { PredictionPriceHistory } from '@/db';

import { db, predictionPriceHistories, eq, desc } from '@/db';
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
    tx?: Transaction
  ): Promise<void> {
    const client = tx ?? db;

    await client.insert(predictionPriceHistories)
      .values({
        id: await generateSnowflakeId(),
        marketId: snapshot.marketId,
        yesPrice: snapshot.yesPrice,
        noPrice: snapshot.noPrice,
        yesShares: new Decimal(snapshot.yesShares).toString(),
        noShares: new Decimal(snapshot.noShares).toString(),
        liquidity: new Decimal(snapshot.liquidity).toString(),
        eventType: snapshot.eventType,
        source: snapshot.source,
        createdAt: snapshot.createdAt ?? new Date(),
      });
  }

  static async getHistory(
    marketId: string,
    limit = 200
  ): Promise<PredictionPriceHistory[]> {
    return db.select()
      .from(predictionPriceHistories)
      .where(eq(predictionPriceHistories.marketId, marketId))
      .orderBy(desc(predictionPriceHistories.createdAt))
      .limit(limit);
  }
}

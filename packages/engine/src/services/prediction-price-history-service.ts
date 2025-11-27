/**
 * Prediction Price History Service
 *
 * @description Records and retrieves price history snapshots for prediction markets.
 * Provides audit trail for market price movements over time.
 */

import type { PredictionPriceHistory } from '@babylon/db';
import {
  Decimal,
  db,
  desc,
  eq,
  predictionPriceHistories,
  type Transaction,
} from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';

export type PredictionHistoryEventType = 'trade' | 'resolution';
export type PredictionHistorySource = 'user_trade' | 'npc_trade' | 'system';

/**
 * Prediction price snapshot data
 *
 * @description Contains all data needed to record a price snapshot.
 */
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

/**
 * Prediction Price History Service Class
 *
 * @description Static service for recording and retrieving prediction market
 * price history. Used for charting and audit purposes.
 */
export class PredictionPriceHistoryService {
  /**
   * Record a price snapshot
   *
   * @description Records a price snapshot for a prediction market. Can be
   * called within an existing transaction or will use the default db.
   *
   * @param {PredictionPriceSnapshot} snapshot - Price snapshot data
   * @param {Transaction} [tx] - Optional transaction client
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * await PredictionPriceHistoryService.recordSnapshot({
   *   marketId: '123',
   *   yesPrice: 0.65,
   *   noPrice: 0.35,
   *   yesShares: 1000,
   *   noShares: 1000,
   *   liquidity: 2000,
   *   eventType: 'trade',
   *   source: 'user_trade',
   * });
   * ```
   */
  static async recordSnapshot(
    snapshot: PredictionPriceSnapshot,
    tx?: Transaction
  ): Promise<void> {
    const client = tx ?? db;

    await client.insert(predictionPriceHistories).values({
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

  /**
   * Get price history for a market
   *
   * @description Retrieves price history snapshots for a market, ordered by
   * most recent first.
   *
   * @param {string} marketId - Market ID
   * @param {number} [limit=200] - Maximum number of records to return
   * @returns {Promise<PredictionPriceHistory[]>} Array of price history records
   *
   * @example
   * ```typescript
   * const history = await PredictionPriceHistoryService.getHistory('123', 100);
   * ```
   */
  static async getHistory(
    marketId: string,
    limit = 200
  ): Promise<PredictionPriceHistory[]> {
    return db
      .select()
      .from(predictionPriceHistories)
      .where(eq(predictionPriceHistories.marketId, marketId))
      .orderBy(desc(predictionPriceHistories.createdAt))
      .limit(limit);
  }
}


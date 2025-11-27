/**
 * Prediction Market Service
 *
 * Unified service for prediction market operations:
 * - Broadcasting trade and resolution events to connected clients
 * - Recording and retrieving price history snapshots
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
import { generateSnowflakeId, logger } from '@babylon/shared';

// =============================================================================
// Types
// =============================================================================

type PredictionActorType = 'user' | 'npc' | 'system';

/**
 * Prediction trade event data
 */
export interface PredictionTradeEvent {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesShares: number;
  noShares: number;
  liquidity?: number;
  trade: {
    actorType: PredictionActorType;
    actorId?: string;
    action: 'buy' | 'sell' | 'close';
    side: 'yes' | 'no';
    shares: number;
    amount: number;
    price: number;
    source: 'user_trade' | 'npc_trade' | 'system';
    timestamp: string;
  };
}

/**
 * Prediction resolution event data
 */
export interface PredictionResolutionEvent {
  marketId: string;
  winningSide: 'yes' | 'no';
  yesShares: number;
  noShares: number;
  liquidity?: number;
  totalPayout: number;
  timestamp: string;
  resolutionProofUrl?: string;
  resolutionDescription?: string;
}

/**
 * Broadcaster function type for SSE/WebSocket
 */
export type BroadcasterFn = (
  channel: string,
  data: Record<string, unknown>
) => Promise<void>;

export type PredictionHistoryEventType = 'trade' | 'resolution';
export type PredictionHistorySource = 'user_trade' | 'npc_trade' | 'system';

/**
 * Prediction price snapshot data
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

// =============================================================================
// Prediction Market Service
// =============================================================================

export class PredictionMarketService {
  private static broadcaster: BroadcasterFn | null = null;

  // ---------------------------------------------------------------------------
  // Event Broadcasting
  // ---------------------------------------------------------------------------

  /**
   * Set the broadcaster function for emitting events
   */
  static setBroadcaster(broadcaster: BroadcasterFn): void {
    PredictionMarketService.broadcaster = broadcaster;
  }

  /**
   * Emit a prediction trade update event
   * Fires and forgets - errors are logged but don't propagate
   */
  static emitTradeUpdate(event: PredictionTradeEvent): void {
    logger.info(
      'Emitting prediction trade update',
      {
        marketId: event.marketId,
        side: event.trade.side,
        price: event.trade.price,
      },
      'PredictionMarketService'
    );

    if (!PredictionMarketService.broadcaster) {
      logger.debug(
        'No broadcaster configured, skipping event emission',
        { marketId: event.marketId },
        'PredictionMarketService'
      );
      return;
    }

    void PredictionMarketService.broadcaster('markets', {
      type: 'prediction_trade',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn(
        'Failed to broadcast prediction trade update',
        { error, marketId: event.marketId },
        'PredictionMarketService'
      );
    });
  }

  /**
   * Emit a prediction resolution event
   * Fires and forgets - errors are logged but don't propagate
   */
  static emitResolution(event: PredictionResolutionEvent): void {
    logger.info(
      'Emitting prediction resolution',
      { marketId: event.marketId, winningSide: event.winningSide },
      'PredictionMarketService'
    );

    if (!PredictionMarketService.broadcaster) {
      logger.debug(
        'No broadcaster configured, skipping resolution emission',
        { marketId: event.marketId },
        'PredictionMarketService'
      );
      return;
    }

    void PredictionMarketService.broadcaster('markets', {
      type: 'prediction_resolution',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn(
        'Failed to broadcast prediction resolution update',
        { error, marketId: event.marketId },
        'PredictionMarketService'
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Price History
  // ---------------------------------------------------------------------------

  /**
   * Record a price snapshot
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




/**
 * Prediction Market Event Service
 *
 * @description Handles broadcasting of prediction market events (trades, resolutions)
 * to connected clients. Uses an injectable broadcaster to allow different transport
 * mechanisms (SSE, WebSocket, etc.).
 */

import { logger } from '@babylon/shared';

type PredictionActorType = 'user' | 'npc' | 'system';

/**
 * Prediction trade event data
 *
 * @description Contains all data for a prediction market trade event.
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
 *
 * @description Contains all data for a prediction market resolution event.
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
 * Broadcaster function type
 *
 * @description Function signature for broadcasting events to a channel.
 * Can be implemented using SSE, WebSockets, Redis Pub/Sub, etc.
 */
export type BroadcasterFn = (
  channel: string,
  data: Record<string, unknown>
) => Promise<void>;

/**
 * Prediction Market Event Service Class
 *
 * @description Emits prediction market events to connected clients.
 * Uses an injectable broadcaster to allow different transport mechanisms.
 */
export class PredictionMarketEventService {
  private static broadcaster: BroadcasterFn | null = null;

  /**
   * Set the broadcaster function
   *
   * @description Injects the broadcaster function that will be used to send
   * events to connected clients. Should be called once during app initialization.
   *
   * @param {BroadcasterFn} broadcaster - Function to broadcast events
   *
   * @example
   * ```typescript
   * // In web app initialization
   * PredictionMarketEventService.setBroadcaster(broadcastToChannel);
   * ```
   */
  static setBroadcaster(broadcaster: BroadcasterFn): void {
    PredictionMarketEventService.broadcaster = broadcaster;
  }

  /**
   * Emit a prediction trade update event.
   * Fires and forgets - errors are logged but don't propagate to callers.
   *
   * @param {PredictionTradeEvent} event - Trade event data
   */
  static emitTradeUpdate(event: PredictionTradeEvent): void {
    logger.info(
      'Emitting prediction trade update',
      {
        marketId: event.marketId,
        side: event.trade.side,
        price: event.trade.price,
      },
      'PredictionMarketEventService'
    );

    if (!PredictionMarketEventService.broadcaster) {
      logger.debug(
        'No broadcaster configured, skipping event emission',
        { marketId: event.marketId },
        'PredictionMarketEventService'
      );
      return;
    }

    void PredictionMarketEventService.broadcaster('markets', {
      type: 'prediction_trade',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn(
        'Failed to broadcast prediction trade update',
        { error, marketId: event.marketId },
        'PredictionMarketEventService'
      );
    });
  }

  /**
   * Emit a prediction resolution event.
   * Fires and forgets - errors are logged but don't propagate to callers.
   *
   * @param {PredictionResolutionEvent} event - Resolution event data
   */
  static emitResolution(event: PredictionResolutionEvent): void {
    logger.info(
      'Emitting prediction resolution',
      { marketId: event.marketId, winningSide: event.winningSide },
      'PredictionMarketEventService'
    );

    if (!PredictionMarketEventService.broadcaster) {
      logger.debug(
        'No broadcaster configured, skipping resolution emission',
        { marketId: event.marketId },
        'PredictionMarketEventService'
      );
      return;
    }

    void PredictionMarketEventService.broadcaster('markets', {
      type: 'prediction_resolution',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn(
        'Failed to broadcast prediction resolution update',
        { error, marketId: event.marketId },
        'PredictionMarketEventService'
      );
    });
  }
}


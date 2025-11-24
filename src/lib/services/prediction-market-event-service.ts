import { logger } from '@/lib/logger';
import { broadcastToChannel } from '@/lib/sse/event-broadcaster';

type PredictionActorType = 'user' | 'npc' | 'system';

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

export class PredictionMarketEventService {
  /**
   * Emit a prediction trade update event.
   * Fires and forgets - errors are logged but don't propagate to callers.
   */
  static emitTradeUpdate(event: PredictionTradeEvent): void {
    logger.info('Emitting prediction trade update', { marketId: event.marketId, side: event.trade.side, price: event.trade.price }, 'PredictionMarketEventService');

    void broadcastToChannel('markets', {
      type: 'prediction_trade',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn('Failed to broadcast prediction trade update', { error, marketId: event.marketId }, 'PredictionMarketEventService');
    });
  }

  /**
   * Emit a prediction resolution event.
   * Fires and forgets - errors are logged but don't propagate to callers.
   */
  static emitResolution(event: PredictionResolutionEvent): void {
    logger.info('Emitting prediction resolution', { marketId: event.marketId, winningSide: event.winningSide }, 'PredictionMarketEventService');

    void broadcastToChannel('markets', {
      type: 'prediction_resolution',
      version: 'v1',
      ...event,
    }).catch((error) => {
      logger.warn('Failed to broadcast prediction resolution update', { error, marketId: event.marketId }, 'PredictionMarketEventService');
    });
  }
}

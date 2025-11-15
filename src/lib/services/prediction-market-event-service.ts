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
}

export class PredictionMarketEventService {
  static emitTradeUpdate(event: PredictionTradeEvent): void {
    try {
      broadcastToChannel('markets', {
        type: 'prediction_trade',
        ...event,
      });
    } catch (error) {
      logger.warn('Failed to broadcast prediction trade update', { error, marketId: event.marketId }, 'PredictionMarketEventService');
    }
  }

  static emitResolution(event: PredictionResolutionEvent): void {
    try {
      broadcastToChannel('markets', {
        type: 'prediction_resolution',
        ...event,
      });
    } catch (error) {
      logger.warn('Failed to broadcast prediction resolution update', { error, marketId: event.marketId }, 'PredictionMarketEventService');
    }
  }
}

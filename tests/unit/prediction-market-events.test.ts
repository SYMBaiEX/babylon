import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';

import * as broadcaster from '@/lib/sse/event-broadcaster';
import { PredictionMarketEventService } from '@/lib/services/prediction-market-event-service';

describe('PredictionMarketEventService', () => {
  let broadcastSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    broadcastSpy = spyOn(broadcaster, 'broadcastToChannel').mockImplementation(() => {});
  });

  afterEach(() => {
    broadcastSpy.mockRestore();
  });

  test('emitTradeUpdate broadcasts prediction trade event', () => {
    const payload = {
      marketId: 'market-1',
      yesPrice: 0.6,
      noPrice: 0.4,
      yesShares: 600,
      noShares: 400,
      liquidity: 1000,
      trade: {
        actorType: 'user' as const,
        actorId: 'user-1',
        action: 'buy' as const,
        side: 'yes' as const,
        shares: 10,
        amount: 12,
        price: 1.2,
        source: 'user_trade' as const,
        timestamp: new Date().toISOString(),
      },
    };

    PredictionMarketEventService.emitTradeUpdate(payload);

    expect(broadcastSpy).toHaveBeenCalledWith('markets', {
      type: 'prediction_trade',
      ...payload,
    });
  });

  test('emitResolution broadcasts prediction resolution event', () => {
    const payload = {
      marketId: 'market-2',
      winningSide: 'no' as const,
      yesShares: 450,
      noShares: 550,
      liquidity: 900,
      totalPayout: 120,
      timestamp: new Date().toISOString(),
    };

    PredictionMarketEventService.emitResolution(payload);

    expect(broadcastSpy).toHaveBeenCalledWith('markets', {
      type: 'prediction_resolution',
      ...payload,
    });
  });
});

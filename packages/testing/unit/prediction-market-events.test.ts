import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { PredictionMarketService } from '@babylon/engine';

describe('PredictionMarketService', () => {
  const mockBroadcaster = mock<
    (channel: string, data: Record<string, unknown>) => Promise<void>
  >(async () => {});

  beforeEach(() => {
    mockBroadcaster.mockClear();
    PredictionMarketService.setBroadcaster(mockBroadcaster);
  });

  afterEach(() => {
    // Clear broadcaster after each test
    PredictionMarketService.setBroadcaster(async () => {});
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

    PredictionMarketService.emitTradeUpdate(payload);

    expect(mockBroadcaster).toHaveBeenCalledWith('markets', {
      type: 'prediction_trade',
      version: 'v1',
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

    PredictionMarketService.emitResolution(payload);

    expect(mockBroadcaster).toHaveBeenCalledWith('markets', {
      type: 'prediction_resolution',
      version: 'v1',
      ...payload,
    });
  });
});

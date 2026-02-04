import { describe, expect, mock, test } from 'bun:test';

const mockApplyUpdates = mock(() => Promise.resolve([]));

mock.module('../services/price-update-service', () => ({
  PriceUpdateService: {
    applyUpdates: mockApplyUpdates,
  },
}));

// Note: StaticDataRegistry is NOT mocked to avoid polluting other test files.
// Organization methods are not needed for this specific test.

mock.module('@babylon/shared', () => ({
  logger: {
    debug: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
  },
}));

const now = new Date();
const mockDb = {
  select: mock(() => {
    const builder = {
      from: mock(() => builder),
      where: mock(() => builder),
      limit: mock(async () => [
        {
          activeModifiers: [],
          updatedAt: now,
        },
      ]),
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve([
          {
            id: 'org-1',
            currentPrice: 100,
            basePrice: 100,
          },
        ]).then(resolve),
    };
    return builder;
  }),
  update: mock(() => {
    const builder = {
      set: mock(() => builder),
      where: mock(() => builder),
      returning: mock(async () => [{ id: 'org-1' }]),
    };
    return builder;
  }),
};

mock.module('@babylon/db', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: mockDb,
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  organizationState: {
    id: 'id',
    activeModifiers: 'activeModifiers',
    basePrice: 'basePrice',
    currentPrice: 'currentPrice',
    sentiment: 'sentiment',
    updatedAt: 'updatedAt',
  },
  sql: (...args: unknown[]) => ({ sql: args }),
}));

import { applyEventToMarkets } from '../services/event-market-pipeline';

describe('EventMarketPipeline.applyEventToMarkets', () => {
  test('applies immediate price updates via PriceUpdateService', async () => {
    await applyEventToMarkets({
      arcId: 'arc-1',
      type: 'rumor',
      severity: 1,
      affectedActors: [],
      affectedStocks: ['org-1'],
      affectedQuestions: [],
      signalDirection: 'NEUTRAL',
      signalStrength: 0,
      marketImpacts: [
        {
          stockTicker: 'org-1',
          direction: 'up',
          magnitude: 'moderate',
          duration: 'hours',
        },
      ],
    });

    expect(mockApplyUpdates).toHaveBeenCalledTimes(1);
    const calls = mockApplyUpdates.mock.calls as unknown[][];
    const [updates] = (calls[0] ?? []) as [
      Array<{ organizationId: string; source: string; newPrice: number }>,
    ];
    expect(Array.isArray(updates)).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates?.[0]).toMatchObject({
      organizationId: 'org-1',
      source: 'event',
    });
    expect(updates?.[0]?.newPrice).toBeCloseTo(105, 8);
  });
});

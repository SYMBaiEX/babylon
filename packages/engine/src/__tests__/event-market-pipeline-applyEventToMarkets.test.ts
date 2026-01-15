import { describe, expect, mock, test } from 'bun:test';

const mockApplyUpdates = mock(() => Promise.resolve([]));

mock.module('../services/price-update-service', () => ({
  PriceUpdateService: {
    applyUpdates: mockApplyUpdates,
  },
}));

mock.module('../services/static-data-registry', () => ({
  StaticDataRegistry: {
    getAllOrganizations: () => [],
    getOrganization: () => null,
  },
}));

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
    const [updates] = mockApplyUpdates.mock.calls[0] ?? [];
    expect(Array.isArray(updates)).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates?.[0]).toMatchObject({
      organizationId: 'org-1',
      source: 'event',
    });
    expect(updates?.[0]?.newPrice).toBeCloseTo(105, 8);
  });
});

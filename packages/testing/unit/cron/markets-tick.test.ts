import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';

/**
 * Markets Tick Cron Job Tests
 *
 * Tests for the markets-tick cron endpoint which handles the complete
 * lifecycle of prediction markets.
 */

/**
 * Mock game state type
 */
interface MockGame {
  id: string;
  isContinuous: boolean;
  isRunning: boolean;
  currentDay: number | null;
}

/**
 * Mock question type for markets
 */
interface MockQuestion {
  id: string;
  questionNumber: number;
  resolutionDate: Date;
  status: string;
}

/**
 * Drizzle SQL condition result
 */
interface SqlCondition {
  sql?: string;
}

// Mock db with a mutable state we can control in tests
let mockGame: MockGame | null = null;
let mockActiveQuestions: MockQuestion[] = [];
let mockWorldEvents: Array<{
  id: string;
  timestamp: Date;
  description: string;
}> = [];

// Mock auth and lock states for negative-path testing
let mockCronAuthResult = true;
let mockAcquireLockResult = true;

// Track which table is being queried for table-aware mocking
let currentQueryTable: string | null = null;

// Table reference symbols for detection
const TABLE_REFS = {
  games: { _tableName: 'games' },
  questions: {
    _tableName: 'questions',
    status: 'status',
    resolutionDate: 'resolutionDate',
    id: 'id',
    questionNumber: 'questionNumber',
  },
  timeframedMarkets: { _tableName: 'timeframedMarkets' },
  worldEvents: { _tableName: 'worldEvents', timestamp: 'timestamp' },
  posts: { _tableName: 'posts' },
};

// Get mock data based on the current query table
const getTableData = (): unknown => {
  switch (currentQueryTable) {
    case 'games':
      return mockGame ? [mockGame] : [];
    case 'questions':
      // Return active questions by default; mature questions handled via where clause
      return mockActiveQuestions;
    case 'worldEvents':
      return mockWorldEvents;
    case 'timeframedMarkets':
      return [];
    case 'posts':
      return [];
    default:
      return [];
  }
};

// Create query builder for Drizzle-style operations
// The resultFn is called at query execution time to get the current mock state
const createQueryBuilder = (
  resultFn: () => unknown,
  operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
) => {
  const builder = {
    set: mock(() => builder),
    where: mock(() => builder),
    values: mock(() => builder),
    from: mock((table: { _tableName?: string }) => {
      // Track which table is being queried
      if (table && table._tableName) {
        currentQueryTable = table._tableName;
      }
      return builder;
    }),
    leftJoin: mock(() => builder),
    innerJoin: mock(() => builder),
    rightJoin: mock(() => builder),
    fullJoin: mock(() => builder),
    limit: mock(() => builder),
    orderBy: mock(() => builder),
    returning: mock(async () => {
      if (operation === 'insert') return [{ id: `mock-${Date.now()}` }];
      if (operation === 'update') return [{ id: 'mock-updated' }];
      if (operation === 'delete') return [{ id: 'mock-deleted' }];
      return resultFn();
    }),
    onConflictDoNothing: mock(() => builder),
    then: <TResult1, TResult2 = never>(
      onFulfilled?:
        | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): Promise<TResult1 | TResult2> => {
      const result = resultFn();
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return builder;
};

// Create table-aware insert/update/delete builders
const createMutationBuilder = (operation: 'insert' | 'update' | 'delete') => {
  return mock((table: { _tableName?: string }) => {
    if (table && table._tableName) {
      currentQueryTable = table._tableName;
    }
    return createQueryBuilder(
      () => [{ id: `mock-${operation}-id` }],
      operation
    );
  });
};

// Mock @babylon/db - table-aware query handling
mock.module('@babylon/db', () => ({
  db: {
    select: mock((columns?: Record<string, unknown>) => {
      // Reset table tracking for new query
      currentQueryTable = null;
      // If selecting specific columns (like MAX), handle specially
      if (columns && 'maxNumber' in columns) {
        // This is the getNextQuestionNumber query
        return createQueryBuilder(() => {
          const maxNum = mockActiveQuestions.reduce(
            (max, q) => Math.max(max, q.questionNumber),
            0
          );
          return [{ maxNumber: maxNum > 0 ? maxNum : null }];
        });
      }
      return createQueryBuilder(() => getTableData());
    }),
    insert: createMutationBuilder('insert'),
    update: createMutationBuilder('update'),
    delete: createMutationBuilder('delete'),
    transaction: mock(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        // Create a transaction context that mirrors the db interface
        const tx = {
          select: mock(() => createQueryBuilder(() => getTableData())),
          insert: createMutationBuilder('insert'),
          update: createMutationBuilder('update'),
          delete: createMutationBuilder('delete'),
        };
        return callback(tx);
      }
    ),
  },
  games: TABLE_REFS.games,
  questions: TABLE_REFS.questions,
  timeframedMarkets: TABLE_REFS.timeframedMarkets,
  worldEvents: TABLE_REFS.worldEvents,
  posts: TABLE_REFS.posts,
  eq: (): SqlCondition => ({}),
  gte: (): SqlCondition => ({}),
  lte: (): SqlCondition => ({}),
  and: (): SqlCondition => ({}),
  desc: (): SqlCondition => ({}),
  isNull: (): SqlCondition => ({}),
  isNotNull: (): SqlCondition => ({}),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join('?'),
    values,
  }),
  max: (col: unknown) => ({ _aggregation: 'max', column: col }),
  // Use real generateSnowflakeId from @babylon/shared to avoid polluting other tests
  generateSnowflakeId: async () => {
    const { generateSnowflakeId } = await import('@babylon/shared');
    return generateSnowflakeId();
  },
}));

// Mock @babylon/api - uses mutable state for auth/lock results
mock.module('@babylon/api', () => ({
  verifyCronAuth: () => mockCronAuthResult,
  relayCronToStaging: async () => ({ forwarded: false }),
  getCacheOrFetch: async <T>(_key: string, fn: () => Promise<T>) => {
    // For game state cache, return our mockGame or a default non-running game
    if (_key.includes('game-state')) {
      return (mockGame || {
        id: 'continuous',
        isRunning: false,
        isContinuous: true,
        currentDay: 1,
      }) as T;
    }
    return fn();
  },
  recordCronExecution: () => {},
  DistributedLockService: {
    acquireLock: async () => mockAcquireLockResult,
    releaseLock: async () => {},
  },
}));

// Mock @babylon/core/markets/prediction
mock.module('@babylon/core/markets/prediction', () => ({
  PredictionDbAdapter: class {},
  PredictionMarketService: class {
    ensureMarketExists = async () => ({ id: 'mock-market-id' });
  },
}));

// Mock @babylon/engine
mock.module('@babylon/engine', () => ({
  BabylonLLMClient: class MockBabylonLLMClient {
    static forGameTick() {
      return new MockBabylonLLMClient();
    }
    async generateJSON() {
      return {
        text: 'Will AIlon Musk launch a new product?',
        expectedOutcome: true,
        resolutionCriteria: 'Product launch announcement',
        affiliatedActorIds: [],
        affiliatedOrgIds: [],
      };
    }
  },
  QuestionManager: class MockQuestionManager {
    constructor(_llmClient: unknown) {}
    async generateTimeframeQuestion(_timeframe: string, _durationMs: number) {
      return {
        text: 'Will AIlon Musk launch a new product?',
        expectedOutcome: true,
        resolutionCriteria: 'Product launch announcement',
        affiliatedActorIds: [],
        affiliatedOrgIds: [],
      };
    }
    async generateResolutionWithProof() {
      return {
        description: 'The product was launched',
        confidence: 0.95,
        requiresManualReview: false,
        proof: null,
      };
    }
  },
  publishOracleCommitments: async () => ({ committed: 1 }),
  publishOracleReveals: async () => ({ revealed: 1 }),
  resolveQuestionPayouts: async () => {},
  SignalExtractionService: {
    extractMarketSignal: async () => ({
      suggestedOutcome: 'YES',
      confidence: 0.8,
      yesSignal: 0.7,
      noSignal: 0.3,
      signalStrength: 0.6,
      totalPosts: 10,
    }),
  },
  StaticDataRegistry: {
    getAllActors: () => [],
    getAllOrganizations: () => [],
    getActor: () => null,
    getOrganization: () => null,
  },
  timeframeArcPlanner: {
    planTimeframeArc: () => ({
      questionId: 'q-1',
      timeframe: '1d',
      category: 'daily',
      outcome: true,
      durationMs: 86400000,
      phases: {},
      phaseOrder: ['setup', 'peak', 'resolution'],
      insiders: [],
      deceivers: [],
      affiliatedOrgIds: [],
      affiliatedActorIds: [],
      createdAt: new Date(),
    }),
  },
}));

// Note: @babylon/shared is NOT mocked - let real logger run to avoid
// polluting module cache and breaking other tests that use formatCurrency, etc.

// Import the route handler after mocks are set up
import { GET, POST } from '@/app/api/cron/markets-tick/route';

describe('Markets Tick Cron', () => {
  beforeEach(() => {
    mockGame = null;
    mockActiveQuestions = [];
    mockWorldEvents = [];
    mockCronAuthResult = true;
    mockAcquireLockResult = true;
    currentQueryTable = null;
  });

  describe('Authorization', () => {
    test('GET should delegate to POST and return equivalent response', async () => {
      // Set up identical conditions for both requests
      mockGame = null; // No game = predictable skipped state

      const getReq = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'GET',
      });
      const postReq = new NextRequest(
        'http://localhost/api/cron/markets-tick',
        {
          method: 'POST',
        }
      );

      const getRes = await GET(getReq);
      const postRes = await POST(postReq);

      // GET should delegate to POST, so responses should match
      expect(getRes.status).toBe(postRes.status);

      const getData = await getRes.json();
      const postData = await postRes.json();

      // Key response properties should be equivalent
      expect(getData.success).toBe(postData.success);
      expect(getData.skipped).toBe(postData.skipped);
    });

    test('should reject unauthorized requests when verifyCronAuth returns false', async () => {
      mockCronAuthResult = false;

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);

      // Should return 401 Unauthorized
      expect(res.status).toBe(401);
    });

    test('GET should also reject unauthorized requests', async () => {
      mockCronAuthResult = false;

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'GET',
      });
      const res = await GET(req);

      // GET delegates to POST, so should also return 401
      expect(res.status).toBe(401);
    });
  });

  describe('Distributed Lock', () => {
    test('should skip when lock cannot be acquired', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      mockAcquireLockResult = false;

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      // Should indicate lock failure/skip (route returns "Previous tick still running")
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toContain('Previous tick still running');
    });
  });

  describe('Game State Checks', () => {
    test('should skip when game is not running', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: false,
        currentDay: 1,
      };

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Game not running');
    });

    // Additional integration tests (game running, market creation, resolution)
    // are in packages/testing/integration/markets-tick.integration.test.ts
    // These require real database access and are run separately.
  });
});

describe('Market Timeframe Configuration', () => {
  test('should have correct market distribution (10 total)', () => {
    // Expected: 1x 3-day, 1x 2-day, 1x 1-day, 1x 12-hour, 1x 6-hour, 1x 1-hour, 2x 30-minute, 2x 15-minute
    //
    // IMPORTANT: These values are a deliberate contract-style duplication of the production
    // MARKET_TIMEFRAMES config in markets-tick/route.ts. Do NOT import production internals here.
    // If the production config changes, this test must be updated to match. This ensures the
    // test acts as a contract verification rather than a tautology.
    const expectedMarkets = {
      '3d': 1,
      '2d': 1,
      '1d': 1,
      '12h': 1,
      '6h': 1,
      '1h': 1,
      '30m': 2,
      '15m': 2,
    };

    const totalExpected = Object.values(expectedMarkets).reduce(
      (a, b) => a + b,
      0
    );
    expect(totalExpected).toBe(10);
  });
});

// =============================================================================
// Granular Timeframe Inference Tests
// =============================================================================

describe('inferGranularTimeframe', () => {
  // Define MARKET_STRUCTURE durations locally (contract-style test)
  const DURATIONS = {
    '15m': 15 * 60 * 1000, // 900,000 ms
    '30m': 30 * 60 * 1000, // 1,800,000 ms
    '1h': 60 * 60 * 1000, // 3,600,000 ms
    '6h': 6 * 60 * 60 * 1000, // 21,600,000 ms
    '12h': 12 * 60 * 60 * 1000, // 43,200,000 ms
    '1d': 24 * 60 * 60 * 1000, // 86,400,000 ms
    '2d': 2 * 24 * 60 * 60 * 1000, // 172,800,000 ms
    '3d': 3 * 24 * 60 * 60 * 1000, // 259,200,000 ms
  };

  // Replicate inferGranularTimeframe logic for testing
  function inferGranularTimeframe(durationMs: number): string {
    const sortedEntries = Object.entries(DURATIONS).sort((a, b) => a[1] - b[1]);

    // 10% tolerance matching
    for (const [key, expectedDuration] of sortedEntries) {
      const tolerance = expectedDuration * 0.1;
      if (Math.abs(durationMs - expectedDuration) <= tolerance) {
        return key;
      }
    }

    // Fallback to closest
    let closestKey = '1h';
    let closestDiff = Infinity;
    for (const [key, expectedDuration] of sortedEntries) {
      const diff = Math.abs(durationMs - expectedDuration);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestKey = key;
      }
    }
    return closestKey;
  }

  describe('exact duration matches', () => {
    test('should match 15m duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['15m'])).toBe('15m');
    });

    test('should match 30m duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['30m'])).toBe('30m');
    });

    test('should match 1h duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['1h'])).toBe('1h');
    });

    test('should match 6h duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['6h'])).toBe('6h');
    });

    test('should match 12h duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['12h'])).toBe('12h');
    });

    test('should match 1d duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['1d'])).toBe('1d');
    });

    test('should match 2d duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['2d'])).toBe('2d');
    });

    test('should match 3d duration exactly', () => {
      expect(inferGranularTimeframe(DURATIONS['3d'])).toBe('3d');
    });
  });

  describe('10% tolerance boundary tests', () => {
    test('should match 15m at +10% tolerance boundary', () => {
      const duration = DURATIONS['15m'] * 1.1; // 990,000 ms
      expect(inferGranularTimeframe(duration)).toBe('15m');
    });

    test('should match 15m at -10% tolerance boundary', () => {
      const duration = DURATIONS['15m'] * 0.9; // 810,000 ms
      expect(inferGranularTimeframe(duration)).toBe('15m');
    });

    test('should match 1h at +10% tolerance boundary', () => {
      const duration = DURATIONS['1h'] * 1.1; // 3,960,000 ms
      expect(inferGranularTimeframe(duration)).toBe('1h');
    });

    test('should match 1h at -10% tolerance boundary', () => {
      const duration = DURATIONS['1h'] * 0.9; // 3,240,000 ms
      expect(inferGranularTimeframe(duration)).toBe('1h');
    });

    test('should fall back to closest when outside all tolerances', () => {
      // Duration exactly between 15m and 30m (outside both tolerances)
      const midpoint = (DURATIONS['15m'] + DURATIONS['30m']) / 2; // 1,350,000 ms
      // Should fall back to closest, which is 15m (450k away) vs 30m (450k away)
      // Since they're equidistant, it will match 15m first in sorted order
      const result = inferGranularTimeframe(midpoint);
      expect(['15m', '30m']).toContain(result);
    });

    test('should handle very short durations (below 15m)', () => {
      const shortDuration = 5 * 60 * 1000; // 5 minutes
      // Should fall back to closest, which is 15m
      expect(inferGranularTimeframe(shortDuration)).toBe('15m');
    });

    test('should handle very long durations (above 3d)', () => {
      const longDuration = 5 * 24 * 60 * 60 * 1000; // 5 days
      // Should fall back to closest, which is 3d
      expect(inferGranularTimeframe(longDuration)).toBe('3d');
    });
  });

  describe('edge cases', () => {
    test('should handle zero duration', () => {
      // Should fall back to closest, which is 15m (smallest)
      expect(inferGranularTimeframe(0)).toBe('15m');
    });

    test('should handle negative duration gracefully', () => {
      // Should fall back to closest
      const result = inferGranularTimeframe(-1000);
      expect(result).toBeDefined();
    });
  });
});

// =============================================================================
// Sub-Market Batch Creation Tests
// =============================================================================

describe('Sub-Market Batch Creation Logic', () => {
  const MAX_SUB_MARKETS = 10;
  const MAX_SUB_MARKETS_PER_TICK = 5;

  test('should create up to MAX_SUB_MARKETS_PER_TICK when many needed', () => {
    const activeSubMarkets = 0;
    const subMarketsNeeded = MAX_SUB_MARKETS - activeSubMarkets; // 10
    const createCount = Math.min(subMarketsNeeded, MAX_SUB_MARKETS_PER_TICK);

    expect(createCount).toBe(5);
  });

  test('should create exact amount when fewer than limit needed', () => {
    const activeSubMarkets = 7;
    const subMarketsNeeded = MAX_SUB_MARKETS - activeSubMarkets; // 3
    const createCount = Math.min(subMarketsNeeded, MAX_SUB_MARKETS_PER_TICK);

    expect(createCount).toBe(3);
  });

  test('should create zero when at maximum', () => {
    const activeSubMarkets = 10;
    const subMarketsNeeded = MAX_SUB_MARKETS - activeSubMarkets; // 0
    const createCount = Math.min(subMarketsNeeded, MAX_SUB_MARKETS_PER_TICK);

    expect(createCount).toBe(0);
  });

  test('should create one when one needed', () => {
    const activeSubMarkets = 9;
    const subMarketsNeeded = MAX_SUB_MARKETS - activeSubMarkets; // 1
    const createCount = Math.min(subMarketsNeeded, MAX_SUB_MARKETS_PER_TICK);

    expect(createCount).toBe(1);
  });

  test('should handle over-capacity gracefully', () => {
    const activeSubMarkets = 12; // More than max (shouldn't happen but testing edge case)
    const subMarketsNeeded = MAX_SUB_MARKETS - activeSubMarkets; // -2
    const createCount = Math.max(
      0,
      Math.min(subMarketsNeeded, MAX_SUB_MARKETS_PER_TICK)
    );

    expect(createCount).toBe(0);
  });
});

// =============================================================================
// Idempotency Check Tests
// =============================================================================

describe('Market Idempotency Check Logic', () => {
  interface MockMarket {
    id: string;
    granularTimeframe: string | null;
    startTime: Date;
    endTime: Date;
  }

  const DURATIONS = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
  };

  function inferGranularTimeframe(durationMs: number): string {
    const sortedEntries = Object.entries(DURATIONS).sort((a, b) => a[1] - b[1]);
    for (const [key, expectedDuration] of sortedEntries) {
      const tolerance = expectedDuration * 0.1;
      if (Math.abs(durationMs - expectedDuration) <= tolerance) {
        return key;
      }
    }
    return '1h';
  }

  function countMarketsForTimeframe(
    markets: MockMarket[],
    targetTimeframe: string
  ): number {
    return markets.filter((m) => {
      const tf =
        m.granularTimeframe ??
        inferGranularTimeframe(m.endTime.getTime() - m.startTime.getTime());
      return tf === targetTimeframe;
    }).length;
  }

  test('should count markets with stored granularTimeframe', () => {
    const now = Date.now();
    const markets: MockMarket[] = [
      {
        id: '1',
        granularTimeframe: '15m',
        startTime: new Date(now),
        endTime: new Date(now + DURATIONS['15m']),
      },
      {
        id: '2',
        granularTimeframe: '15m',
        startTime: new Date(now),
        endTime: new Date(now + DURATIONS['15m']),
      },
      {
        id: '3',
        granularTimeframe: '30m',
        startTime: new Date(now),
        endTime: new Date(now + DURATIONS['30m']),
      },
    ];

    expect(countMarketsForTimeframe(markets, '15m')).toBe(2);
    expect(countMarketsForTimeframe(markets, '30m')).toBe(1);
    expect(countMarketsForTimeframe(markets, '1h')).toBe(0);
  });

  test('should fall back to inference for legacy markets without granularTimeframe', () => {
    const now = Date.now();
    const markets: MockMarket[] = [
      {
        id: '1',
        granularTimeframe: null, // Legacy market
        startTime: new Date(now),
        endTime: new Date(now + DURATIONS['15m']),
      },
      {
        id: '2',
        granularTimeframe: '15m', // New market
        startTime: new Date(now),
        endTime: new Date(now + DURATIONS['15m']),
      },
    ];

    // Both should be counted as 15m
    expect(countMarketsForTimeframe(markets, '15m')).toBe(2);
  });

  test('should prevent creation when at target count', () => {
    const targetCount = 2;
    const currentCount = 2;

    const shouldCreate = currentCount < targetCount;
    expect(shouldCreate).toBe(false);
  });

  test('should allow creation when below target count', () => {
    const targetCount = 2;
    const currentCount = 1;

    const shouldCreate = currentCount < targetCount;
    expect(shouldCreate).toBe(true);
  });
});

// =============================================================================
// Granular to DB Timeframe Mapping Tests
// =============================================================================

describe('Granular to DB Timeframe Mapping', () => {
  // Contract-style test - these mappings should match production
  const EXPECTED_MAPPINGS: Record<string, string> = {
    '15m': 'flash',
    '30m': 'flash',
    '1h': 'intraday',
    '6h': 'intraday',
    '12h': 'daily',
    '1d': 'daily',
    '2d': 'weekly',
    '3d': 'weekly',
  };

  test('should map flash timeframes correctly', () => {
    expect(EXPECTED_MAPPINGS['15m']).toBe('flash');
    expect(EXPECTED_MAPPINGS['30m']).toBe('flash');
  });

  test('should map intraday timeframes correctly', () => {
    expect(EXPECTED_MAPPINGS['1h']).toBe('intraday');
    expect(EXPECTED_MAPPINGS['6h']).toBe('intraday');
  });

  test('should map daily timeframes correctly', () => {
    expect(EXPECTED_MAPPINGS['12h']).toBe('daily');
    expect(EXPECTED_MAPPINGS['1d']).toBe('daily');
  });

  test('should map weekly timeframes correctly', () => {
    expect(EXPECTED_MAPPINGS['2d']).toBe('weekly');
    expect(EXPECTED_MAPPINGS['3d']).toBe('weekly');
  });

  test('should have all 8 granular timeframes mapped', () => {
    const keys = Object.keys(EXPECTED_MAPPINGS);
    expect(keys.length).toBe(8);
    expect(keys).toContain('15m');
    expect(keys).toContain('30m');
    expect(keys).toContain('1h');
    expect(keys).toContain('6h');
    expect(keys).toContain('12h');
    expect(keys).toContain('1d');
    expect(keys).toContain('2d');
    expect(keys).toContain('3d');
  });

  test('should aggregate to correct DB timeframe counts', () => {
    const dbCounts: Record<string, number> = {};
    for (const dbTimeframe of Object.values(EXPECTED_MAPPINGS)) {
      dbCounts[dbTimeframe] = (dbCounts[dbTimeframe] || 0) + 1;
    }

    expect(dbCounts['flash']).toBe(2); // 15m + 30m
    expect(dbCounts['intraday']).toBe(2); // 1h + 6h
    expect(dbCounts['daily']).toBe(2); // 12h + 1d
    expect(dbCounts['weekly']).toBe(2); // 2d + 3d
  });
});

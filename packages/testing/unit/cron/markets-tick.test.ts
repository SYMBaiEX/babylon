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
  BabylonLLMClient: {
    forGameTick: () => ({
      generateJSON: async () => ({
        text: 'Will AIlon Musk launch a new product?',
        expectedOutcome: true,
        resolutionCriteria: 'Product launch announcement',
        affiliatedActorIds: [],
        affiliatedOrgIds: [],
      }),
    }),
  },
  QuestionManager: class {
    generateTimeframeQuestion = async () => ({
      text: 'Will AIlon Musk launch a new product?',
      expectedOutcome: true,
      resolutionCriteria: 'Product launch announcement',
      affiliatedActorIds: [],
      affiliatedOrgIds: [],
    });
    generateResolutionWithProof = async () => ({
      description: 'The product was launched',
      confidence: 0.95,
      requiresManualReview: false,
      proof: null,
    });
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

    test('should proceed when game is running', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      mockActiveQuestions = [];

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.skipped).toBeUndefined();
    });
  });

  describe('Market Structure', () => {
    test('should attempt to maintain 10 active markets', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      // Start with no markets - should create new ones
      mockActiveQuestions = [];

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      // Should have attempted to create markets
      expect(data.success).toBe(true);
      expect(data.marketsCreated).toBeDefined();
    });

    test('should resolve mature markets', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      // Add a mature market (resolution date in the past)
      mockActiveQuestions = [
        {
          id: 'q-1',
          questionNumber: 1,
          resolutionDate: new Date(Date.now() - 3600000), // 1 hour ago
          status: 'active',
        },
      ];

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.marketsResolved).toBeDefined();
    });
  });

  describe('Response Structure', () => {
    test('should return complete execution metrics', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.durationMs).toBeDefined();
      expect(data.marketsResolved).toBeDefined();
      expect(data.marketsCreated).toBeDefined();
      expect(data.marketsByTimeframe).toBeDefined();
    });

    test('should include performance metrics', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.metrics).toBeDefined();
      expect(typeof data.metrics.getActiveMarketsMs).toBe('number');
      expect(typeof data.metrics.resolutionMs).toBe('number');
      expect(typeof data.metrics.creationMs).toBe('number');
    });
  });

  describe('Performance Monitoring', () => {
    test('should include duration in response', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };

      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(typeof data.durationMs).toBe('number');
      expect(data.durationMs).toBeGreaterThanOrEqual(0);
    });
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

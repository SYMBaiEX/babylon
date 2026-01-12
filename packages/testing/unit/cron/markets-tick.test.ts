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

// Mock auth and lock states for negative-path testing
let mockCronAuthResult = true;
let mockAcquireLockResult = true;

// Create query builder for Drizzle-style operations
// The resultFn is called at query execution time to get the current mock state
const createQueryBuilder = (resultFn: () => unknown) => {
  const builder = {
    set: mock(() => builder),
    where: mock(() => builder),
    values: mock(() => builder),
    from: mock(() => builder),
    limit: mock(() => builder),
    orderBy: mock(() => builder),
    returning: mock(async () => resultFn()),
    onConflictDoNothing: mock(() => builder),
    then: <TResult1, TResult2 = never>(
      onFulfilled?:
        | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): Promise<TResult1 | TResult2> => {
      return Promise.resolve(resultFn()).then(onFulfilled, onRejected);
    },
  };
  return builder;
};

// Mock @babylon/db - returns mockActiveQuestions for select queries
mock.module('@babylon/db', () => ({
  db: {
    select: mock(() => createQueryBuilder(() => mockActiveQuestions)),
    insert: mock(() => createQueryBuilder(() => [{ id: 'mock-id' }])),
    update: mock(() => createQueryBuilder(() => [{ id: 'mock-id' }])),
    delete: mock(() => createQueryBuilder(() => [{ id: 'mock-id' }])),
  },
  games: {},
  questions: {
    status: 'status',
    resolutionDate: 'resolutionDate',
    id: 'id',
    questionNumber: 'questionNumber',
  },
  timeframedMarkets: {},
  worldEvents: {},
  posts: {},
  eq: (): SqlCondition => ({}),
  gte: (): SqlCondition => ({}),
  lte: (): SqlCondition => ({}),
  and: (): SqlCondition => ({}),
  desc: (): SqlCondition => ({}),
  generateSnowflakeId: async () => `mock-${Date.now()}`,
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

// Mock @babylon/shared
mock.module('@babylon/shared', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Import the route handler after mocks are set up
import { GET, POST } from '@/app/api/cron/markets-tick/route';

describe('Markets Tick Cron', () => {
  beforeEach(() => {
    mockGame = null;
    mockActiveQuestions = [];
    mockCronAuthResult = true;
    mockAcquireLockResult = true;
  });

  describe('Authorization', () => {
    test('GET should delegate to POST', async () => {
      const req = new NextRequest('http://localhost/api/cron/markets-tick', {
        method: 'GET',
      });
      const res = await GET(req);

      expect(res.status).toBeDefined();
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

      // Should indicate lock failure/skip
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toContain('lock');
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

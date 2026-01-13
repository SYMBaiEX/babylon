import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextRequest } from 'next/server';

/**
 * Article Tick Cron Job Tests
 *
 * Tests for the article-tick cron endpoint which handles centralized
 * article generation with rate limiting.
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
 * Drizzle SQL condition result
 */
interface SqlCondition {
  sql?: string;
}

// Mock db with a mutable state we can control in tests
let mockGame: MockGame | null = null;
let mockArticleCount = 0;

// Mock auth state for negative-path testing
let mockCronAuthResult = true;

// Create query builder for Drizzle-style operations
// The resultFn is called at query execution time to get the current mock state
// This mirrors the markets-tick.test.ts pattern for dynamic result evaluation
const createQueryBuilder = (
  resultFn: () => unknown = () => [{ id: 'mock-id' }]
) => {
  const builder = {
    set: mock(() => builder),
    where: mock(() => builder),
    values: mock(() => builder),
    from: mock(() => builder),
    limit: mock(() => builder),
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

// Mock @babylon/db - uses resultFn pattern for dynamic state evaluation
mock.module('@babylon/db', () => ({
  db: {
    select: mock(() => createQueryBuilder(() => (mockGame ? [mockGame] : []))),
    insert: mock(() =>
      createQueryBuilder(() => [{ id: `mock-${Date.now()}` }])
    ),
    update: mock(() => createQueryBuilder(() => [{ id: 'mock-updated' }])),
    delete: mock(() => createQueryBuilder(() => [{ id: 'mock-deleted' }])),
  },
  games: {},
  posts: { type: 'type', timestamp: 'timestamp', deletedAt: 'deletedAt' },
  eq: (): SqlCondition => ({}),
  gte: (): SqlCondition => ({}),
  and: (): SqlCondition => ({}),
  isNull: (): SqlCondition => ({}),
  sql: (): SqlCondition => ({}),
  generateSnowflakeId: async () => `mock-${Date.now()}`,
}));

// Mock @babylon/api - uses mutable state for auth and game cache
mock.module('@babylon/api', () => ({
  verifyCronAuth: () => mockCronAuthResult,
  relayCronToStaging: async () => ({ forwarded: false }),
  getCacheOrFetch: async <T>(_key: string, fn: () => Promise<T>) => {
    // For game state cache, return our mockGame
    if (_key === 'continuous-game') {
      return mockGame as T;
    }
    return fn();
  },
  recordCronExecution: () => {},
  DistributedLockService: {
    acquireLock: async () => true,
    releaseLock: async () => {},
  },
}));

// Mock @babylon/engine - articleRateLimiter uses mockArticleCount
mock.module('@babylon/engine', () => ({
  articleRateLimiter: {
    canGenerateArticle: async () => ({
      allowed: mockArticleCount < 2,
      currentCount: mockArticleCount,
      maxAllowed: 2,
      remaining: Math.max(0, 2 - mockArticleCount),
    }),
  },
  ArticleGenerator: class {
    generateArticleForQuestion = async () => ({
      title: 'Test Article',
      summary: 'Test summary',
      content: 'Test content',
      byline: 'Test Author',
    });
  },
  BabylonLLMClient: {
    forGameTick: () => ({
      generateJSON: async () => ({
        title: 'Test Article',
        summary: 'Test summary',
        article: 'Test article body',
      }),
    }),
  },
  characterMappingService: {
    transformText: async (text: string) => ({ transformedText: text }),
  },
  generateArticleImageWithRetry: async () => null,
  getActiveEventsForPosting: async () => ({ activeEvents: [] }),
  hasEventBeenCovered: () => false,
  markEventAsCovered: () => {},
  StaticDataRegistry: {
    getOrganizationsByType: () => [
      { id: 'org-1', name: 'Test News', description: 'A news org' },
    ],
    getTopActors: () => [],
  },
  secureRandom: () => Math.random(),
  worldFactsService: {
    generatePromptContext: async () => 'Test world facts context',
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
import { GET, POST } from '@/app/api/cron/article-tick/route';

describe('Article Tick Cron', () => {
  beforeEach(() => {
    mockGame = null;
    mockArticleCount = 0;
    mockCronAuthResult = true;
  });

  describe('Authorization', () => {
    test('should reject unauthorized requests when verifyCronAuth returns false', async () => {
      mockCronAuthResult = false;

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    test('GET should delegate to POST and return identical response', async () => {
      // Set up a known game state so we get predictable responses
      mockGame = null; // No game = skipped state

      // Create identical requests for GET and POST
      const getReq = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'GET',
      });
      const postReq = new NextRequest(
        'http://localhost/api/cron/article-tick',
        {
          method: 'POST',
        }
      );

      // Call both handlers
      const getRes = await GET(getReq);
      const postRes = await POST(postReq);

      // Both should return the same status
      expect(getRes.status).toBe(postRes.status);

      // Both should return the same response body
      const getBody = await getRes.json();
      const postBody = await postRes.json();

      expect(getBody.success).toBe(postBody.success);
      expect(getBody.skipped).toBe(postBody.skipped);
      expect(getBody.reason).toBe(postBody.reason);

      // Verify the expected behavior (skipped because no game)
      expect(getBody.success).toBe(true);
      expect(getBody.skipped).toBe(true);
      expect(getBody.reason).toBe('No continuous game found');
    });
  });

  describe('Game State Checks', () => {
    test('should be skipped when no continuous game exists', async () => {
      mockGame = null;

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('No continuous game found');
    });

    test('should be paused when game.isRunning is false', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: false,
        currentDay: 1,
      };

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Game is paused');
    });
  });

  describe('Rate Limiting', () => {
    test('should skip when rate limit reached', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      mockArticleCount = 2; // At limit

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Rate limit reached');
    });

    test('should proceed when under rate limit', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      mockArticleCount = 0; // Under limit

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      // Positive assertions: handler succeeded and actually processed
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(false);

      // Should not be skipped due to rate limit
      expect(data.reason).not.toBe('Rate limit reached');
    });
  });

  describe('Response Structure', () => {
    test('should return rate limit info in response', async () => {
      mockGame = {
        id: 'game-123',
        isContinuous: true,
        isRunning: true,
        currentDay: 1,
      };
      mockArticleCount = 1; // Under limit (2), so processing should proceed

      const req = new NextRequest('http://localhost/api/cron/article-tick', {
        method: 'POST',
      });
      const res = await POST(req);
      const data = await res.json();

      // Verify handler succeeded and was not skipped
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(false); // Explicit assertion - test fails if skipped

      // Rate limit info should always be included when not skipped
      expect(data.rateLimit).toBeDefined();
      expect(data.rateLimit.currentCount).toBe(1);
      expect(data.rateLimit.maxAllowed).toBe(2);
    });
  });
});

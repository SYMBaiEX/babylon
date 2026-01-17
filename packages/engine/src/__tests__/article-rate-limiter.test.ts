/**
 * Article Rate Limiter Service Tests
 *
 * Tests for the ArticleRateLimiterService which prevents article flooding
 * by enforcing hourly limits.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  ArticleRateLimiterService,
  BreakingArticleRateLimiterService,
  createArticleRateLimiter,
} from '../services/article-rate-limiter';

// Mock the database module
const mockDb = {
  select: mock(() => mockDb),
  from: mock(() => mockDb),
  where: mock(() => Promise.resolve([{ count: 0 }])),
};

mock.module('@babylon/db', () => ({
  db: mockDb,
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  gte: (a: unknown, b: unknown) => [a, b],
  isNull: (a: unknown) => [a],
  posts: { type: 'type', timestamp: 'timestamp', deletedAt: 'deletedAt' },
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

describe('ArticleRateLimiterService', () => {
  beforeEach(() => {
    // Reset mock call counts
    mockDb.select.mockClear();
    mockDb.from.mockClear();
    mockDb.where.mockClear();
    // Default to 0 articles
    mockDb.where.mockImplementation(() => Promise.resolve([{ count: 0 }]));
  });

  describe('constructor', () => {
    test('uses default config when no config provided', () => {
      const limiter = new ArticleRateLimiterService();
      const config = limiter.getConfig();

      // Default is 2 per hour for a calmer news feed (configurable via ARTICLE_RATE_LIMIT_PER_HOUR env var)
      expect(config.maxArticlesPerHour).toBe(2);
      expect(config.windowMs).toBe(60 * 60 * 1000);
    });

    test('accepts partial config and merges with defaults', () => {
      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 5 });
      const config = limiter.getConfig();

      expect(config.maxArticlesPerHour).toBe(5);
      expect(config.windowMs).toBe(60 * 60 * 1000); // default
    });

    test('accepts full custom config', () => {
      const limiter = new ArticleRateLimiterService({
        maxArticlesPerHour: 10,
        windowMs: 30 * 60 * 1000, // 30 minutes
      });
      const config = limiter.getConfig();

      expect(config.maxArticlesPerHour).toBe(10);
      expect(config.windowMs).toBe(30 * 60 * 1000);
    });
  });

  describe('getRecentArticleCount', () => {
    test('returns 0 when no articles exist', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 0 }]));

      const limiter = new ArticleRateLimiterService();
      const count = await limiter.getRecentArticleCount();

      expect(count).toBe(0);
    });

    test('returns correct count when articles exist', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 5 }]));

      const limiter = new ArticleRateLimiterService();
      const count = await limiter.getRecentArticleCount();

      expect(count).toBe(5);
    });

    test('handles null result gracefully', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([null]));

      const limiter = new ArticleRateLimiterService();
      const count = await limiter.getRecentArticleCount();

      expect(count).toBe(0);
    });

    test('handles empty result gracefully', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([]));

      const limiter = new ArticleRateLimiterService();
      const count = await limiter.getRecentArticleCount();

      expect(count).toBe(0);
    });
  });

  describe('canGenerateArticle', () => {
    test('allows generation when under limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 0 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.maxAllowed).toBe(2);
      expect(result.remaining).toBe(2);
    });

    test('allows generation when exactly one under limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 1 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.remaining).toBe(1);
    });

    test('blocks generation when at limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 2 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(2);
      expect(result.maxAllowed).toBe(2);
      expect(result.remaining).toBe(0);
    });

    test('blocks generation when over limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 5 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0); // remaining is clamped to 0
    });
  });

  describe('getRemainingSlots', () => {
    test('returns correct remaining slots', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 1 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 5 });
      const remaining = await limiter.getRemainingSlots();

      expect(remaining).toBe(4);
    });

    test('returns 0 when at limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 5 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 5 });
      const remaining = await limiter.getRemainingSlots();

      expect(remaining).toBe(0);
    });
  });

  describe('checkAndLog', () => {
    test('returns true when under limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 0 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const allowed = await limiter.checkAndLog('test-source');

      expect(allowed).toBe(true);
    });

    test('returns false when at limit', async () => {
      mockDb.where.mockImplementation(() => Promise.resolve([{ count: 2 }]));

      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 2 });
      const allowed = await limiter.checkAndLog('test-source');

      expect(allowed).toBe(false);
    });
  });

  describe('getConfig', () => {
    test('returns a copy of the config', () => {
      const limiter = new ArticleRateLimiterService({ maxArticlesPerHour: 5 });
      const config1 = limiter.getConfig();
      const config2 = limiter.getConfig();

      expect(config1).not.toBe(config2); // Different object references
      expect(config1).toEqual(config2); // Same values
    });
  });
});

describe('createArticleRateLimiter', () => {
  test('creates a limiter with custom config', () => {
    const limiter = createArticleRateLimiter({ maxArticlesPerHour: 10 });
    const config = limiter.getConfig();

    expect(config.maxArticlesPerHour).toBe(10);
  });

  test('throws error for maxArticlesPerHour <= 0', () => {
    expect(() => createArticleRateLimiter({ maxArticlesPerHour: 0 })).toThrow(
      'maxArticlesPerHour must be a positive number'
    );

    expect(() => createArticleRateLimiter({ maxArticlesPerHour: -1 })).toThrow(
      'maxArticlesPerHour must be a positive number'
    );
  });

  test('throws error for windowMs <= 0', () => {
    expect(() => createArticleRateLimiter({ windowMs: 0 })).toThrow(
      'windowMs must be a positive number'
    );

    expect(() => createArticleRateLimiter({ windowMs: -1000 })).toThrow(
      'windowMs must be a positive number'
    );
  });

  test('allows valid positive values', () => {
    const limiter = createArticleRateLimiter({
      maxArticlesPerHour: 1,
      windowMs: 1000,
    });
    const config = limiter.getConfig();

    expect(config.maxArticlesPerHour).toBe(1);
    expect(config.windowMs).toBe(1000);
  });

  test('allows undefined values (uses defaults)', () => {
    const limiter = createArticleRateLimiter({});
    const config = limiter.getConfig();

    // Default is 2 per hour for a calmer news feed (configurable via ARTICLE_RATE_LIMIT_PER_HOUR env var)
    expect(config.maxArticlesPerHour).toBe(2);
    expect(config.windowMs).toBe(60 * 60 * 1000);
  });
});

describe('BreakingArticleRateLimiterService', () => {
  describe('constructor', () => {
    test('uses default config when no config provided', () => {
      const limiter = new BreakingArticleRateLimiterService();
      const config = limiter.getConfig();

      // Default is 1 per hour for breaking articles
      expect(config.maxArticlesPerHour).toBe(1);
      expect(config.windowMs).toBe(60 * 60 * 1000);
    });

    test('accepts custom config', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 5,
        windowMs: 30 * 60 * 1000,
      });
      const config = limiter.getConfig();

      expect(config.maxArticlesPerHour).toBe(5);
      expect(config.windowMs).toBe(30 * 60 * 1000);
    });
  });

  describe('getRecentArticleCount', () => {
    test('returns 0 when no articles recorded', () => {
      const limiter = new BreakingArticleRateLimiterService();
      expect(limiter.getRecentArticleCount()).toBe(0);
    });

    test('returns correct count after recording articles', () => {
      const limiter = new BreakingArticleRateLimiterService();
      limiter.recordBreakingArticle();
      limiter.recordBreakingArticle();

      expect(limiter.getRecentArticleCount()).toBe(2);
    });

    test('cleans up expired timestamps', () => {
      const limiter = new BreakingArticleRateLimiterService({
        windowMs: 1000, // 1 second window
      });

      // Record an article with a timestamp outside the window
      const oldTimestamp = Date.now() - 2000; // 2 seconds ago
      limiter.recordBreakingArticle(oldTimestamp);

      // The old timestamp should be cleaned up
      expect(limiter.getRecentArticleCount()).toBe(0);
    });
  });

  describe('canGenerateArticle', () => {
    test('allows generation when under limit', async () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 2,
      });

      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.maxAllowed).toBe(2);
      expect(result.remaining).toBe(2);
    });

    test('blocks generation when at limit', async () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 1,
      });
      limiter.recordBreakingArticle();

      const result = await limiter.canGenerateArticle();

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(1);
      expect(result.remaining).toBe(0);
    });

    test('cleans up expired timestamps before checking', async () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 1,
        windowMs: 1000,
      });

      // Record with old timestamp
      limiter.recordBreakingArticle(Date.now() - 2000);

      // Should allow since old timestamp is expired
      const result = await limiter.canGenerateArticle();
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
    });
  });

  describe('tryReserveSlot', () => {
    test('reserves slot when under limit', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 2,
      });

      const reserved = limiter.tryReserveSlot();

      expect(reserved).toBe(true);
      expect(limiter.getRecentArticleCount()).toBe(1);
    });

    test('fails to reserve when at limit', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 1,
      });
      limiter.recordBreakingArticle();

      const reserved = limiter.tryReserveSlot();

      expect(reserved).toBe(false);
      expect(limiter.getRecentArticleCount()).toBe(1); // Still just 1
    });

    test('multiple reservations consume slots', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 3,
      });

      expect(limiter.tryReserveSlot()).toBe(true);
      expect(limiter.tryReserveSlot()).toBe(true);
      expect(limiter.tryReserveSlot()).toBe(true);
      expect(limiter.tryReserveSlot()).toBe(false); // 4th should fail

      expect(limiter.getRecentArticleCount()).toBe(3);
    });
  });

  describe('releaseSlot', () => {
    test('releases a reserved slot', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 1,
      });
      limiter.tryReserveSlot();

      expect(limiter.getRecentArticleCount()).toBe(1);

      const released = limiter.releaseSlot();

      expect(released).toBe(true);
      expect(limiter.getRecentArticleCount()).toBe(0);
    });

    test('returns false when no slots to release', () => {
      const limiter = new BreakingArticleRateLimiterService();

      const released = limiter.releaseSlot();

      expect(released).toBe(false);
    });

    test('allows new reservation after release', () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 1,
      });

      limiter.tryReserveSlot();
      expect(limiter.tryReserveSlot()).toBe(false); // At limit

      limiter.releaseSlot();
      expect(limiter.tryReserveSlot()).toBe(true); // Can reserve again
    });
  });

  describe('recordBreakingArticle', () => {
    test('records article with current timestamp by default', () => {
      const limiter = new BreakingArticleRateLimiterService();
      limiter.recordBreakingArticle();

      expect(limiter.getRecentArticleCount()).toBe(1);
    });

    test('records article with custom timestamp', () => {
      const limiter = new BreakingArticleRateLimiterService({
        windowMs: 60000,
      });
      const customTimestamp = Date.now() - 30000; // 30 seconds ago (within window)
      limiter.recordBreakingArticle(customTimestamp);

      expect(limiter.getRecentArticleCount()).toBe(1);
    });
  });

  describe('getRemainingSlots', () => {
    test('returns correct remaining slots', async () => {
      const limiter = new BreakingArticleRateLimiterService({
        maxArticlesPerHour: 3,
      });
      limiter.recordBreakingArticle();

      const remaining = await limiter.getRemainingSlots();

      expect(remaining).toBe(2);
    });
  });

  describe('reset', () => {
    test('clears all recorded articles', () => {
      const limiter = new BreakingArticleRateLimiterService();
      limiter.recordBreakingArticle();
      limiter.recordBreakingArticle();

      expect(limiter.getRecentArticleCount()).toBe(2);

      limiter.reset();

      expect(limiter.getRecentArticleCount()).toBe(0);
    });
  });

  describe('window boundary behavior', () => {
    test('articles just inside window are counted', () => {
      const limiter = new BreakingArticleRateLimiterService({
        windowMs: 60000, // 1 minute
        maxArticlesPerHour: 2,
      });

      // Record article 30 seconds ago (inside window)
      limiter.recordBreakingArticle(Date.now() - 30000);

      expect(limiter.getRecentArticleCount()).toBe(1);
    });

    test('articles just outside window are not counted', () => {
      const limiter = new BreakingArticleRateLimiterService({
        windowMs: 60000, // 1 minute
        maxArticlesPerHour: 2,
      });

      // Record article 61 seconds ago (outside window)
      limiter.recordBreakingArticle(Date.now() - 61000);

      expect(limiter.getRecentArticleCount()).toBe(0);
    });
  });
});

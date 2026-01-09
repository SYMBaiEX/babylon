/**
 * Article Rate Limiter Service Tests
 *
 * Tests for the ArticleRateLimiterService which prevents article flooding
 * by enforcing hourly limits.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  ArticleRateLimiterService,
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

      // Default is 6 per hour (configurable via ARTICLE_RATE_LIMIT_PER_HOUR env var)
      expect(config.maxArticlesPerHour).toBe(6);
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

    // Default is 6 per hour (configurable via ARTICLE_RATE_LIMIT_PER_HOUR env var)
    expect(config.maxArticlesPerHour).toBe(6);
    expect(config.windowMs).toBe(60 * 60 * 1000);
  });
});

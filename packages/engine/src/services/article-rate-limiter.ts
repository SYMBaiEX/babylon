/**
 * Article Rate Limiter Service
 *
 * Prevents article flooding by enforcing hourly limits across all generation sources.
 * Articles are generated from multiple places (game-tick, organization-tick, arc events)
 * and this service ensures the total doesn't overwhelm the feed.
 *
 * @module services/article-rate-limiter
 */

import { and, db, eq, gte, isNull, posts, sql } from '@babylon/db';
import { logger } from '@babylon/shared';

/**
 * Configuration for article rate limiting
 */
export interface ArticleRateLimitConfig {
  /** Maximum articles allowed per hour across all sources */
  maxArticlesPerHour: number;
  /** Time window in milliseconds (default: 1 hour) */
  windowMs?: number;
}

/**
 * Default rate limit for articles per hour.
 * Used when env var is missing or invalid.
 */
const DEFAULT_MAX_ARTICLES_PER_HOUR = 2;

/**
 * Parse and validate the ARTICLE_RATE_LIMIT_PER_HOUR environment variable.
 * Returns the default value if the env var is missing, NaN, or <= 0.
 *
 * @returns A valid positive integer for max articles per hour
 */
function parseMaxArticlesPerHour(): number {
  const envValue = process.env.ARTICLE_RATE_LIMIT_PER_HOUR;

  if (!envValue) {
    return DEFAULT_MAX_ARTICLES_PER_HOUR;
  }

  const parsed = parseInt(envValue, 10);

  if (Number.isNaN(parsed)) {
    logger.warn(
      `Invalid ARTICLE_RATE_LIMIT_PER_HOUR value: "${envValue}" is not a number. Using default: ${DEFAULT_MAX_ARTICLES_PER_HOUR}`,
      { envValue, default: DEFAULT_MAX_ARTICLES_PER_HOUR },
      'ArticleRateLimiter'
    );
    return DEFAULT_MAX_ARTICLES_PER_HOUR;
  }

  if (parsed <= 0) {
    logger.warn(
      `Invalid ARTICLE_RATE_LIMIT_PER_HOUR value: ${parsed} must be > 0. Using default: ${DEFAULT_MAX_ARTICLES_PER_HOUR}`,
      { envValue, parsed, default: DEFAULT_MAX_ARTICLES_PER_HOUR },
      'ArticleRateLimiter'
    );
    return DEFAULT_MAX_ARTICLES_PER_HOUR;
  }

  return parsed;
}

/**
 * Default configuration for article rate limiting.
 *
 * The limit can be configured via environment variable:
 * - ARTICLE_RATE_LIMIT_PER_HOUR: Max articles per hour (default: 2)
 *
 * @remarks
 * A limit of 2 articles per hour provides a calmer news feed:
 * - ~1 article every 30 minutes on average
 * - Prevents article flooding that drowns out user/agent content
 * - Sustainable for LLM cost management
 * - Articles are high-effort content that should feel special
 */
const DEFAULT_CONFIG: Required<ArticleRateLimitConfig> = {
  maxArticlesPerHour: parseMaxArticlesPerHour(),
  windowMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Article Rate Limiter Service
 *
 * Tracks article creation across all sources and enforces hourly limits.
 * Uses database queries to count recent articles, ensuring consistency
 * across multiple cron job instances.
 */
export class ArticleRateLimiterService {
  private config: Required<ArticleRateLimitConfig>;

  constructor(config: Partial<ArticleRateLimitConfig> = {}) {
    this.config = {
      maxArticlesPerHour:
        config.maxArticlesPerHour ?? DEFAULT_CONFIG.maxArticlesPerHour,
      windowMs: config.windowMs ?? DEFAULT_CONFIG.windowMs,
    } satisfies Required<ArticleRateLimitConfig>;
  }

  /**
   * Get the count of articles created in the current time window
   */
  async getRecentArticleCount(): Promise<number> {
    const windowStart = new Date(Date.now() - this.config.windowMs);

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(
        and(
          eq(posts.type, 'article'),
          gte(posts.timestamp, windowStart),
          isNull(posts.deletedAt)
        )
      );

    return result?.count ?? 0;
  }

  /**
   * Check if more articles can be generated
   *
   * @returns Object with allowed status and remaining slots
   */
  async canGenerateArticle(): Promise<{
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
    remaining: number;
  }> {
    const currentCount = await this.getRecentArticleCount();
    const remaining = Math.max(
      0,
      this.config.maxArticlesPerHour - currentCount
    );

    const result = {
      allowed: currentCount < this.config.maxArticlesPerHour,
      currentCount,
      maxAllowed: this.config.maxArticlesPerHour,
      remaining,
    };

    if (!result.allowed) {
      logger.debug(
        'Article generation blocked by rate limit',
        {
          currentCount,
          maxAllowed: this.config.maxArticlesPerHour,
          windowMinutes: Math.round(this.config.windowMs / 60000),
        },
        'ArticleRateLimiter'
      );
    }

    return result;
  }

  /**
   * Get the number of articles that can still be generated this hour
   */
  async getRemainingSlots(): Promise<number> {
    const { remaining } = await this.canGenerateArticle();
    return remaining;
  }

  /**
   * Check rate limit and log status
   * Convenience method for use at the start of article generation
   */
  async checkAndLog(source: string): Promise<boolean> {
    const { allowed, currentCount, maxAllowed, remaining } =
      await this.canGenerateArticle();

    if (allowed) {
      logger.info(
        `Article rate limit check passed`,
        {
          source,
          currentCount,
          maxAllowed,
          remaining,
        },
        'ArticleRateLimiter'
      );
    } else {
      logger.warn(
        `Article rate limit exceeded - skipping generation`,
        {
          source,
          currentCount,
          maxAllowed,
        },
        'ArticleRateLimiter'
      );
    }

    return allowed;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ArticleRateLimitConfig> {
    return { ...this.config };
  }
}

/**
 * Singleton instance with default config (2 articles per hour, configurable via env).
 *
 * @remarks
 * **Concurrency Note**: The check-then-act pattern (`canGenerateArticle()` followed
 * by article creation) is NOT atomic. In concurrent environments (e.g., multiple
 * cron jobs, parallel article generation), race conditions may cause the configured
 * limit to be exceeded by 1-2 articles occasionally.
 *
 * This is acceptable for our use case because:
 * 1. The limit is for feed quality, not billing or hard caps
 * 2. Cron jobs run sequentially within their own process
 * 3. Occasional over-by-one has minimal user impact
 *
 * For stricter enforcement, consider:
 * - Distributed locks (Redis SETNX)
 * - Database row-level locking with SELECT FOR UPDATE
 * - Optimistic locking with version counters
 */
export const articleRateLimiter = new ArticleRateLimiterService();

/**
 * Create a custom rate limiter with different limits.
 *
 * @remarks
 * **TOCTOU Note**: The check-then-act pattern (`canGenerateArticle()` followed
 * by article creation) is not atomic. Concurrent processes may occasionally
 * exceed the limit by one. This is acceptable for typical in-memory/cron usage
 * with low rate limits. For strict enforcement, use external coordination
 * (e.g., distributed lock or centralized counter).
 *
 * @example
 * ```typescript
 * const limiter = createArticleRateLimiter({ maxArticlesPerHour: 5 });
 * const { allowed } = await limiter.canGenerateArticle();
 * if (allowed) {
 *   // Generate article
 * }
 * ```
 */
export function createArticleRateLimiter(
  config: Partial<ArticleRateLimitConfig>
): ArticleRateLimiterService {
  if (config.maxArticlesPerHour !== undefined) {
    if (Number.isNaN(config.maxArticlesPerHour)) {
      throw new Error('maxArticlesPerHour cannot be NaN');
    }
    if (config.maxArticlesPerHour <= 0) {
      throw new Error('maxArticlesPerHour must be a positive number');
    }
  }
  if (config.windowMs !== undefined) {
    if (Number.isNaN(config.windowMs)) {
      throw new Error('windowMs cannot be NaN');
    }
    if (config.windowMs <= 0) {
      throw new Error('windowMs must be a positive number');
    }
  }
  return new ArticleRateLimiterService(config);
}

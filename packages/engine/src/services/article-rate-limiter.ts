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
 * Parse and validate a positive integer environment variable.
 * Returns the default value if the env var is missing, NaN, or <= 0.
 *
 * @param envVarName - Name of the environment variable to parse
 * @param defaultValue - Default value to use if parsing fails
 * @param logContext - Context string for logging (e.g., 'ArticleRateLimiter')
 * @returns A valid positive integer
 */
function parsePositiveIntEnvVar(
  envVarName: string,
  defaultValue: number,
  logContext: string
): number {
  const envValue = process.env[envVarName];

  if (!envValue) {
    return defaultValue;
  }

  const parsed = parseInt(envValue, 10);

  if (Number.isNaN(parsed)) {
    logger.warn(
      `Invalid ${envVarName} value: "${envValue}" is not a number. Using default: ${defaultValue}`,
      { envValue, default: defaultValue },
      logContext
    );
    return defaultValue;
  }

  if (parsed <= 0) {
    logger.warn(
      `Invalid ${envVarName} value: ${parsed} must be > 0. Using default: ${defaultValue}`,
      { envValue, parsed, default: defaultValue },
      logContext
    );
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse and validate the ARTICLE_RATE_LIMIT_PER_HOUR environment variable.
 * Returns the default value if the env var is missing, NaN, or <= 0.
 *
 * @returns A valid positive integer for max articles per hour
 */
function parseMaxArticlesPerHour(): number {
  return parsePositiveIntEnvVar(
    'ARTICLE_RATE_LIMIT_PER_HOUR',
    DEFAULT_MAX_ARTICLES_PER_HOUR,
    'ArticleRateLimiter'
  );
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

/**
 * Default breaking article rate limit per hour.
 * Breaking articles are event-triggered (scandals, leaks, revelations)
 * and have their own allocation separate from regular articles.
 */
const DEFAULT_BREAKING_RATE_LIMIT_PER_HOUR = 1;

/**
 * Parse the BREAKING_RATE_LIMIT_PER_HOUR environment variable.
 */
function parseBreakingRateLimit(): number {
  return parsePositiveIntEnvVar(
    'BREAKING_RATE_LIMIT_PER_HOUR',
    DEFAULT_BREAKING_RATE_LIMIT_PER_HOUR,
    'ArticleRateLimiter'
  );
}

/**
 * Breaking Article Rate Limiter Service
 *
 * Tracks breaking articles separately from regular articles using in-memory timestamps.
 * This is necessary because the posts table doesn't have a field to distinguish
 * breaking articles from regular articles, so database queries would count all articles.
 *
 * Breaking articles are event-triggered (scandals, leaks, revelations) and have
 * their own rate limit separate from regular scheduled articles.
 *
 * @remarks
 * **In-Memory Tracking**: This service uses in-memory timestamp tracking because:
 * 1. The posts table lacks an isBreaking/subtype field to filter by
 * 2. Breaking articles are infrequent (default 1/hour)
 * 3. Tracking is reset on server restart, which is acceptable:
 *    - Breaking events are time-sensitive and don't span restarts
 *    - Worst case: one extra breaking article after restart
 *
 * **Concurrency Note**: Same TOCTOU considerations as ArticleRateLimiterService apply.
 */
export class BreakingArticleRateLimiterService {
  private readonly maxArticlesPerHour: number;
  private readonly windowMs: number;
  /** Timestamps of breaking articles created within the current window */
  private breakingArticleTimestamps: number[] = [];

  constructor(config: { maxArticlesPerHour?: number; windowMs?: number } = {}) {
    this.maxArticlesPerHour =
      config.maxArticlesPerHour ?? parseBreakingRateLimit();
    this.windowMs = config.windowMs ?? 60 * 60 * 1000; // 1 hour
  }

  /**
   * Clean up expired timestamps outside the current window
   */
  private cleanupExpiredTimestamps(): void {
    const windowStart = Date.now() - this.windowMs;
    this.breakingArticleTimestamps = this.breakingArticleTimestamps.filter(
      (ts) => ts > windowStart
    );
  }

  /**
   * Get the count of breaking articles created in the current time window
   */
  getRecentArticleCount(): number {
    this.cleanupExpiredTimestamps();
    return this.breakingArticleTimestamps.length;
  }

  /**
   * Check if more breaking articles can be generated
   *
   * @returns Object with allowed status and remaining slots
   */
  async canGenerateArticle(): Promise<{
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
    remaining: number;
  }> {
    const currentCount = this.getRecentArticleCount();
    const remaining = Math.max(0, this.maxArticlesPerHour - currentCount);

    const result = {
      allowed: currentCount < this.maxArticlesPerHour,
      currentCount,
      maxAllowed: this.maxArticlesPerHour,
      remaining,
    };

    if (!result.allowed) {
      logger.debug(
        'Breaking article generation blocked by rate limit',
        {
          currentCount,
          maxAllowed: this.maxArticlesPerHour,
          windowMinutes: Math.round(this.windowMs / 60000),
        },
        'BreakingArticleRateLimiter'
      );
    }

    return result;
  }

  /**
   * Record that a breaking article was created.
   * Must be called after successfully persisting a breaking article.
   *
   * @param timestamp - Optional timestamp of creation (defaults to now)
   */
  recordBreakingArticle(timestamp?: number): void {
    this.breakingArticleTimestamps.push(timestamp ?? Date.now());
    this.cleanupExpiredTimestamps();

    logger.debug(
      'Recorded breaking article creation',
      {
        currentCount: this.breakingArticleTimestamps.length,
        maxAllowed: this.maxArticlesPerHour,
      },
      'BreakingArticleRateLimiter'
    );
  }

  /**
   * Get the number of breaking articles that can still be generated this hour
   */
  async getRemainingSlots(): Promise<number> {
    const { remaining } = await this.canGenerateArticle();
    return remaining;
  }

  /**
   * Get current configuration
   */
  getConfig(): { maxArticlesPerHour: number; windowMs: number } {
    return {
      maxArticlesPerHour: this.maxArticlesPerHour,
      windowMs: this.windowMs,
    };
  }

  /**
   * Reset the in-memory tracking (for testing purposes)
   */
  reset(): void {
    this.breakingArticleTimestamps = [];
  }
}

/**
 * Rate limiter for breaking articles (event-triggered).
 *
 * Breaking articles are generated when significant world events occur
 * (scandals, leaks, revelations) and have their own rate limit separate
 * from regular scheduled articles.
 *
 * This uses in-memory tracking instead of database queries because
 * the posts table doesn't have a field to distinguish breaking articles
 * from regular articles.
 *
 * This allows for up to 3 articles/hour total:
 * - 2 regular articles via article-tick cron
 * - 1 breaking article triggered by events
 *
 * Configure via BREAKING_RATE_LIMIT_PER_HOUR environment variable.
 *
 * **IMPORTANT**: After successfully persisting a breaking article,
 * call `breakingArticleRateLimiter.recordBreakingArticle()` to track it.
 */
export const breakingArticleRateLimiter =
  new BreakingArticleRateLimiterService();

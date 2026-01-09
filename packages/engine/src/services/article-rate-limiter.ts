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
 * Default configuration: 2 articles per hour max
 */
const DEFAULT_CONFIG: Required<ArticleRateLimitConfig> = {
  maxArticlesPerHour: 2,
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

// Singleton instance with default config (2 articles per hour)
export const articleRateLimiter = new ArticleRateLimiterService();

/**
 * Create a custom rate limiter with different limits
 *
 * @example
 * ```typescript
 * const limiter = createArticleRateLimiter({ maxArticlesPerHour: 5 });
 * if (await limiter.canGenerateArticle().allowed) {
 *   // Generate article
 * }
 * ```
 */
export function createArticleRateLimiter(
  config: Partial<ArticleRateLimitConfig>
): ArticleRateLimiterService {
  return new ArticleRateLimiterService(config);
}

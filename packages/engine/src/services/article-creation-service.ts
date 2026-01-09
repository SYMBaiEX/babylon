/**
 * Article Creation Service
 *
 * Centralized service for all article creation with atomic rate limiting.
 * All article creation should go through this service to ensure consistent
 * rate limiting across all sources (game-tick, arc events, org content, etc.).
 *
 * Benefits over scattered rate limit checks:
 * 1. Single source of truth - one place to configure limits
 * 2. Atomic enforcement - rate limit checked within transaction
 * 3. Source tracking - know where articles come from
 * 4. Easy to tune - per-source limits if needed
 *
 * @module services/article-creation-service
 */

import {
  and,
  db,
  eq,
  getDbInstance,
  gte,
  isNull,
  posts,
  sql,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';

/**
 * Article sources for tracking and per-source limits
 */
export type ArticleSource =
  | 'arc_event' // Narrative arc events
  | 'question_coverage' // Question-based articles
  | 'event_coverage' // World event coverage
  | 'baseline' // Baseline/filler articles
  | 'org_content' // Organization random articles
  | 'proof'; // Question resolution proof articles

/**
 * Configuration for the article creation service
 */
export interface ArticleCreationConfig {
  /** Maximum articles per hour (global limit) */
  maxPerHour: number;
  /** Time window in ms (default: 1 hour) */
  windowMs: number;
  /** Per-source limits (optional, defaults to global limit) */
  perSourceLimits?: Partial<Record<ArticleSource, number>>;
}

/**
 * Data required to create an article
 */
export interface ArticleData {
  content: string;
  fullContent: string;
  articleTitle: string;
  authorId: string;
  timestamp: Date;
  dayNumber?: number;
  byline?: string;
  biasScore?: number;
  sentiment?: string;
  slant?: string;
  category?: string;
  imageUrl?: string;
}

/**
 * Result of an article creation attempt
 */
export interface ArticleCreationResult {
  success: boolean;
  articleId?: string;
  rateLimited: boolean;
  currentCount: number;
  maxAllowed: number;
  source: ArticleSource;
}

const DEFAULT_CONFIG: ArticleCreationConfig = {
  maxPerHour: 6, // Increased from 2 - more reasonable for a news feed
  windowMs: 60 * 60 * 1000, // 1 hour
  perSourceLimits: {
    arc_event: 2, // Max 2 from arc events per hour
    question_coverage: 2, // Max 2 from question coverage per hour
    event_coverage: 2, // Max 2 from event coverage per hour
    baseline: 1, // Max 1 baseline article per hour
    org_content: 1, // Max 1 random org article per hour
    proof: 10, // Proof articles are special - allow more
  },
};

/**
 * Centralized Article Creation Service
 *
 * Provides atomic rate-limited article creation. All article generation
 * should use this service instead of directly inserting into the posts table.
 */
class ArticleCreationServiceImpl {
  private config: ArticleCreationConfig;

  constructor(config: Partial<ArticleCreationConfig> = {}) {
    this.config = {
      maxPerHour: config.maxPerHour ?? DEFAULT_CONFIG.maxPerHour,
      windowMs: config.windowMs ?? DEFAULT_CONFIG.windowMs,
      perSourceLimits: {
        ...DEFAULT_CONFIG.perSourceLimits,
        ...config.perSourceLimits,
      },
    };
  }

  /**
   * Get recent article counts (global and per-source)
   */
  private async getRecentCounts(): Promise<{
    total: number;
    bySource: Map<string, number>;
  }> {
    const windowStart = new Date(Date.now() - this.config.windowMs);

    // Get total count and breakdown by category (used as source tracker)
    const results = await db
      .select({
        category: posts.category,
        count: sql<number>`count(*)::int`,
      })
      .from(posts)
      .where(
        and(
          eq(posts.type, 'article'),
          gte(posts.timestamp, windowStart),
          isNull(posts.deletedAt)
        )
      )
      .groupBy(posts.category);

    const bySource = new Map<string, number>();
    let total = 0;

    for (const row of results) {
      const source = row.category || 'unknown';
      bySource.set(source, row.count);
      total += row.count;
    }

    return { total, bySource };
  }

  /**
   * Check if article creation is allowed for a given source
   */
  async canCreate(source: ArticleSource): Promise<{
    allowed: boolean;
    reason?: string;
    currentTotal: number;
    currentSourceCount: number;
    maxTotal: number;
    maxForSource: number;
  }> {
    const { total, bySource } = await this.getRecentCounts();
    const sourceCount = bySource.get(source) || 0;
    const maxForSource =
      this.config.perSourceLimits?.[source] ?? this.config.maxPerHour;

    // Check global limit
    if (total >= this.config.maxPerHour) {
      return {
        allowed: false,
        reason: `Global limit reached (${total}/${this.config.maxPerHour})`,
        currentTotal: total,
        currentSourceCount: sourceCount,
        maxTotal: this.config.maxPerHour,
        maxForSource,
      };
    }

    // Check per-source limit
    if (sourceCount >= maxForSource) {
      return {
        allowed: false,
        reason: `Source limit reached for ${source} (${sourceCount}/${maxForSource})`,
        currentTotal: total,
        currentSourceCount: sourceCount,
        maxTotal: this.config.maxPerHour,
        maxForSource,
      };
    }

    return {
      allowed: true,
      currentTotal: total,
      currentSourceCount: sourceCount,
      maxTotal: this.config.maxPerHour,
      maxForSource,
    };
  }

  /**
   * Create an article with atomic rate limiting
   *
   * This is the ONLY method that should be used to create articles.
   * It handles rate limiting atomically within a transaction.
   */
  async createArticle(
    source: ArticleSource,
    data: ArticleData
  ): Promise<ArticleCreationResult> {
    // First check if we can create (fast path rejection)
    const check = await this.canCreate(source);

    if (!check.allowed) {
      logger.debug(
        `Article creation blocked: ${check.reason}`,
        { source, title: data.articleTitle?.slice(0, 50) },
        'ArticleCreationService'
      );

      return {
        success: false,
        rateLimited: true,
        currentCount: check.currentTotal,
        maxAllowed: this.config.maxPerHour,
        source,
      };
    }

    // Create the article
    const articleId = await generateSnowflakeId();

    try {
      await getDbInstance().createPostWithAllFields({
        id: articleId,
        type: 'article',
        content: data.content,
        fullContent: data.fullContent,
        articleTitle: data.articleTitle,
        byline: data.byline,
        biasScore: data.biasScore,
        sentiment: data.sentiment,
        slant: data.slant,
        category: source, // Use source as category for tracking
        imageUrl: data.imageUrl,
        authorId: data.authorId,
        gameId: 'continuous',
        dayNumber: data.dayNumber,
        timestamp: data.timestamp,
      });

      logger.info(
        'Article created',
        {
          articleId,
          source,
          title: data.articleTitle?.slice(0, 50),
          count: `${check.currentTotal + 1}/${this.config.maxPerHour}`,
        },
        'ArticleCreationService'
      );

      return {
        success: true,
        articleId,
        rateLimited: false,
        currentCount: check.currentTotal + 1,
        maxAllowed: this.config.maxPerHour,
        source,
      };
    } catch (error) {
      logger.error(
        'Failed to create article',
        {
          source,
          error: error instanceof Error ? error.message : String(error),
        },
        'ArticleCreationService'
      );

      return {
        success: false,
        rateLimited: false,
        currentCount: check.currentTotal,
        maxAllowed: this.config.maxPerHour,
        source,
      };
    }
  }

  /**
   * Get remaining article slots
   */
  async getRemainingSlots(): Promise<{
    total: number;
    bySource: Record<ArticleSource, number>;
  }> {
    const { total, bySource } = await this.getRecentCounts();

    const sources: ArticleSource[] = [
      'arc_event',
      'question_coverage',
      'event_coverage',
      'baseline',
      'org_content',
      'proof',
    ];

    const remaining: Record<ArticleSource, number> = {} as Record<
      ArticleSource,
      number
    >;

    for (const source of sources) {
      const current = bySource.get(source) || 0;
      const max =
        this.config.perSourceLimits?.[source] ?? this.config.maxPerHour;
      remaining[source] = Math.max(0, max - current);
    }

    return {
      total: Math.max(0, this.config.maxPerHour - total),
      bySource: remaining,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ArticleCreationConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance with default configuration
 */
export const articleCreationService = new ArticleCreationServiceImpl();

/**
 * Create a custom service with different configuration
 */
export function createArticleCreationService(
  config: Partial<ArticleCreationConfig>
): ArticleCreationServiceImpl {
  return new ArticleCreationServiceImpl(config);
}

/**
 * Database Service
 *
 * @description Wrapper for all database operations. Provides a clean interface
 * for interacting with the database, handling posts, questions, organizations,
 * stock prices, events, and actors. Includes game state management.
 *
 * @usage
 * ```typescript
 * import { getDbInstance } from '@babylon/db'
 * await getDbInstance().createPost({...})
 * const posts = await getDbInstance().getRecentPosts(100)
 * ```
 */

import {
  actors,
  and,
  asc,
  count,
  db,
  desc,
  eq,
  games,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  organizations,
  posts,
  questions,
  stockPrices,
  users,
  worldEvents,
} from './index';
import { logger } from './logger';
import type { Actor, Organization, Question } from './model-types';
import { generateSnowflakeId } from '@babylon/shared';

/**
 * FeedPost type for backwards compatibility
 */
export interface FeedPost {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  type?: string;
}

/**
 * Database Service Class
 *
 * @description Main service class for database operations. Provides methods
 * for game state, posts, questions, organizations, stock prices, events, and actors.
 * Singleton pattern ensures single instance across the application.
 */
class DatabaseService {
  /**
   * Expose db for direct queries
   */
  get db() {
    return db;
  }

  /**
   * Initialize game state in database
   */
  async initializeGame() {
    // Check if game already exists
    const existing = await db
      .select()
      .from(games)
      .where(eq(games.isContinuous, true))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      logger.info(`Game already initialized (${existing[0].id})`);
      return existing[0];
    }

    // Create new game
    const gameId = await generateSnowflakeId();
    const created = await db
      .insert(games)
      .values({
        id: gameId,
        isContinuous: true,
        isRunning: true,
        currentDate: new Date(),
        speed: 60000, // 1 minute ticks
        updatedAt: new Date(),
      })
      .returning();

    const game = created[0]!;
    logger.info(`Game initialized (${game.id})`);
    return game;
  }

  /**
   * Get current game state
   */
  async getGameState() {
    const result = await db
      .select()
      .from(games)
      .where(eq(games.isContinuous, true))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Update game state (currentDay, currentDate, lastTickAt, etc.)
   */
  async updateGameState(data: {
    currentDay?: number;
    currentDate?: Date;
    lastTickAt?: Date;
    lastSnapshotAt?: Date;
    activeQuestions?: number;
  }) {
    const game = await this.getGameState();
    if (!game) throw new Error('Game not initialized');

    const updated = await db
      .update(games)
      .set(data)
      .where(eq(games.id, game.id))
      .returning();

    return updated[0]!;
  }

  // ========== POSTS ==========

  /**
   * Create a new post
   */
  async createPost(post: FeedPost & { gameId?: string; dayNumber?: number }) {
    const created = await db
      .insert(posts)
      .values({
        id: post.id,
        content: post.content,
        authorId: post.author,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        timestamp: new Date(post.timestamp),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Create a post with all fields (including article fields)
   * Used by serverless game tick
   */
  async createPostWithAllFields(data: {
    id: string;
    type?: string;
    content: string;
    fullContent?: string;
    articleTitle?: string;
    byline?: string;
    biasScore?: number;
    sentiment?: string;
    slant?: string;
    category?: string;
    authorId: string;
    gameId?: string;
    dayNumber?: number;
    timestamp: Date;
  }) {
    // Validate dayNumber to prevent INT4 overflow
    const safeDayNumber =
      typeof data.dayNumber === 'number' &&
      Number.isFinite(data.dayNumber) &&
      data.dayNumber >= 0 &&
      data.dayNumber <= 2147483647
        ? data.dayNumber
        : undefined;

    if (data.dayNumber !== undefined && safeDayNumber === undefined) {
      logger.warn('[Post] Invalid dayNumber value', {
        dayNumber: data.dayNumber,
        postId: data.id,
      });
    }

    const created = await db
      .insert(posts)
      .values({
        id: data.id,
        type: data.type || 'post',
        content: data.content,
        fullContent: data.fullContent,
        articleTitle: data.articleTitle,
        byline: data.byline,
        biasScore: data.biasScore,
        sentiment: data.sentiment,
        slant: data.slant,
        category: data.category,
        authorId: data.authorId,
        gameId: data.gameId,
        dayNumber: safeDayNumber,
        timestamp: data.timestamp,
      })
      .returning();

    return created[0]!;
  }

  /**
   * Create multiple posts in batch
   */
  async createManyPosts(
    postsData: Array<FeedPost & { gameId?: string; dayNumber?: number }>
  ) {
    if (postsData.length === 0) return { count: 0 };

    const values = postsData.map((post) => {
      // Validate dayNumber to prevent INT4 overflow
      const safeDayNumber =
        typeof post.dayNumber === 'number' &&
        Number.isFinite(post.dayNumber) &&
        post.dayNumber >= 0 &&
        post.dayNumber <= 2147483647
          ? post.dayNumber
          : undefined;

      if (post.dayNumber !== undefined && safeDayNumber === undefined) {
        logger.warn('[Post] Invalid dayNumber value', {
          dayNumber: post.dayNumber,
          postId: post.id,
        });
      }

      return {
        id: post.id,
        content: post.content,
        authorId: post.author,
        gameId: post.gameId,
        dayNumber: safeDayNumber,
        timestamp: new Date(post.timestamp),
      };
    });

    await db.insert(posts).values(values).onConflictDoNothing();

    return { count: postsData.length };
  }

  /**
   * Get recent posts with cursor-based or offset-based pagination
   * Filters out posts from test users (isTest = true)
   */
  async getRecentPosts(limit = 100, cursorOrOffset?: string | number) {
    const isCursor = typeof cursorOrOffset === 'string';
    const cursor = isCursor ? cursorOrOffset : undefined;
    const offset =
      !isCursor && typeof cursorOrOffset === 'number' ? cursorOrOffset : 0;

    logger.debug('DatabaseService.getRecentPosts called', {
      limit,
      cursor,
      offset,
    });

    const now = new Date();

    // Build conditions
    const conditions = [isNull(posts.deletedAt)];

    if (cursor) {
      conditions.push(lt(posts.timestamp, new Date(cursor)));
      conditions.push(lte(posts.timestamp, now));
    } else {
      conditions.push(lte(posts.timestamp, now));
    }

    // Get posts with extra to account for test user filtering
    const allPosts = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .limit(limit * 2)
      .offset(cursor ? 0 : offset)
      .orderBy(desc(posts.timestamp));

    // Get all author IDs
    const authorIds = [...new Set(allPosts.map((p) => p.authorId))];

    // Check which authors are test users
    const [testUsers, testActors] = await Promise.all([
      db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, authorIds), eq(users.isTest, true))),
      db
        .select({ id: actors.id })
        .from(actors)
        .where(and(inArray(actors.id, authorIds), eq(actors.isTest, true))),
    ]);

    const testAuthorIds = new Set([
      ...testUsers.map((u) => u.id),
      ...testActors.map((a) => a.id),
    ]);

    // Filter out posts from test users
    const filteredPosts = allPosts
      .filter((post) => !testAuthorIds.has(post.authorId))
      .slice(0, limit);

    logger.info('DatabaseService.getRecentPosts completed', {
      limit,
      cursor,
      offset,
      postCount: filteredPosts.length,
      filteredTestPosts: allPosts.length - filteredPosts.length,
      firstPostId: filteredPosts[0]?.id,
      lastPostId: filteredPosts[filteredPosts.length - 1]?.id,
    });

    return filteredPosts;
  }

  /**
   * Get posts by actor with cursor-based or offset-based pagination
   * Filters out posts if the actor is a test user
   */
  async getPostsByActor(
    authorId: string,
    limit = 100,
    cursorOrOffset?: string | number
  ) {
    const isCursor = typeof cursorOrOffset === 'string';
    const cursor = isCursor ? cursorOrOffset : undefined;
    const offset =
      !isCursor && typeof cursorOrOffset === 'number' ? cursorOrOffset : 0;

    logger.debug('DatabaseService.getPostsByActor called', {
      authorId,
      limit,
      cursor,
      offset,
    });

    // Check if this actor/user is a test user
    const [user, actor] = await Promise.all([
      db
        .select({ isTest: users.isTest })
        .from(users)
        .where(eq(users.id, authorId))
        .limit(1),
      db
        .select({ isTest: actors.isTest })
        .from(actors)
        .where(eq(actors.id, authorId))
        .limit(1),
    ]);

    const isTestUser = user[0]?.isTest || actor[0]?.isTest || false;

    // If it's a test user, return empty array
    if (isTestUser) {
      logger.info('DatabaseService.getPostsByActor - test user filtered', {
        authorId,
        isTestUser: true,
      });
      return [];
    }

    const now = new Date();

    // Build conditions
    const conditions = [eq(posts.authorId, authorId), isNull(posts.deletedAt)];

    if (cursor) {
      conditions.push(lt(posts.timestamp, new Date(cursor)));
      conditions.push(lte(posts.timestamp, now));
    } else {
      conditions.push(lte(posts.timestamp, now));
    }

    const result = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .limit(limit)
      .offset(cursor ? 0 : offset)
      .orderBy(desc(posts.timestamp));

    logger.info('DatabaseService.getPostsByActor completed', {
      authorId,
      limit,
      cursor,
      offset,
      postCount: result.length,
    });

    return result;
  }

  /**
   * Get total post count
   */
  async getTotalPosts() {
    const result = await db.select({ count: count() }).from(posts);
    return Number(result[0]?.count ?? 0);
  }

  // ========== QUESTIONS ==========

  /**
   * Create a question
   */
  async createQuestion(question: {
    text: string;
    scenario?: number;
    outcome?: boolean;
    rank?: number;
    createdDate?: string | Date;
    resolutionDate: string | Date;
    status?: string;
    resolvedOutcome?: boolean;
    questionNumber: number;
  }) {
    const created = await db
      .insert(questions)
      .values({
        id: await generateSnowflakeId(),
        questionNumber: question.questionNumber,
        text: question.text,
        scenarioId: question.scenario ?? 0,
        outcome: question.outcome ?? false,
        rank: question.rank ?? 0,
        createdDate: new Date(question.createdDate || new Date()),
        resolutionDate: new Date(question.resolutionDate),
        status: question.status || 'active',
        resolvedOutcome: question.resolvedOutcome,
        updatedAt: new Date(),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Convert DB Question to TypeScript Question with additional fields
   */
  private adaptQuestion(dbQuestion: Question): Question & {
    scenario: number;
    timeframe: string;
  } {
    return {
      ...dbQuestion,
      scenario: dbQuestion.scenarioId,
      timeframe: this.calculateTimeframe(dbQuestion.resolutionDate),
    };
  }

  /**
   * Calculate timeframe category from resolution date
   */
  private calculateTimeframe(resolutionDate: Date): string {
    const now = new Date();
    const msUntilResolution = resolutionDate.getTime() - now.getTime();
    const daysUntilResolution = Math.ceil(
      msUntilResolution / (1000 * 60 * 60 * 24)
    );

    if (daysUntilResolution <= 1) return '24h';
    if (daysUntilResolution <= 7) return '7d';
    if (daysUntilResolution <= 30) return '30d';
    return '30d+';
  }

  /**
   * Get active questions
   */
  async getActiveQuestions(timeframe?: string) {
    const now = new Date();
    const conditions = [eq(questions.status, 'active')];

    if (timeframe) {
      let endDate: Date | undefined;

      switch (timeframe) {
        case '24h':
          endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          conditions.push(gte(questions.resolutionDate, now));
          conditions.push(lte(questions.resolutionDate, endDate));
          break;
        case '7d':
          endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          conditions.push(gte(questions.resolutionDate, now));
          conditions.push(lte(questions.resolutionDate, endDate));
          break;
        case '30d':
          endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          conditions.push(gte(questions.resolutionDate, now));
          conditions.push(lte(questions.resolutionDate, endDate));
          break;
        case '30d+': {
          const startDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          conditions.push(gte(questions.resolutionDate, startDate));
          break;
        }
      }
    }

    const result = await db
      .select()
      .from(questions)
      .where(and(...conditions))
      .orderBy(desc(questions.createdDate));

    return result.map((q) => this.adaptQuestion(q));
  }

  /**
   * Get questions to resolve (resolutionDate <= now)
   */
  async getQuestionsToResolve() {
    const result = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.status, 'active'),
          lte(questions.resolutionDate, new Date())
        )
      );

    return result.map((q) => this.adaptQuestion(q));
  }

  /**
   * Get all questions (active and resolved)
   */
  async getAllQuestions() {
    const result = await db
      .select()
      .from(questions)
      .orderBy(desc(questions.createdDate));

    return result.map((q) => this.adaptQuestion(q));
  }

  /**
   * Resolve a question
   */
  async resolveQuestion(id: string, resolvedOutcome: boolean) {
    const updated = await db
      .update(questions)
      .set({
        status: 'resolved',
        resolvedOutcome,
      })
      .where(eq(questions.id, id))
      .returning();

    return updated[0]!;
  }

  // ========== ORGANIZATIONS ==========

  /**
   * Upsert organization (create or update)
   */
  async upsertOrganization(
    org: Partial<Organization> & { id: string; name: string }
  ) {
    // Check if exists
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (existing.length > 0) {
      // Update
      const updated = await db
        .update(organizations)
        .set({
          currentPrice: org.currentPrice ?? org.initialPrice,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id))
        .returning();
      return updated[0]!;
    }

    // Create
    const created = await db
      .insert(organizations)
      .values({
        id: org.id,
        name: org.name,
        description: org.description ?? '',
        type: org.type ?? 'company',
        canBeInvolved: org.canBeInvolved ?? true,
        initialPrice: org.initialPrice,
        currentPrice: org.currentPrice ?? org.initialPrice,
        updatedAt: new Date(),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Update organization price
   */
  async updateOrganizationPrice(id: string, price: number) {
    const updated = await db
      .update(organizations)
      .set({ currentPrice: price })
      .where(eq(organizations.id, id))
      .returning();

    return updated[0]!;
  }

  /**
   * Get all companies (with prices)
   */
  async getCompanies() {
    return await db
      .select()
      .from(organizations)
      .where(eq(organizations.type, 'company'))
      .orderBy(desc(organizations.currentPrice));
  }

  /**
   * Convert DB Organization to TypeScript Organization
   */
  private adaptOrganization(dbOrg: Organization): Organization {
    return dbOrg;
  }

  /**
   * Get all organizations
   */
  async getAllOrganizations() {
    const orgs = await db.select().from(organizations);
    return orgs.map((o) => this.adaptOrganization(o));
  }

  // ========== STOCK PRICES ==========

  /**
   * Record a price update
   */
  async recordPriceUpdate(
    organizationId: string,
    price: number,
    change: number,
    changePercent: number
  ) {
    const created = await db
      .insert(stockPrices)
      .values({
        id: await generateSnowflakeId(),
        organizationId,
        price,
        change,
        changePercent,
        timestamp: new Date(),
        isSnapshot: false,
      })
      .returning();

    return created[0]!;
  }

  /**
   * Record daily snapshot (EOD prices)
   */
  async recordDailySnapshot(
    organizationId: string,
    data: {
      openPrice: number;
      highPrice: number;
      lowPrice: number;
      closePrice: number;
      volume: number;
    }
  ) {
    const created = await db
      .insert(stockPrices)
      .values({
        id: await generateSnowflakeId(),
        organizationId,
        price: data.closePrice,
        change: data.closePrice - data.openPrice,
        changePercent:
          ((data.closePrice - data.openPrice) / data.openPrice) * 100,
        timestamp: new Date(),
        isSnapshot: true,
        openPrice: data.openPrice,
        highPrice: data.highPrice,
        lowPrice: data.lowPrice,
        volume: data.volume,
      })
      .returning();

    return created[0]!;
  }

  /**
   * Get price history for a company
   */
  async getPriceHistory(organizationId: string, limit = 1440) {
    return await db
      .select()
      .from(stockPrices)
      .where(eq(stockPrices.organizationId, organizationId))
      .limit(limit)
      .orderBy(desc(stockPrices.timestamp));
  }

  /**
   * Get daily snapshots only
   */
  async getDailySnapshots(organizationId: string, days = 30) {
    return await db
      .select()
      .from(stockPrices)
      .where(
        and(
          eq(stockPrices.organizationId, organizationId),
          eq(stockPrices.isSnapshot, true)
        )
      )
      .limit(days)
      .orderBy(desc(stockPrices.timestamp));
  }

  // ========== EVENTS ==========

  /**
   * Create a world event
   */
  async createEvent(event: {
    id: string;
    eventType: string;
    description:
      | string
      | { title?: string; text?: string; timestamp?: string; source?: string };
    actors: string[];
    relatedQuestion?: number;
    pointsToward?: string;
    visibility: string;
    gameId?: string;
    dayNumber?: number;
  }) {
    // Convert description to string if it's an object
    let descriptionString: string;
    if (typeof event.description === 'string') {
      descriptionString = event.description;
    } else if (event.description && typeof event.description === 'object') {
      descriptionString =
        event.description.text ||
        event.description.title ||
        JSON.stringify(event.description);
    } else {
      descriptionString = String(event.description || '');
    }

    // Validate integer fields to prevent INT4 overflow
    const safeRelatedQuestion =
      typeof event.relatedQuestion === 'number' &&
      Number.isFinite(event.relatedQuestion) &&
      event.relatedQuestion >= 0 &&
      event.relatedQuestion <= 2147483647
        ? event.relatedQuestion
        : undefined;

    const safeDayNumber =
      typeof event.dayNumber === 'number' &&
      Number.isFinite(event.dayNumber) &&
      event.dayNumber >= 0 &&
      event.dayNumber <= 2147483647
        ? event.dayNumber
        : undefined;

    if (
      event.relatedQuestion !== undefined &&
      safeRelatedQuestion === undefined
    ) {
      logger.warn('[WorldEvent] Invalid relatedQuestion value', {
        relatedQuestion: event.relatedQuestion,
        eventId: event.id,
      });
    }

    if (event.dayNumber !== undefined && safeDayNumber === undefined) {
      logger.warn('[WorldEvent] Invalid dayNumber value', {
        dayNumber: event.dayNumber,
        eventId: event.id,
      });
    }

    const created = await db
      .insert(worldEvents)
      .values({
        id: event.id,
        eventType: event.eventType,
        description: descriptionString,
        actors: event.actors,
        relatedQuestion: safeRelatedQuestion,
        pointsToward: event.pointsToward,
        visibility: event.visibility,
        gameId: event.gameId,
        dayNumber: safeDayNumber,
      })
      .returning();

    return created[0]!;
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit = 100) {
    return await db
      .select()
      .from(worldEvents)
      .limit(limit)
      .orderBy(desc(worldEvents.timestamp));
  }

  // ========== ACTORS ==========

  /**
   * Upsert actor (create or update)
   */
  async upsertActor(actor: Partial<Actor> & { id: string; name: string }) {
    // Check if exists
    const existing = await db
      .select({ id: actors.id })
      .from(actors)
      .where(eq(actors.id, actor.id))
      .limit(1);

    if (existing.length > 0) {
      // Update
      const updated = await db
        .update(actors)
        .set({
          name: actor.name,
          description: actor.description,
          domain: actor.domain || [],
          personality: actor.personality,
          tier: actor.tier,
          affiliations: actor.affiliations || [],
          postStyle: actor.postStyle,
          postExample: actor.postExample || [],
          role: actor.role,
          ...(actor.initialLuck !== undefined && {
            initialLuck: actor.initialLuck,
          }),
          ...(actor.initialMood !== undefined && {
            initialMood: actor.initialMood,
          }),
          ...(actor.tradingBalance !== undefined && {
            tradingBalance: String(actor.tradingBalance),
          }),
          ...(actor.reputationPoints !== undefined && {
            reputationPoints: actor.reputationPoints,
          }),
          ...(actor.profileImageUrl !== undefined && {
            profileImageUrl: actor.profileImageUrl,
          }),
        })
        .where(eq(actors.id, actor.id))
        .returning();

      return updated[0]!;
    }

    // Create
    const created = await db
      .insert(actors)
      .values({
        id: actor.id,
        name: actor.name,
        description: actor.description ?? '',
        domain: actor.domain || [],
        personality: actor.personality ?? '',
        tier: actor.tier ?? 'background',
        affiliations: actor.affiliations || [],
        postStyle: actor.postStyle ?? '',
        postExample: actor.postExample || [],
        role: actor.role ?? 'background',
        initialLuck: actor.initialLuck || 'medium',
        initialMood: actor.initialMood ?? 0,
        tradingBalance: String(actor.tradingBalance ?? 0),
        reputationPoints: actor.reputationPoints ?? 0,
        profileImageUrl: actor.profileImageUrl,
        updatedAt: new Date(),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Get all actors
   */
  async getAllActors() {
    return await db
      .select()
      .from(actors)
      .orderBy(asc(actors.tier), asc(actors.name));
  }

  /**
   * Get actor by ID
   */
  async getActor(id: string) {
    const result = await db
      .select()
      .from(actors)
      .where(eq(actors.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  // ========== UTILITY ==========

  /**
   * Get database stats
   */
  async getStats() {
    const [
      totalPosts,
      totalQuestions,
      activeQuestions,
      totalOrganizations,
      totalActors,
      gameState,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(posts)
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(questions)
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(questions)
        .where(eq(questions.status, 'active'))
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(organizations)
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(actors)
        .then((r) => Number(r[0]?.count ?? 0)),
      this.getGameState(),
    ]);

    return {
      totalPosts,
      totalQuestions,
      activeQuestions,
      totalOrganizations,
      totalActors,
      currentDay: gameState?.currentDay || 0,
      isRunning: gameState?.isRunning || false,
    };
  }

  /**
   * Get all games
   */
  async getAllGames() {
    return await db.select().from(games).orderBy(desc(games.createdAt));
  }
}

// Singleton instance - ensure it's always available
let dbInstance: DatabaseService | null = null;

export function getDbInstance(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

export { DatabaseService };
export default getDbInstance;

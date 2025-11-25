/**
 * Database Service
 * 
 * @description Wrapper for all database operations. Provides a clean interface
 * for interacting with the database, handling posts, questions, organizations,
 * stock prices, events, and actors. Includes game state management and automatic
 * post tagging.
 * 
 * @usage
 * ```typescript
 * import db from '@/lib/database-service'
 * await db().createPost({...})
 * const posts = await db().getRecentPosts(100)
 * ```
 */

import type { FeedPost, Question as GameQuestion, Question, Organization, Actor } from '@/shared/types';
import { logger } from './logger';
import { 
  db, 
  games, 
  posts, 
  questions, 
  organizations, 
  stockPrices, 
  worldEvents, 
  actors, 
  users,
  eq, 
  desc, 
  asc,
  and,
  inArray,
  isNull,
  lte,
  lt,
  gte,
  count,
} from '@/db';
import { generateTagsForPosts } from './services/tag-generation-service';
import { storeTagsForPost } from './services/tag-storage-service';
import { generateSnowflakeId } from './snowflake';

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
   * 
   * @description Getter that exposes the Drizzle database for direct queries.
   * Uses getter to avoid issues if db isn't initialized.
   * 
   * @returns {Database} Drizzle database instance
   */
  get db() {
    return db;
  }
  
  /**
   * Initialize game state in database
   * 
   * @description Creates the main continuous game if it doesn't exist.
   * Returns existing game if already initialized. Sets up initial game
   * configuration with 1-minute tick speed.
   * 
   * @returns {Promise<Game>} The game instance (new or existing)
   */
  async initializeGame() {
    // Check if game already exists
    const existing = await db.select()
      .from(games)
      .where(eq(games.isContinuous, true))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      logger.info(`Game already initialized (${existing[0].id})`, undefined, 'DatabaseService');
      return existing[0];
    }

    // Create new game
    const gameId = await generateSnowflakeId();
    const created = await db.insert(games)
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
    logger.info(`Game initialized (${game.id})`, undefined, 'DatabaseService');
    return game;
  }

  /**
   * Get current game state
   * 
   * @description Retrieves the current continuous game state from the database.
   * Returns null if no game has been initialized.
   * 
   * @returns {Promise<Game | null>} Current game state or null if not initialized
   */
  async getGameState() {
    const result = await db.select()
      .from(games)
      .where(eq(games.isContinuous, true))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Update game state (currentDay, currentDate, lastTickAt, etc.)
   * 
   * @description Updates the current game state with new values. Throws error
   * if game hasn't been initialized.
   * 
   * @param {object} data - Game state update data
   * @param {number} [data.currentDay] - Current game day
   * @param {Date} [data.currentDate] - Current game date
   * @param {Date} [data.lastTickAt] - Last tick timestamp
   * @param {Date} [data.lastSnapshotAt] - Last snapshot timestamp
   * @param {number} [data.activeQuestions] - Number of active questions
   * @returns {Promise<Game>} Updated game state
   * @throws {Error} If game not initialized
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

    const updated = await db.update(games)
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
    const created = await db.insert(posts)
      .values({
        id: post.id,
        content: post.content,
        authorId: post.author,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        timestamp: new Date(post.timestamp),
      })
      .returning();

    void this.tagPostAsync(post.id, post.content);

    return created[0]!;
  }

  /**
   * Tag a post asynchronously (fire-and-forget)
   */
  private async tagPostAsync(postId: string, content: string): Promise<void> {
    const tagMap = await generateTagsForPosts([{ id: postId, content }]);
    const tags = tagMap.get(postId);
    if (tags && tags.length > 0) {
      await storeTagsForPost(postId, tags);
    }
  }

  /**
   * Create a post with all fields (including article fields) and auto-tag it
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
    const safeDayNumber = typeof data.dayNumber === 'number' && 
      Number.isFinite(data.dayNumber) && 
      data.dayNumber >= 0 && 
      data.dayNumber <= 2147483647 
      ? data.dayNumber 
      : undefined;

    if (data.dayNumber !== undefined && safeDayNumber === undefined) {
      logger.warn('[Post] Invalid dayNumber value', { dayNumber: data.dayNumber, postId: data.id }, 'database-service');
    }

    const created = await db.insert(posts)
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

    void this.tagPostAsync(data.id, data.content);

    return created[0]!;
  }

  /**
   * Create multiple posts in batch
   */
  async createManyPosts(postsData: Array<FeedPost & { gameId?: string; dayNumber?: number }>) {
    if (postsData.length === 0) return { count: 0 };

    const values = postsData.map(post => {
      // Validate dayNumber to prevent INT4 overflow
      const safeDayNumber = typeof post.dayNumber === 'number' && 
        Number.isFinite(post.dayNumber) && 
        post.dayNumber >= 0 && 
        post.dayNumber <= 2147483647 
        ? post.dayNumber 
        : undefined;

      if (post.dayNumber !== undefined && safeDayNumber === undefined) {
        logger.warn('[Post] Invalid dayNumber value', { dayNumber: post.dayNumber, postId: post.id }, 'database-service');
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

    await db.insert(posts)
      .values(values)
      .onConflictDoNothing();

    if (postsData.length > 0) {
      const postsForTagging = postsData.map(p => ({
        id: p.id,
        content: p.content,
      }));

      const tagMap = await generateTagsForPosts(postsForTagging);

      await Promise.all(
        Array.from(tagMap.entries()).map(async ([postId, tags]) => {
          if (tags.length > 0) {
            await storeTagsForPost(postId, tags);
          }
        })
      );
    }

    return { count: postsData.length };
  }

  /**
   * Get recent posts with cursor-based or offset-based pagination
   * Note: Not cached as this is real-time data that updates frequently
   * Filters out posts from test users (isTest = true)
   * 
   * @param limit - Number of posts to fetch
   * @param cursorOrOffset - Cursor (ISO string) for cursor-based pagination, or offset (number) for legacy offset pagination
   */
  async getRecentPosts(limit = 100, cursorOrOffset?: string | number) {
    const isCursor = typeof cursorOrOffset === 'string';
    const cursor = isCursor ? cursorOrOffset : undefined;
    const offset = !isCursor && typeof cursorOrOffset === 'number' ? cursorOrOffset : 0;
    
    logger.debug('DatabaseService.getRecentPosts called', { limit, cursor, offset }, 'DatabaseService');
    
    const now = new Date();
    
    // Build conditions
    const conditions = [
      isNull(posts.deletedAt),
    ];
    
    if (cursor) {
      conditions.push(lt(posts.timestamp, new Date(cursor)));
      conditions.push(lte(posts.timestamp, now));
    } else {
      conditions.push(lte(posts.timestamp, now));
    }
    
    // Get posts with extra to account for test user filtering
    const allPosts = await db.select()
      .from(posts)
      .where(and(...conditions))
      .limit(limit * 2)
      .offset(cursor ? 0 : offset)
      .orderBy(desc(posts.timestamp));
    
    // Get all author IDs
    const authorIds = [...new Set(allPosts.map(p => p.authorId))];
    
    // Check which authors are test users
    const [testUsers, testActors] = await Promise.all([
      db.select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, authorIds), eq(users.isTest, true))),
      db.select({ id: actors.id })
        .from(actors)
        .where(and(inArray(actors.id, authorIds), eq(actors.isTest, true))),
    ]);
    
    const testAuthorIds = new Set([
      ...testUsers.map(u => u.id),
      ...testActors.map(a => a.id),
    ]);
    
    // Filter out posts from test users
    const filteredPosts = allPosts
      .filter(post => !testAuthorIds.has(post.authorId))
      .slice(0, limit);
    
    logger.info('DatabaseService.getRecentPosts completed', {
      limit,
      cursor,
      offset,
      postCount: filteredPosts.length,
      filteredTestPosts: allPosts.length - filteredPosts.length,
      firstPostId: filteredPosts[0]?.id,
      lastPostId: filteredPosts[filteredPosts.length - 1]?.id,
    }, 'DatabaseService');
    
    return filteredPosts;
  }

  /**
   * Get posts by actor with cursor-based or offset-based pagination
   * Filters out posts if the actor is a test user
   * 
   * @param authorId - Author ID (user or actor)
   * @param limit - Number of posts to fetch
   * @param cursorOrOffset - Cursor (ISO string) for cursor-based pagination, or offset (number) for legacy offset pagination
   */
  async getPostsByActor(authorId: string, limit = 100, cursorOrOffset?: string | number) {
    const isCursor = typeof cursorOrOffset === 'string';
    const cursor = isCursor ? cursorOrOffset : undefined;
    const offset = !isCursor && typeof cursorOrOffset === 'number' ? cursorOrOffset : 0;
    
    logger.debug('DatabaseService.getPostsByActor called', { authorId, limit, cursor, offset }, 'DatabaseService');
    
    // Check if this actor/user is a test user
    const [user, actor] = await Promise.all([
      db.select({ isTest: users.isTest })
        .from(users)
        .where(eq(users.id, authorId))
        .limit(1),
      db.select({ isTest: actors.isTest })
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
      }, 'DatabaseService');
      return [];
    }
    
    const now = new Date();
    
    // Build conditions
    const conditions = [
      eq(posts.authorId, authorId),
      isNull(posts.deletedAt),
    ];
    
    if (cursor) {
      conditions.push(lt(posts.timestamp, new Date(cursor)));
      conditions.push(lte(posts.timestamp, now));
    } else {
      conditions.push(lte(posts.timestamp, now));
    }
    
    const result = await db.select()
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
    }, 'DatabaseService');
    
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
  async createQuestion(question: GameQuestion & { questionNumber: number }) {
    const created = await db.insert(questions)
      .values({
        id: await generateSnowflakeId(),
        questionNumber: question.questionNumber,
        text: question.text,
        scenarioId: question.scenario,
        outcome: question.outcome,
        rank: question.rank,
        createdDate: new Date(question.createdDate || new Date()),
        resolutionDate: new Date(question.resolutionDate!),
        status: question.status || 'active',
        resolvedOutcome: question.resolvedOutcome,
        updatedAt: new Date(),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Convert DB Question to TypeScript Question
   */
  private adaptQuestion(dbQuestion: {
    id: string;
    questionNumber: number;
    text: string;
    scenarioId: number;
    outcome: boolean;
    rank: number;
    createdDate: Date;
    resolutionDate: Date;
    status: string;
    resolvedOutcome: boolean | null;
    resolutionProofUrl: string | null;
    resolutionDescription: string | null;
  }): Question {
    return {
      id: dbQuestion.id,
      questionNumber: dbQuestion.questionNumber,
      text: dbQuestion.text,
      scenario: dbQuestion.scenarioId,
      scenarioId: dbQuestion.scenarioId,
      outcome: dbQuestion.outcome,
      rank: dbQuestion.rank,
      createdDate: dbQuestion.createdDate.toISOString(),
      resolutionDate: dbQuestion.resolutionDate.toISOString(),
      status: dbQuestion.status as 'active' | 'resolved' | 'cancelled',
      resolvedOutcome: dbQuestion.resolvedOutcome ?? undefined,
      resolutionProofUrl: dbQuestion.resolutionProofUrl ?? undefined,
      resolutionDescription: dbQuestion.resolutionDescription ?? undefined,
      timeframe: this.calculateTimeframe(dbQuestion.resolutionDate),
      createdAt: dbQuestion.createdDate,
      updatedAt: dbQuestion.createdDate,
    };
  }

  /**
   * Calculate timeframe category from resolution date
   */
  private calculateTimeframe(resolutionDate: Date): string {
    const now = new Date();
    const msUntilResolution = resolutionDate.getTime() - now.getTime();
    const daysUntilResolution = Math.ceil(msUntilResolution / (1000 * 60 * 60 * 24));
    
    if (daysUntilResolution <= 1) return '24h';
    if (daysUntilResolution <= 7) return '7d';
    if (daysUntilResolution <= 30) return '30d';
    return '30d+';
  }

  /**
   * Get active questions
   * @param timeframe - Optional timeframe filter ('24h', '7d', '30d', '30d+')
   */
  async getActiveQuestions(timeframe?: string): Promise<Question[]> {
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
        case '30d+':
          const startDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          conditions.push(gte(questions.resolutionDate, startDate));
          break;
      }
    }
    
    const result = await db.select()
      .from(questions)
      .where(and(...conditions))
      .orderBy(desc(questions.createdDate));

    return result.map(q => this.adaptQuestion(q));
  }

  /**
   * Get questions to resolve (resolutionDate <= now)
   */
  async getQuestionsToResolve(): Promise<Question[]> {
    const result = await db.select()
      .from(questions)
      .where(and(
        eq(questions.status, 'active'),
        lte(questions.resolutionDate, new Date())
      ));

    return result.map(q => this.adaptQuestion(q));
  }

  /**
   * Get all questions (active and resolved)
   */
  async getAllQuestions(): Promise<Question[]> {
    const result = await db.select()
      .from(questions)
      .orderBy(desc(questions.createdDate));

    return result.map(q => this.adaptQuestion(q));
  }

  /**
   * Resolve a question
   */
  async resolveQuestion(id: string, resolvedOutcome: boolean) {
    const updated = await db.update(questions)
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
  async upsertOrganization(org: Organization) {
    // Check if exists
    const existing = await db.select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (existing.length > 0) {
      // Update
      const updated = await db.update(organizations)
        .set({
          currentPrice: org.currentPrice || org.initialPrice,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id))
        .returning();
      return updated[0]!;
    }

    // Create
    const created = await db.insert(organizations)
      .values({
        id: org.id,
        name: org.name,
        description: org.description,
        type: org.type,
        canBeInvolved: org.canBeInvolved,
        initialPrice: org.initialPrice,
        currentPrice: org.currentPrice || org.initialPrice,
        updatedAt: new Date(),
      })
      .returning();

    return created[0]!;
  }

  /**
   * Update organization price
   */
  async updateOrganizationPrice(id: string, price: number) {
    const updated = await db.update(organizations)
      .set({ currentPrice: price })
      .where(eq(organizations.id, id))
      .returning();

    return updated[0]!;
  }

  /**
   * Get all companies (with prices)
   */
  async getCompanies() {
    return await db.select()
      .from(organizations)
      .where(eq(organizations.type, 'company'))
      .orderBy(desc(organizations.currentPrice));
  }

  /**
   * Convert DB Organization to TypeScript Organization
   */
  private adaptOrganization(dbOrg: {
    id: string;
    name: string;
    description: string;
    type: string;
    canBeInvolved: boolean;
    initialPrice: number | null;
    currentPrice: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): Organization {
    return {
      id: dbOrg.id,
      name: dbOrg.name,
      description: dbOrg.description,
      type: dbOrg.type as Organization['type'],
      canBeInvolved: dbOrg.canBeInvolved,
      initialPrice: dbOrg.initialPrice ?? undefined,
      currentPrice: dbOrg.currentPrice ?? undefined,
    };
  }

  /**
   * Get all organizations
   */
  async getAllOrganizations(): Promise<Organization[]> {
    const orgs = await db.select().from(organizations);
    return orgs.map(o => this.adaptOrganization(o));
  }

  // ========== STOCK PRICES ==========

  /**
   * Record a price update
   */
  async recordPriceUpdate(organizationId: string, price: number, change: number, changePercent: number) {
    const created = await db.insert(stockPrices)
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
    const created = await db.insert(stockPrices)
      .values({
        id: await generateSnowflakeId(),
        organizationId,
        price: data.closePrice,
        change: data.closePrice - data.openPrice,
        changePercent: ((data.closePrice - data.openPrice) / data.openPrice) * 100,
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
    return await db.select()
      .from(stockPrices)
      .where(eq(stockPrices.organizationId, organizationId))
      .limit(limit)
      .orderBy(desc(stockPrices.timestamp));
  }

  /**
   * Get daily snapshots only
   */
  async getDailySnapshots(organizationId: string, days = 30) {
    return await db.select()
      .from(stockPrices)
      .where(and(
        eq(stockPrices.organizationId, organizationId),
        eq(stockPrices.isSnapshot, true)
      ))
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
    description: string | { title?: string; text?: string; timestamp?: string; source?: string };
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
      descriptionString = event.description.text || event.description.title || JSON.stringify(event.description);
    } else {
      descriptionString = String(event.description || '');
    }

    // Validate integer fields to prevent INT4 overflow
    const safeRelatedQuestion = typeof event.relatedQuestion === 'number' && 
      Number.isFinite(event.relatedQuestion) && 
      event.relatedQuestion >= 0 && 
      event.relatedQuestion <= 2147483647 
      ? event.relatedQuestion 
      : undefined;

    const safeDayNumber = typeof event.dayNumber === 'number' && 
      Number.isFinite(event.dayNumber) && 
      event.dayNumber >= 0 && 
      event.dayNumber <= 2147483647 
      ? event.dayNumber 
      : undefined;

    if (event.relatedQuestion !== undefined && safeRelatedQuestion === undefined) {
      logger.warn('[WorldEvent] Invalid relatedQuestion value', { relatedQuestion: event.relatedQuestion, eventId: event.id }, 'database-service');
    }
    
    if (event.dayNumber !== undefined && safeDayNumber === undefined) {
      logger.warn('[WorldEvent] Invalid dayNumber value', { dayNumber: event.dayNumber, eventId: event.id }, 'database-service');
    }

    const created = await db.insert(worldEvents)
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
    return await db.select()
      .from(worldEvents)
      .limit(limit)
      .orderBy(desc(worldEvents.timestamp));
  }

  // ========== ACTORS ==========

  /**
   * Upsert actor (create or update)
   */
  async upsertActor(actor: Actor) {
    // Check if exists
    const existing = await db.select({ id: actors.id })
      .from(actors)
      .where(eq(actors.id, actor.id))
      .limit(1);

    if (existing.length > 0) {
      // Update
      const updated = await db.update(actors)
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
          ...(actor.initialLuck !== undefined && { initialLuck: actor.initialLuck }),
          ...(actor.initialMood !== undefined && { initialMood: actor.initialMood }),
          ...(actor.tradingBalance !== undefined && { tradingBalance: String(actor.tradingBalance) }),
          ...(actor.reputationPoints !== undefined && { reputationPoints: actor.reputationPoints }),
          ...(actor.profileImageUrl !== undefined && { profileImageUrl: actor.profileImageUrl }),
        })
        .where(eq(actors.id, actor.id))
        .returning();

      return updated[0]!;
    }

    // Create
    const created = await db.insert(actors)
      .values({
        id: actor.id,
        name: actor.name,
        description: actor.description,
        domain: actor.domain || [],
        personality: actor.personality,
        tier: actor.tier,
        affiliations: actor.affiliations || [],
        postStyle: actor.postStyle,
        postExample: actor.postExample || [],
        role: actor.role,
        initialLuck: actor.initialLuck || 'medium',
        initialMood: actor.initialMood ?? 0,
        tradingBalance: String(actor.tradingBalance ?? (actor.hasPool ? 10000 : 0)),
        reputationPoints: actor.reputationPoints ?? (actor.hasPool ? 10000 : 0),
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
    return await db.select()
      .from(actors)
      .orderBy(asc(actors.tier), asc(actors.name));
  }

  /**
   * Get actor by ID
   */
  async getActor(id: string) {
    const result = await db.select()
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
      db.select({ count: count() }).from(posts).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(questions).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(questions).where(eq(questions.status, 'active')).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(organizations).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(actors).then(r => Number(r[0]?.count ?? 0)),
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
    return await db.select()
      .from(games)
      .orderBy(desc(games.createdAt));
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

export default getDbInstance;

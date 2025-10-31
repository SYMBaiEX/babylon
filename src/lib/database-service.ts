/**
 * Database Service
 * 
 * Wrapper for all database operations.
 * Handles posts, questions, organizations, stock prices, events, actors.
 * 
 * Usage:
 *   import { db } from '@/lib/database-service'
 *   await db.createPost({...})
 *   const posts = await db.getRecentPosts(100)
 */

import { PrismaClient } from '@prisma/client';
import type { FeedPost, Question as GameQuestion, Organization as GameOrg, Actor as GameActor } from '@/shared/types';

// Singleton Prisma client
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

class DatabaseService {
  // Expose prisma for direct queries
  public prisma = prisma;
  /**
   * Initialize game state in database
   */
  async initializeGame() {
    // Check if game already exists
    const existing = await prisma.game.findFirst({
      where: { isContinuous: true },
    });

    if (existing) {
      console.log(`✅ DB: Game already initialized (${existing.id})`);
      return existing;
    }

    // Create new game
    const game = await prisma.game.create({
      data: {
        isContinuous: true,
        isRunning: true,
        currentDate: new Date(),
        speed: 60000, // 1 minute ticks
      },
    });

    console.log(`✅ DB: Game initialized (${game.id})`);
    return game;
  }

  /**
   * Get current game state
   */
  async getGameState() {
    return await prisma.game.findFirst({
      where: { isContinuous: true },
    });
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

    return await prisma.game.update({
      where: { id: game.id },
      data,
    });
  }

  // ========== POSTS ==========

  /**
   * Create a new post
   */
  async createPost(post: FeedPost & { gameId?: string; dayNumber?: number }) {
    return await prisma.post.create({
      data: {
        id: post.id,
        content: post.content,
        authorId: post.author,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        timestamp: new Date(post.timestamp),
      },
    });
  }

  /**
   * Create multiple posts in batch
   */
  async createManyPosts(posts: Array<FeedPost & { gameId?: string; dayNumber?: number }>) {
    return await prisma.post.createMany({
      data: posts.map(post => ({
        id: post.id,
        content: post.content,
        authorId: post.author,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        timestamp: new Date(post.timestamp),
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Get recent posts (paginated)
   */
  async getRecentPosts(limit = 100, offset = 0) {
    return await prisma.post.findMany({
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get posts by actor
   */
  async getPostsByActor(authorId: string, limit = 100) {
    return await prisma.post.findMany({
      where: { authorId },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get total post count
   */
  async getTotalPosts() {
    return await prisma.post.count();
  }

  // ========== QUESTIONS ==========

  /**
   * Create a question
   */
  async createQuestion(question: GameQuestion & { questionNumber: number }) {
    return await prisma.question.create({
      data: {
        questionNumber: question.questionNumber,
        text: question.text,
        scenarioId: question.scenario,
        outcome: question.outcome,
        rank: question.rank,
        createdDate: new Date(question.createdDate || new Date()),
        resolutionDate: new Date(question.resolutionDate!),
        status: question.status || 'active',
        resolvedOutcome: question.resolvedOutcome,
      },
    });
  }

  /**
   * Get active questions
   */
  async getActiveQuestions() {
    return await prisma.question.findMany({
      where: { status: 'active' },
      orderBy: { createdDate: 'desc' },
    });
  }

  /**
   * Get questions to resolve (resolutionDate <= now)
   */
  async getQuestionsToResolve() {
    return await prisma.question.findMany({
      where: {
        status: 'active',
        resolutionDate: {
          lte: new Date(),
        },
      },
    });
  }

  /**
   * Resolve a question
   */
  async resolveQuestion(id: string, resolvedOutcome: boolean) {
    return await prisma.question.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedOutcome,
      },
    });
  }

  // ========== ORGANIZATIONS ==========

  /**
   * Upsert organization (create or update)
   */
  async upsertOrganization(org: GameOrg) {
    return await prisma.organization.upsert({
      where: { id: org.id },
      create: {
        id: org.id,
        name: org.name,
        description: org.description,
        type: org.type,
        canBeInvolved: org.canBeInvolved,
        initialPrice: org.initialPrice,
        currentPrice: org.currentPrice || org.initialPrice,
      },
      update: {
        currentPrice: org.currentPrice || org.initialPrice,
      },
    });
  }

  /**
   * Update organization price
   */
  async updateOrganizationPrice(id: string, price: number) {
    return await prisma.organization.update({
      where: { id },
      data: { currentPrice: price },
    });
  }

  /**
   * Get all companies (with prices)
   */
  async getCompanies() {
    return await prisma.organization.findMany({
      where: { type: 'company' },
      orderBy: { currentPrice: 'desc' },
    });
  }

  /**
   * Get all organizations
   */
  async getAllOrganizations() {
    return await prisma.organization.findMany();
  }

  // ========== STOCK PRICES ==========

  /**
   * Record a price update
   */
  async recordPriceUpdate(organizationId: string, price: number, change: number, changePercent: number) {
    return await prisma.stockPrice.create({
      data: {
        organizationId,
        price,
        change,
        changePercent,
        timestamp: new Date(),
        isSnapshot: false,
      },
    });
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
    return await prisma.stockPrice.create({
      data: {
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
      },
    });
  }

  /**
   * Get price history for a company
   */
  async getPriceHistory(organizationId: string, limit = 1440) {
    return await prisma.stockPrice.findMany({
      where: { organizationId },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get daily snapshots only
   */
  async getDailySnapshots(organizationId: string, days = 30) {
    return await prisma.stockPrice.findMany({
      where: {
        organizationId,
        isSnapshot: true,
      },
      take: days,
      orderBy: { timestamp: 'desc' },
    });
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
      // Handle object description - use text or title, or stringify
      descriptionString = event.description.text || event.description.title || JSON.stringify(event.description);
    } else {
      descriptionString = String(event.description || '');
    }

    return await prisma.worldEvent.create({
      data: {
        ...event,
        description: descriptionString,
      },
    });
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit = 100) {
    return await prisma.worldEvent.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  // ========== ACTORS ==========

  /**
   * Upsert actor (create or update)
   */
  async upsertActor(actor: GameActor) {
    return await prisma.actor.upsert({
      where: { id: actor.id },
      create: {
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
        initialLuck: (actor as any).initialLuck || 'medium',
        initialMood: (actor as any).initialMood || 0,
      },
      update: {
        name: actor.name,
        description: actor.description,
        domain: actor.domain || [],
        personality: actor.personality,
        tier: actor.tier,
        affiliations: actor.affiliations || [],
        postStyle: actor.postStyle,
        postExample: actor.postExample || [],
      },
    });
  }

  /**
   * Get all actors
   */
  async getAllActors() {
    return await prisma.actor.findMany({
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get actor by ID
   */
  async getActor(id: string) {
    return await prisma.actor.findUnique({
      where: { id },
    });
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
      prisma.post.count(),
      prisma.question.count(),
      prisma.question.count({ where: { status: 'active' } }),
      prisma.organization.count(),
      prisma.actor.count(),
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
    return await prisma.game.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}

// Singleton instance
export const db = new DatabaseService();


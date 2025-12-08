/**
 * Game Service - API Wrapper
 *
 * @description Provides access to game data for API routes. Wraps database
 * operations with a clean service interface. Game tick runs automatically via
 * cron (production) or local simulator (development). All operations query the
 * database directly, which is updated by game tick.
 *
 * Vercel-compatible: No filesystem access, all data from database.
 */

import { getDbInstance } from '@babylon/db';
import { StaticDataRegistry } from './services/static-data-registry';

/**
 * Game Service Class
 *
 * @description Service class for accessing game data. Provides methods for
 * retrieving posts, companies, questions, and game statistics. Singleton
 * pattern ensures single instance across the application.
 */
class GameService {
  async getRecentPosts(limit = 100, offset = 0) {
    return await getDbInstance().getRecentPosts(limit, offset);
  }

  async getPostsByActor(actorId: string, limit = 100) {
    return await getDbInstance().getPostsByActor(actorId, limit);
  }

  async getCompanies() {
    // Get static organization data from registry
    const staticOrgs = StaticDataRegistry.getAllOrganizations();
    // Get dynamic price data from database
    const orgStates = await getDbInstance().getAllOrganizationStates();
    const priceMap = new Map(orgStates.map((s) => [s.id, s.currentPrice]));

    // Combine static and dynamic data, filter to companies
    return staticOrgs
      .filter((org) => org.type === 'company')
      .map((org) => ({
        id: org.id,
        name: org.name,
        description: org.description,
        type: org.type,
        canBeInvolved: org.canBeInvolved,
        initialPrice: org.initialPrice,
        currentPrice: priceMap.get(org.id) ?? org.initialPrice,
      }))
      .sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0));
  }

  async getActiveQuestions() {
    return await getDbInstance().getActiveQuestions();
  }

  /**
   * Get game statistics from database.
   * Works even if engine is not running (daemon writes to database).
   */
  async getStats() {
    return await getDbInstance().getStats();
  }

  /**
   * Get all games from database
   */
  async getAllGames() {
    return await getDbInstance().getAllGames();
  }

  /**
   * Get game status.
   * Returns status indicating if game is running and tick is active.
   */
  async getStatus() {
    // Check game state from database
    const gameState = await getDbInstance().getGameState();
    return {
      isRunning: false,
      initialized: false,
      currentDay: gameState?.currentDay || 0,
      currentDate: gameState?.currentDate?.toISOString(),
      speed: 60000,
      lastTickAt: gameState?.lastTickAt?.toISOString(),
    };
  }

  async getRealtimePosts(limit = 100, offset = 0, actorId?: string) {
    // On Vercel: Read from database instead of filesystem
    // The daemon writes posts to database, so we can query them directly
    const posts = actorId
      ? await getDbInstance().getPostsByActor(actorId, limit)
      : await getDbInstance().getRecentPosts(limit, offset);

    if (!posts || posts.length === 0) {
      return null;
    }

    return {
      posts: posts.map((post) => ({
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        author: post.authorId, // Post model doesn't have author field, use authorId
        timestamp: post.createdAt.toISOString(),
        createdAt: post.createdAt.toISOString(),
        gameId: post.gameId,
        dayNumber: post.dayNumber,
      })),
      total: posts.length,
    };
  }
}

export const gameService = new GameService();

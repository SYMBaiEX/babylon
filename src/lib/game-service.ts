/**
 * Game Service - API Wrapper
 * 
 * Provides access to the engine for API routes.
 * Engine auto-starts in engine.ts
 */

import { getEngine } from './engine';
import { db } from './database-service';

class GameService {
  async getRecentPosts(limit = 100, offset = 0) {
    return await db.getRecentPosts(limit, offset);
  }

  async getPostsByActor(actorId: string, limit = 100) {
    return await db.getPostsByActor(actorId, limit);
  }

  async getCompanies() {
    return await db.getCompanies();
  }

  async getActiveQuestions() {
    return await db.getActiveQuestions();
  }

  async getStats() {
    const engine = getEngine();
    return await engine.getStats();
  }

  /**
   * Get all games from database
   */
  async getAllGames() {
    return await db.getAllGames();
  }

  /**
   * Get engine status
   */
  getStatus() {
    const engine = getEngine();
    return engine.getStatus();
  }
}

export const gameService = new GameService();

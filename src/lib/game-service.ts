/**
 * Game Service - API Wrapper
 * 
 * Provides access to the engine for API routes.
 * Engine auto-starts in engine.ts
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getEngine } from './engine';
import { db } from './database-service';
import { logger } from './logger';
import type { FeedPost } from '@/shared/types';

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

  async getRealtimePosts(limit = 100, offset = 0, actorId?: string) {
    try {
      const historyPath = join(process.cwd(), 'games', 'realtime', 'history.json');
      if (!existsSync(historyPath)) {
        return null;
      }

      const data = JSON.parse(readFileSync(historyPath, 'utf-8')) as {
        ticks?: Array<{ posts?: FeedPost[] }>;
      };

      const allPosts =
        data.ticks?.flatMap((tick) => tick.posts ?? [])?.filter((post) => !!post) ?? [];

      if (allPosts.length === 0) {
        return null;
      }

      const normalized = allPosts
        .map((post) => ({
          id: post.id,
          content: post.content,
          authorId: post.author,
          author: post.authorName ?? post.author,
          timestamp: post.timestamp,
          // Provide createdAt to match Prisma response shape
          createdAt: post.timestamp,
          gameId: 'realtime',
          dayNumber: post.day,
        }))
        .filter((post) => (actorId ? post.authorId === actorId : true))
        .sort((a, b) => {
          const aTime = new Date(a.timestamp ?? 0).getTime();
          const bTime = new Date(b.timestamp ?? 0).getTime();
          return bTime - aTime;
        });

      const paginated = normalized.slice(offset, offset + limit);
      return {
        posts: paginated,
        total: normalized.length,
      };
    } catch (error) {
      logger.error('Failed to read realtime history file:', error, 'GameService');
      return null;
    }
  }
}

export const gameService = new GameService();

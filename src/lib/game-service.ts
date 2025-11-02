/**
 * Game Service - API Wrapper
 * 
 * Provides access to the engine for API routes.
 * Engine is started via daemon (`bun run daemon`).
 * 
 * Note: Most operations query the database directly, which is updated by the daemon.
 * Engine status queries check if the daemon is running.
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

  /**
   * Get game statistics from database.
   * Works even if engine is not running (daemon writes to database).
   */
  async getStats() {
    // Try to get stats from engine if running, otherwise query database directly
    const engine = getEngine();
    if (engine) {
      try {
        return await engine.getStats();
      } catch (error) {
        logger.debug('Failed to get stats from engine, falling back to database', { error }, 'GameService');
      }
    }
    
    // Fallback to database directly (daemon writes here)
    return await db.getStats();
  }

  /**
   * Get all games from database
   */
  async getAllGames() {
    return await db.getAllGames();
  }

  /**
   * Get engine status.
   * Returns status indicating if daemon is running.
   */
  async getStatus() {
    const engine = getEngine();
    if (engine) {
      try {
        return await engine.getStatus();
      } catch (error) {
        logger.debug('Failed to get status from engine', { error }, 'GameService');
      }
    }
    
    // Engine not running (daemon not started)
    const gameState = await db.getGameState();
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

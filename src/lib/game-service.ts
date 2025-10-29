/**
 * Game Service - Database-Backed Continuous Generation
 * 
 * Runs when Next.js starts and generates content continuously.
 * Saves all data to PostgreSQL database.
 * 
 * On startup:
 * 1. Connects to database
 * 2. Loads existing game state OR initializes new game
 * 3. Starts continuous engine (generates every minute)
 * 4. Serves data via API
 * 
 * No more JSON files - everything in PostgreSQL!
 */

import { db } from './database-service';
import { continuousEngine } from './continuous-engine';

class GameService {
  private initialized = false;

  constructor() {
    // Auto-start on server-side only
    if (typeof window === 'undefined') {
      this.initialize().catch(error => {
        console.error('❌ Game Service failed to initialize:', error);
      });
    }
  }

  /**
   * Initialize the service
   */
  private async initialize() {
    if (this.initialized) return;

    console.log('\n🎮 GAME SERVICE: Initializing...\n');

    try {
      // Check database connection
      await this.checkDatabase();

      // Get current game state
      const gameState = await db.getGameState();
      
      if (!gameState) {
        console.log('📝 No game state found, initializing...');
        await db.initializeGame();
      } else {
        console.log(`✅ Game state loaded (Day ${gameState.currentDay})`);
      }

      // Get stats
      const stats = await db.getStats();
      console.log('\n📊 Current Stats:');
      console.log(`   Posts: ${stats.totalPosts}`);
      console.log(`   Questions: ${stats.activeQuestions}/${stats.totalQuestions}`);
      console.log(`   Organizations: ${stats.totalOrganizations}`);
      console.log(`   Actors: ${stats.totalActors}`);
      console.log(`   Day: ${stats.currentDay}\n`);

      // Start continuous engine
      await continuousEngine.start();

      this.initialized = true;
      console.log('✅ GAME SERVICE: Ready\n');

    } catch (error) {
      console.error('❌ GAME SERVICE: Initialization failed:', error);
      console.error('\nMake sure PostgreSQL is running:');
      console.error('  bun run db:start\n');
    }
  }

  /**
   * Check database connection
   */
  private async checkDatabase() {
    try {
      await db.getStats();
      console.log('✅ Database connected');
    } catch (error) {
      console.error('❌ Database connection failed');
      throw new Error('Database not available. Run: bun run db:start');
    }
  }

  /**
   * Get recent posts from database
   */
  async getRecentPosts(limit = 100, offset = 0) {
    return await db.getRecentPosts(limit, offset);
  }

  /**
   * Get posts by actor
   */
  async getPostsByActor(actorId: string, limit = 100) {
    return await db.getPostsByActor(actorId, limit);
  }

  /**
   * Get all companies
   */
  async getCompanies() {
    return await db.getCompanies();
  }

  /**
   * Get active questions
   */
  async getActiveQuestions() {
    return await db.getActiveQuestions();
  }

  /**
   * Get stats
   */
  async getStats() {
    return await db.getStats();
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
    return continuousEngine.getStatus();
  }
}

// Singleton instance
export const gameService = new GameService();

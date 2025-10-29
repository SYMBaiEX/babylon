/**
 * Continuous Game Engine with Database
 * 
 * Runs continuously, generating content every minute and saving to PostgreSQL.
 * - Generates 10-20 posts per minute
 * - Updates stock prices
 * - Creates/resolves questions
 * - All data persisted to database
 * 
 * Unlike monthly generation, this runs forever in small increments.
 */

import { FeedGenerator } from '@/engine/FeedGenerator';
import { BabylonLLMClient } from '@/generator/llm/openai-client';
import type { FeedPost } from '@/shared/types';
import { shuffleArray } from '@/shared/utils';
import { db } from './database-service';
import { QuestionManager } from '@/engine/QuestionManager';

export class ContinuousEngine {
  private llm: BabylonLLMClient;
  private feedGenerator: FeedGenerator;
  private questionManager: QuestionManager;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private nextQuestionNumber = 1;

  constructor() {
    this.llm = new BabylonLLMClient();
    this.feedGenerator = new FeedGenerator(this.llm);
    this.questionManager = new QuestionManager(this.llm);
  }

  /**
   * Start continuous generation
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Engine already running');
      return;
    }

    console.log('🚀 Starting Continuous Engine...');
    
    // Initialize game state in DB
    await db.initializeGame();
    
    this.isRunning = true;

    // Run first tick after 5 seconds
    setTimeout(() => {
      this.tick().catch(error => {
        console.error('❌ Tick error:', error);
      });
    }, 5000);

    // Then run every minute
    this.intervalId = setInterval(() => {
      this.tick().catch(error => {
        console.error('❌ Tick error:', error);
      });
    }, 60000); // 60 seconds

    console.log('✅ Continuous Engine running (1 tick per minute)');
  }

  /**
   * Stop continuous generation
   */
  stop() {
    if (!this.isRunning) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    console.log('🛑 Continuous Engine stopped');
  }

  /**
   * Single tick - generates content for this minute
   */
  private async tick() {
    const timestamp = new Date();
    console.log(`⏰ [${timestamp.toISOString()}] Tick...`);

    try {
      // Step 1: Check for questions to resolve
      const toResolve = await db.getQuestionsToResolve();
      if (toResolve.length > 0) {
        console.log(`  🎯 Resolving ${toResolve.length} questions`);
        for (const question of toResolve) {
          await db.resolveQuestion(question.id, question.outcome);
        }
      }

      // Step 2: Create new questions if needed
      const activeQuestions = await db.getActiveQuestions();
      if (activeQuestions.length < 15) {
        // Generate 1-3 new questions
        const toCreate = Math.min(3, 20 - activeQuestions.length);
        console.log(`  📝 Creating ${toCreate} new questions...`);
        
        try {
          // Get actors for context
          const actors = await db.getAllActors();
          
          // Simplified question generation for now
          for (let i = 0; i < toCreate; i++) {
            const resolutionDate = new Date();
            resolutionDate.setDate(resolutionDate.getDate() + 1 + Math.floor(Math.random() * 7)); // 1-7 days
            
            const randomActor = actors[Math.floor(Math.random() * actors.length)];
            
            await db.createQuestion({
              questionNumber: this.nextQuestionNumber,
              text: `Will something happen with ${randomActor?.name || 'someone'}?`,
              scenario: 1,
              outcome: Math.random() > 0.5,
              rank: 1,
              createdDate: timestamp.toISOString(),
              resolutionDate: resolutionDate.toISOString(),
              status: 'active',
            } as any);
            
            this.nextQuestionNumber++;
          }
          
          console.log(`  ✓ Created ${toCreate} questions`);
        } catch (error) {
          console.error('  ❌ Failed to create questions:', error);
        }
      } else {
        console.log(`  📝 Active questions: ${activeQuestions.length}/20`);
      }

      // Step 3: Generate posts (10-20 per minute)
      const posts = await this.generatePostsForTick();
      if (posts.length > 0) {
        await db.createManyPosts(posts.map(p => ({
          ...p,
          gameId: 'continuous',
          dayNumber: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
        })));
        console.log(`  📱 Generated ${posts.length} posts`);
      }

      // Step 4: Update game state
      await db.updateGameState({
        lastTickAt: timestamp,
        activeQuestions: activeQuestions.length,
      });

    } catch (error) {
      console.error('  ❌ Tick failed:', error);
    }
  }

  /**
   * Generate posts for this tick
   * Simplified version - selects random actors to post
   */
  private async generatePostsForTick(): Promise<FeedPost[]> {
    const posts: FeedPost[] = [];
    const numPosts = 10 + Math.floor(Math.random() * 11); // 10-20 posts
    
    // Get actors from database
    const actors = await db.getAllActors();
    if (actors.length === 0) return posts;

    // Select random actors
    const postingActors = shuffleArray(actors).slice(0, numPosts) as any[];
    
    for (const actorData of postingActors) {
      if (!actorData?.id || !actorData?.name) continue;
      
      const timestamp = new Date();
      
      posts.push({
        id: `post-${timestamp.getTime()}-${actorData.id}`,
        day: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
        timestamp: timestamp.toISOString(),
        type: 'post',
        content: `${actorData.name}'s thought at ${timestamp.toLocaleTimeString()}`,
        author: actorData.id,
        authorName: actorData.name,
        sentiment: Math.random() * 2 - 1,
        clueStrength: Math.random(),
        pointsToward: Math.random() > 0.5,
      });
    }

    return posts;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
    };
  }
}

// Singleton instance
export const continuousEngine = new ContinuousEngine();


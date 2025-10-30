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
import type { FeedPost, ActorTier, Organization, Question } from '@/shared/types';
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
      const activeQuestionsFromDb = await db.getActiveQuestions();

      // Convert to Question format
      const activeQuestions: Question[] = activeQuestionsFromDb.map(q => ({
        id: q.questionNumber,
        text: q.text,
        scenario: q.scenarioId,
        outcome: q.outcome,
        rank: q.rank,
        createdDate: q.createdDate.toISOString(),
        resolutionDate: q.resolutionDate.toISOString(),
        status: q.status as 'active' | 'resolved' | 'cancelled',
        resolvedOutcome: q.resolvedOutcome || undefined,
      }));

      if (activeQuestions.length < 15) {
        console.log(`  📝 Generating new questions...`);

        try {
          // Get context data for question generation
          const actorsFromDb = await db.getAllActors();
          const organizationsFromDb = await db.getAllOrganizations();
          const recentWorldEvents = await db.getRecentEvents(50);

          // Convert actors to SelectedActor format
          const actors = actorsFromDb.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description || undefined,
            domain: a.domain,
            personality: a.personality || undefined,
            canPostFeed: a.canPostFeed,
            canPostGroups: a.canPostGroups,
            role: (a.role || 'extra') as 'main' | 'supporting' | 'extra',
            affiliations: a.affiliations,
            postStyle: a.postStyle || undefined,
            postExample: a.postExample,
            tier: a.tier as ActorTier,
            initialLuck: a.initialLuck as 'low' | 'medium' | 'high',
            initialMood: a.initialMood,
          }));

          // Convert organizations to Organization format
          const organizations: Organization[] = organizationsFromDb.map(o => ({
            id: o.id,
            name: o.name,
            description: o.description,
            type: o.type as 'company' | 'media' | 'government',
            canBeInvolved: o.canBeInvolved,
            initialPrice: o.initialPrice || undefined,
            currentPrice: o.currentPrice || undefined,
          }));

          // Convert recent world events to DayTimeline format for context
          // Group events by day (approximated from timestamps)
          const eventsByDay = new Map<number, typeof recentWorldEvents>();
          recentWorldEvents.forEach(event => {
            const dayNum = Math.floor((new Date(event.timestamp).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            if (!eventsByDay.has(dayNum)) {
              eventsByDay.set(dayNum, []);
            }
            eventsByDay.get(dayNum)!.push(event);
          });

          const recentEvents = Array.from(eventsByDay.entries()).map(([day, events]) => ({
            day,
            summary: `Day ${day}`,
            events: events.map(e => ({
              id: e.id,
              day,
              type: e.eventType as any,
              actors: e.actors,
              description: e.description,
              relatedQuestion: e.relatedQuestion || undefined,
              pointsToward: e.pointsToward as any,
              visibility: e.visibility as any,
            })),
            groupChats: {},
            feedPosts: [],
            luckChanges: [],
            moodChanges: [],
          }));

          // Use QuestionManager to generate quality questions
          const newQuestions = await this.questionManager.generateDailyQuestions({
            currentDate: timestamp.toISOString().split('T')[0]!,
            scenarios: [], // Continuous mode doesn't use predefined scenarios
            actors,
            organizations,
            activeQuestions,
            recentEvents: recentEvents.slice(-5), // Last 5 days of events
            nextQuestionId: this.nextQuestionNumber,
          });

          // Save generated questions to database
          for (const question of newQuestions) {
            await db.createQuestion({
              questionNumber: question.id,
              text: question.text,
              scenario: question.scenario,
              outcome: question.outcome,
              rank: question.rank,
              createdDate: question.createdDate,
              resolutionDate: question.resolutionDate,
              status: question.status,
            } as any);

            this.nextQuestionNumber++;
          }

          console.log(`  ✓ Created ${newQuestions.length} questions`);
        } catch (error) {
          console.error('  ❌ Failed to generate questions:', error);
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
   * Uses FeedGenerator to create realistic social media posts
   */
  private async generatePostsForTick(): Promise<FeedPost[]> {
    try {
      // Get actors from database
      const actors = await db.getAllActors();
      if (actors.length === 0) return [];

      // Generate posts for random subset of actors (10-20 posts)
      const numPosts = Math.floor(Math.random() * 11) + 10; // 10-20 posts
      const shuffledActors = shuffleArray([...actors]);
      const selectedActors = shuffledActors.slice(0, Math.min(numPosts, actors.length));
      
      const posts: FeedPost[] = [];
      const timestamp = new Date();
      
      for (const actor of selectedActors) {
        // Generate realistic post content with LLM
        const postData = await this.generateRealisticPost(actor, timestamp);
        
        if (postData) {
          posts.push({
            id: `post-${timestamp.getTime()}-${actor.id}-${Math.random().toString(36).substr(2, 9)}`,
            day: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
            timestamp: timestamp.toISOString(),
            type: 'post',
            content: postData.content,
            author: actor.id,
            authorName: actor.name,
            sentiment: postData.sentiment,
            clueStrength: postData.energy, // Use energy as clue strength
            pointsToward: Math.random() > 0.5,
          });
        }
      }
      
      return posts;
    } catch (error) {
      console.error('Error generating posts:', error);
      return [];
    }
  }

  /**
   * Generate realistic post content based on actor
   * Delegates to FeedGenerator for proper integration
   */
  private async generateRealisticPost(actor: any, timestamp: Date): Promise<{
    content: string;
    sentiment: number;
    energy: number;
  } | null> {
    return await this.feedGenerator.generateMinuteAmbientPost(actor, timestamp);
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


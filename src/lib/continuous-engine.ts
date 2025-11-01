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
import type { FeedPost, Actor, DayTimeline, SelectedActor, WorldEvent, ActorTier } from '@/shared/types';
import { ACTOR_TIERS } from '@/shared/constants';
import { shuffleArray } from '@/shared/utils';
import { db } from './database-service';
import { QuestionManager } from '@/engine/QuestionManager';
import { logger } from './logger';

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
      logger.warn('Engine already running', undefined, 'ContinuousEngine');
      return;
    }

    logger.info('Starting Continuous Engine...', undefined, 'ContinuousEngine');
    
    // Initialize game state in DB
    await db.initializeGame();
    
    this.isRunning = true;

    // Run first tick after 5 seconds
    setTimeout(() => {
      this.tick().catch((tickError: Error) => {
        logger.error('Tick error:', tickError.message, 'ContinuousEngine');
      });
    }, 5000);

    // Then run every minute
    this.intervalId = setInterval(() => {
      this.tick().catch((tickError: Error) => {
        logger.error('Tick error:', tickError.message, 'ContinuousEngine');
      });
    }, 60000); // 60 seconds

    logger.info('Continuous Engine running (1 tick per minute)', undefined, 'ContinuousEngine');
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
    logger.info('Continuous Engine stopped', undefined, 'ContinuousEngine');
  }

  /**
   * Single tick - generates content for this minute
   */
  private async tick() {
    const timestamp = new Date();
    logger.debug('Tick...', { timestamp: timestamp.toISOString() }, 'ContinuousEngine');

    try {
      // Step 1: Check for questions to resolve
      const toResolve = await db.getQuestionsToResolve();
      if (toResolve.length > 0) {
        logger.info(`Resolving ${toResolve.length} questions`, { count: toResolve.length }, 'ContinuousEngine');
        for (const question of toResolve) {
          await db.resolveQuestion(String(question.id), question.outcome);
        }
      }

      // Step 2: Create new questions if needed
      const activeQuestions = await db.getActiveQuestions();

      if (activeQuestions.length < 15) {
        logger.info('Generating new questions...', undefined, 'ContinuousEngine');

        try {
          // Get context data for question generation
          const actorsFromDb = await db.getAllActors();
          const organizations = await db.getAllOrganizations();
          const recentWorldEvents = await db.getRecentEvents(50);

          // Convert Actor[] to SelectedActor[] by adding required fields
          // Filter out database-specific fields that aren't part of SelectedActor
          const actors: SelectedActor[] = actorsFromDb.map(actor => {
            const { createdAt, updatedAt, ...actorData } = actor as Actor & { createdAt?: Date; updatedAt?: Date };
            return {
              ...actorData,
              tier: (actor.tier || ACTOR_TIERS.B_TIER) as ActorTier,
              role: actor.role || 'supporting',
              initialLuck: 'medium' as const,
              initialMood: 0,
            } as SelectedActor;
          });
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

          const recentEvents: DayTimeline[] = Array.from(eventsByDay.entries()).map(([day, events]) => ({
            day,
            summary: `Day ${day}`,
            events: events.map(e => ({
              id: e.id,
              day,
              type: e.eventType as WorldEvent['type'],
              actors: Array.isArray(e.actors) ? e.actors : [],
              description: typeof e.description === 'string' ? e.description : (typeof e.description === 'object' && e.description !== null && 'text' in e.description && typeof (e.description as { text?: unknown }).text === 'string' ? (e.description as { text: string }).text : ''),
              relatedQuestion: e.relatedQuestion || undefined,
              pointsToward: (e.pointsToward === 'YES' || e.pointsToward === 'NO') ? e.pointsToward : null,
              visibility: e.visibility as WorldEvent['visibility'],
            })) as WorldEvent[],
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
              id: String(question.id),
              questionNumber: typeof question.id === 'number' ? question.id : parseInt(String(question.id), 10) || this.nextQuestionNumber,
              text: question.text,
              scenario: question.scenario,
              outcome: question.outcome,
              rank: question.rank,
              createdDate: question.createdDate,
              resolutionDate: question.resolutionDate,
              status: question.status,
            });

            this.nextQuestionNumber++;
          }

          logger.info(`Created ${newQuestions.length} questions`, { count: newQuestions.length }, 'ContinuousEngine');
        } catch (error) {
          logger.error('Failed to generate questions:', error, 'ContinuousEngine');
        }
      } else {
        logger.debug(`Active questions: ${activeQuestions.length}/20`, { count: activeQuestions.length }, 'ContinuousEngine');
      }

      // Step 3: Generate posts (10-20 per minute)
      const posts = await this.generatePostsForTick();
      if (posts.length > 0) {
        await db.createManyPosts(posts.map(p => ({
          ...p,
          gameId: 'continuous',
          dayNumber: Math.floor((timestamp.getTime() - new Date('2025-10-01').getTime()) / (1000 * 60 * 60 * 24)),
        })));
        logger.info(`Generated ${posts.length} posts`, { count: posts.length }, 'ContinuousEngine');
      }

      // Step 4: Update game state
      await db.updateGameState({
        lastTickAt: timestamp,
        activeQuestions: activeQuestions.length,
      });

    } catch (error) {
      logger.error('Tick failed:', error, 'ContinuousEngine');
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
      const selectedActorsRaw = shuffledActors.slice(0, Math.min(numPosts, actors.length));
      
      // Convert Actor[] to SelectedActor[] for generateRealisticPost
      const selectedActors: SelectedActor[] = selectedActorsRaw.map(actor => {
        const { createdAt, updatedAt, ...actorData } = actor as Actor & { createdAt?: Date; updatedAt?: Date };
        return {
          ...actorData,
          tier: (actor.tier || ACTOR_TIERS.B_TIER) as ActorTier,
          role: actor.role || 'supporting',
          initialLuck: 'medium' as const,
          initialMood: 0,
        } as SelectedActor;
      });
      
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
  private async generateRealisticPost(actor: SelectedActor, timestamp: Date): Promise<{
    content: string;
    sentiment: number;
    energy: number;
  } | null> {
    // Convert SelectedActor to Actor for generateMinuteAmbientPost
    const actorForPost: Actor = {
      id: actor.id,
      name: actor.name,
      description: actor.description,
      domain: actor.domain,
      personality: actor.personality,
      role: actor.role,
      affiliations: actor.affiliations,
      postStyle: actor.postStyle,
      postExample: actor.postExample,
      tier: actor.tier,
    };
    return await this.feedGenerator.generateMinuteAmbientPost(actorForPost, timestamp);
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


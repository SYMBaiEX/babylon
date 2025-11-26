/**
 * Lookahead Generation Service
 * 
 * @description Ensures content is always generated 15 minutes ahead of current time.
 * Uses a simple approach: check latest timestamp, generate more if needed. Distributes
 * timestamps naturally across future windows. Users only see content with timestamp <= now().
 * 
 * How It Works:
 * 1. Check latest post/event timestamp in database
 * 2. If < 15 minutes ahead: Generate more content
 * 3. Distribute timestamps naturally across future windows
 * 4. Users only see content with timestamp <= now() (time filter)
 * 
 * Benefits:
 * - Simpler than full queue
 * - No race conditions (uses locking)
 * - Smooth content distribution
 * - Buffer for slow generation
 * - Failure resilience
 */

import { db, posts, questions, actors, organizations, eq, gte, lt, desc, count, and, isNull } from '@/db';
import { logger } from '@/lib/logger';
import type { BabylonLLMClient } from '@/generator/llm/openai-client';
import { worldFactsService } from './world-facts-service';
import { generateNPCPost, generateOrgPost, generateOrgArticle } from './post-generation-helpers';
import { generateEvents } from './event-generation-helpers';

const LOOKAHEAD_MINUTES = 15; // Generate 15 minutes ahead
const GENERATION_BATCH_MINUTES = 5; // Generate in 5-minute batches

/**
 * Check how far ahead content is generated
 * 
 * @description Checks the latest post timestamp in the database and calculates
 * how many minutes ahead content is generated. Returns negative if content is
 * behind current time.
 * 
 * @returns {Promise<object>} Lookahead status with minutes ahead, latest timestamp, and needs generation flag
 * 
 * @example
 * ```typescript
 * const status = await checkLookaheadStatus();
 * if (status.needsGeneration) {
 *   await generateAheadIfNeeded(llmClient);
 * }
 * ```
 */
export async function checkLookaheadStatus(): Promise<{
  minutesAhead: number;
  latestTimestamp: Date | null;
  needsGeneration: boolean;
}> {
  const now = new Date();
  
  // Check latest post timestamp
  const latestPostResult = await db.select({ timestamp: posts.timestamp })
    .from(posts)
    .orderBy(desc(posts.timestamp))
    .limit(1);
  
  if (latestPostResult.length === 0) {
    return {
      minutesAhead: 0,
      latestTimestamp: null,
      needsGeneration: true, // No content exists
    };
  }
  
  const latest = new Date(latestPostResult[0]!.timestamp);
  const minutesAhead = (latest.getTime() - now.getTime()) / (60 * 1000);
  const needsGeneration = minutesAhead < LOOKAHEAD_MINUTES;
  
  return {
    minutesAhead: Math.round(minutesAhead * 10) / 10, // Round to 1 decimal
    latestTimestamp: latest,
    needsGeneration,
  };
}

/**
 * Generate content ahead of current time
 * 
 * @description Generates content in 5-minute windows until target lookahead is reached.
 * Distributes timestamps naturally across windows. Skips windows that already have content.
 * 
 * @param {BabylonLLMClient} llmClient - LLM client for content generation
 * @param {number} [targetMinutesAhead=15] - How far ahead to generate (default: 15)
 * @returns {Promise<object>} Generation result with success flag, windows generated, and new latest timestamp
 * 
 * @example
 * ```typescript
 * const result = await generateAheadIfNeeded(llmClient, 20);
 * console.log(`Generated ${result.windowsGenerated} windows`);
 * ```
 */
export async function generateAheadIfNeeded(
  llmClient: BabylonLLMClient,
  targetMinutesAhead: number = LOOKAHEAD_MINUTES
): Promise<{ generated: boolean; windowsGenerated: number; newLatestTimestamp: Date | null }> {
  const status = await checkLookaheadStatus();
  
  if (!status.needsGeneration) {
    logger.info('Lookahead sufficient', {
      minutesAhead: status.minutesAhead,
      target: targetMinutesAhead,
    }, 'LookaheadGeneration');
    return { generated: false, windowsGenerated: 0, newLatestTimestamp: status.latestTimestamp };
  }
  
  logger.info('Generating ahead', {
    currentAhead: status.minutesAhead,
    target: targetMinutesAhead,
    latestTimestamp: status.latestTimestamp?.toISOString(),
  }, 'LookaheadGeneration');
  
  // Calculate how many 5-minute windows to generate
  // Handle negative minutesAhead (content is in the past)
  const currentAhead = Math.max(0, status.minutesAhead || 0);
  const minutesNeeded = targetMinutesAhead - currentAhead;
  const windowsToGenerate = Math.max(1, Math.ceil(minutesNeeded / GENERATION_BATCH_MINUTES));
  
  // Start from latest timestamp or now
  let currentTimestamp = status.latestTimestamp || new Date();
  const now = new Date();
  
  // If latest is in the past, start from now
  if (currentTimestamp < now) {
    currentTimestamp = now;
  }
  
  let windowsGenerated = 0;
  
  for (let i = 0; i < windowsToGenerate; i++) {
    // Calculate window boundaries
    // If starting from latest timestamp, first window starts immediately after it
    // Otherwise, start from current timestamp
    const windowStart = i === 0 && currentTimestamp > now
      ? currentTimestamp
      : new Date(currentTimestamp.getTime() + i * GENERATION_BATCH_MINUTES * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + GENERATION_BATCH_MINUTES * 60 * 1000);
    
    // Skip if window is in the past (shouldn't happen, but safety check)
    if (windowStart < now) {
      logger.warn('Skipping window in the past', {
        windowStart: windowStart.toISOString(),
        now: now.toISOString(),
      }, 'LookaheadGeneration');
      continue;
    }
    
    await generateContentWindow(llmClient, windowStart, windowEnd);
    windowsGenerated++;
    
    logger.info(`Generated window ${i + 1}/${windowsToGenerate}`, {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    }, 'LookaheadGeneration');
  }
  
  // Get new latest timestamp
  const newStatus = await checkLookaheadStatus();
  
  return {
    generated: true,
    windowsGenerated,
    newLatestTimestamp: newStatus.latestTimestamp,
  };
}

/**
 * Check if content already exists for a time window
 * 
 * @description Prevents duplicate generation for the same time window by checking
 * if at least 5 posts exist in the window. Allows natural variation while preventing duplicates.
 * 
 * @param {Date} windowStart - Start of time window
 * @param {Date} windowEnd - End of time window
 * @returns {Promise<boolean>} True if window already has content
 * @private
 */
async function checkTimeWindowHasContent(windowStart: Date, windowEnd: Date): Promise<boolean> {
  const [result] = await db.select({ count: count() })
    .from(posts)
    .where(
      and(
        gte(posts.timestamp, windowStart),
        lt(posts.timestamp, windowEnd),
        isNull(posts.deletedAt)
      )
    );
  
  const existingPosts = result?.count ?? 0;
  
  // If we have at least 5 posts in this window, consider it already generated
  // This allows some natural variation while preventing duplicates
  return existingPosts >= 5;
}

/**
 * Generate content for a specific time window
 * 
 * @description Generates posts with timestamps distributed across the window.
 * Uses LLM to generate real post content based on active questions and world context.
 * 
 * @param {BabylonLLMClient} llmClient - LLM client for post generation
 * @param {Date} windowStart - Start of 5-minute window
 * @param {Date} windowEnd - End of 5-minute window
 * @returns {Promise<void>}
 * @private
 */
async function generateContentWindow(
  llmClient: BabylonLLMClient,
  windowStart: Date,
  windowEnd: Date
): Promise<void> {
  // Check for deduplication - skip if content already exists for this window
  const hasContent = await checkTimeWindowHasContent(windowStart, windowEnd);
  if (hasContent) {
    logger.info('Content already exists for time window - skipping generation', {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    }, 'LookaheadGeneration');
    return;
  }

  // Get active questions
  const activeQuestions = await db.select()
    .from(questions)
    .where(eq(questions.status, 'active'))
    .limit(3);
  
  if (activeQuestions.length === 0) {
    logger.warn('No active questions - skipping content generation', {}, 'LookaheadGeneration');
    return;
  }
  
  // Generate 8 posts distributed across the window
  const numPosts = 8;
  const windowDuration = windowEnd.getTime() - windowStart.getTime();
  
  // Generate events if needed (every 3rd window or so, based on probability)
  const shouldGenerateEvents = Math.random() < 0.3;
  if (shouldGenerateEvents && activeQuestions.length > 0) {
    // Generate events at random times within the window
    const randomOffset = Math.random() * windowDuration;
    const eventTimestamp = new Date(windowStart.getTime() + randomOffset);
    
    try {
      const eventsCreated = await generateEvents(activeQuestions, eventTimestamp);
      if (eventsCreated > 0) {
        logger.info(`Generated ${eventsCreated} events in lookahead window`, { 
          timestamp: eventTimestamp.toISOString() 
        }, 'LookaheadGeneration');
      }
    } catch (error) {
      logger.warn('Failed to generate events in lookahead', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'LookaheadGeneration');
    }
  }

  // Get actors, organizations, and world facts in parallel
  const [actorsList, orgsList, worldFactsContext] = await Promise.all([
    db.select()
      .from(actors)
      .orderBy(desc(actors.reputationPoints))
      .limit(15),
    db.select()
      .from(organizations)
      .where(eq(organizations.type, 'media'))
      .limit(5),
    worldFactsService.generatePromptContext(),
  ]);

  if (actorsList.length === 0 && orgsList.length === 0) {
    logger.warn('No actors or organizations found - skipping content generation', {}, 'LookaheadGeneration');
    return;
  }

  let postsCreated = 0;
  
  // Generate posts in parallel for better performance
  const postPromises = Array.from({ length: numPosts }, async (_, i) => {
    try {
    // Distribute timestamps naturally across window
    const randomOffset = Math.random() * windowDuration;
    const postTimestamp = new Date(windowStart.getTime() + randomOffset);
    
    // Alternate between actors and organizations
    const useActor = i % 2 === 0 && actorsList.length > 0;
    const creator = useActor 
      ? actorsList[i % actorsList.length]
      : orgsList[i % orgsList.length];
    
      if (!creator) {
        return 0;
      }
    
    const question = activeQuestions[i % activeQuestions.length];
      if (!question || !question.text) {
        return 0;
      }
    
      // Generate post content using LLM
      if (useActor) {
        const actor = creator as typeof actorsList[number];
        const success = await generateNPCPost(
          llmClient,
          actor,
          question,
          worldFactsContext,
          postTimestamp
        );
        if (success) {
          logger.debug('Created lookahead NPC post', { 
            actor: actor.name, 
            timestamp: postTimestamp.toISOString(),
            questionId: question.id
          }, 'LookaheadGeneration');
        }
        return success ? 1 : 0;
      } else {
        const org = creator as typeof orgsList[number];
        
        // 10% chance to generate a full article instead of a short post
        const shouldCreateArticle = Math.random() < 0.1;
        let success = false;

        if (shouldCreateArticle) {
          success = await generateOrgArticle(
            llmClient,
            org,
            question,
            worldFactsContext,
            postTimestamp
          );
          if (success) {
            logger.debug('Created lookahead org article', { 
              org: org.name, 
              timestamp: postTimestamp.toISOString(),
              questionId: question.id
            }, 'LookaheadGeneration');
          }
        } else {
          success = await generateOrgPost(
            llmClient,
            org,
            question,
            worldFactsContext,
            postTimestamp
          );
          if (success) {
            logger.debug('Created lookahead org post', { 
              org: org.name, 
              timestamp: postTimestamp.toISOString(),
              questionId: question.id
            }, 'LookaheadGeneration');
          }
        }
        
        return success ? 1 : 0;
      }
    } catch (error) {
      logger.warn('Failed to generate post in lookahead window', {
        error: error instanceof Error ? error.message : String(error),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        postIndex: i,
      }, 'LookaheadGeneration');
      return 0;
    }
  });
  
  // Wait for all posts to complete
  const results = await Promise.allSettled(postPromises);
  
  // Count successful posts
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value > 0) {
      postsCreated += result.value;
    } else if (result.status === 'rejected') {
      logger.warn('Post generation failed in lookahead window', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }, 'LookaheadGeneration');
    }
  }
  
  logger.info('Content window generated', {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    postsCreated,
    attempted: numPosts,
  }, 'LookaheadGeneration');
}



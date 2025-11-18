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

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { BabylonLLMClient } from '@/generator/llm/openai-client';
import { generateSnowflakeId } from '@/lib/snowflake';
import db from '@/lib/database-service';
import { characterMappingService } from './character-mapping-service';

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
  const latestPost = await prisma.post.findFirst({
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  
  if (!latestPost) {
    return {
      minutesAhead: 0,
      latestTimestamp: null,
      needsGeneration: true, // No content exists
    };
  }
  
  const latest = new Date(latestPost.timestamp);
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
  const existingPosts = await prisma.post.count({
    where: {
      timestamp: {
        gte: windowStart,
        lt: windowEnd,
      },
      deletedAt: null,
    },
  });
  
  // If we have at least 5 posts in this window, consider it already generated
  // This allows some natural variation while preventing duplicates
  return existingPosts >= 5;
}

/**
 * Generate content for a specific time window
 * 
 * @description Generates posts with timestamps distributed across the window.
 * This makes content feel continuous instead of chunky. Currently uses simplified
 * generation. Full LLM-based generation should be integrated by calling the generation
 * functions from serverless-game-tick.ts.
 * 
 * @param {BabylonLLMClient} _llmClient - LLM client (reserved for future use)
 * @param {Date} windowStart - Start of 5-minute window
 * @param {Date} windowEnd - End of 5-minute window
 * @returns {Promise<void>}
 * @private
 */
async function generateContentWindow(
  _llmClient: BabylonLLMClient, // Reserved for future use
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
  const activeQuestions = await prisma.question.findMany({
    where: { status: 'active' },
    take: 3,
  });
  
  if (activeQuestions.length === 0) {
    logger.warn('No active questions - skipping content generation', {}, 'LookaheadGeneration');
    return;
  }
  
  // Generate 8 posts distributed across the window
  const numPosts = 8;
  const windowDuration = windowEnd.getTime() - windowStart.getTime();
  
  // Get actors and organizations for content generation
  const [actors, organizations] = await Promise.all([
    prisma.actor.findMany({
      take: 15,
      orderBy: { reputationPoints: 'desc' },
    }),
    prisma.organization.findMany({
      where: { type: 'media' },
      take: 5,
    }),
  ]);

  if (actors.length === 0 && organizations.length === 0) {
    logger.warn('No actors or organizations found - skipping content generation', {}, 'LookaheadGeneration');
    return;
  }

  let postsCreated = 0;
  
  for (let i = 0; i < numPosts; i++) {
    // Distribute timestamps naturally across window
    const randomOffset = Math.random() * windowDuration;
    const postTimestamp = new Date(windowStart.getTime() + randomOffset);
    
    // Alternate between actors and organizations
    const useActor = i % 2 === 0 && actors.length > 0;
    const creator = useActor 
      ? actors[i % actors.length]
      : organizations[i % organizations.length];
    
    if (!creator) continue;
    
    const question = activeQuestions[i % activeQuestions.length];
    if (!question) continue;
    
    // Generate post content (simplified - reserved for future LLM generation)
    // For now, create a simple post. Full generation should use generateMixedPosts logic
    const content = `Post about: ${question.text}`;

    // Transform content to replace real names with parody names
    const transformed = await characterMappingService.transformText(content);
    if (transformed.replacementCount > 0) {
      logger.warn(`Fixed ${transformed.replacementCount} real name(s) in lookahead post`, {
        questionId: question.id,
        creator: creator.id,
      }, 'LookaheadGeneration');
    }

    try {
      // Store post with future timestamp
      await db().createPostWithAllFields({
        id: await generateSnowflakeId(),
        content: transformed.transformedText,
        authorId: creator.id,
        gameId: 'continuous',
        dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
        timestamp: postTimestamp,
      });
      postsCreated++;
    } catch (error) {
      logger.warn('Failed to create post in lookahead window', {
        error: error instanceof Error ? error.message : String(error),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
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



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

import {
  actorState,
  and,
  count,
  db,
  desc,
  eq,
  games,
  gte,
  isNull,
  lt,
  posts,
  questions,
} from '@babylon/db';
import type { BabylonLLMClient } from '@babylon/engine';
import { logger } from '@babylon/shared';
import {
  biasedRandomCount,
  secureRandom,
  secureShuffle,
  urgencyWeight,
  weightedPick,
} from '../utils/entropy';
import { worldFactsService } from '../world-facts-service';
import { generateEvents } from './event-generation-helpers';
import {
  generateNPCPost,
  generateOrgArticle,
  generateOrgPost,
  loadSharedPostContext,
} from './post-generation-helpers';
import { StaticDataRegistry } from './static-data-registry';

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
  const latestPostResult = await db
    .select({ timestamp: posts.timestamp })
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
): Promise<{
  generated: boolean;
  windowsGenerated: number;
  newLatestTimestamp: Date | null;
}> {
  const status = await checkLookaheadStatus();

  if (!status.needsGeneration) {
    logger.info(
      'Lookahead sufficient',
      {
        minutesAhead: status.minutesAhead,
        target: targetMinutesAhead,
      },
      'LookaheadGeneration'
    );
    return {
      generated: false,
      windowsGenerated: 0,
      newLatestTimestamp: status.latestTimestamp,
    };
  }

  logger.info(
    'Generating ahead',
    {
      currentAhead: status.minutesAhead,
      target: targetMinutesAhead,
      latestTimestamp: status.latestTimestamp?.toISOString(),
    },
    'LookaheadGeneration'
  );

  // Calculate how many 5-minute windows to generate
  // Handle negative minutesAhead (content is in the past)
  const currentAhead = Math.max(0, status.minutesAhead || 0);
  const minutesNeeded = targetMinutesAhead - currentAhead;
  const windowsToGenerate = Math.max(
    1,
    Math.ceil(minutesNeeded / GENERATION_BATCH_MINUTES)
  );

  // Start from whichever is later: now or last content timestamp
  const now = new Date();
  const baseTimestamp =
    status.latestTimestamp && status.latestTimestamp > now
      ? status.latestTimestamp
      : now;

  let windowsGenerated = 0;

  for (let i = 0; i < windowsToGenerate; i++) {
    // Calculate window boundaries consistently from baseTimestamp
    // Each window is exactly GENERATION_BATCH_MINUTES long with no overlaps
    const windowStart = new Date(
      baseTimestamp.getTime() + i * GENERATION_BATCH_MINUTES * 60 * 1000
    );
    const windowEnd = new Date(
      windowStart.getTime() + GENERATION_BATCH_MINUTES * 60 * 1000
    );

    // Safety: skip if window end is somehow in the past
    if (windowEnd < now) {
      logger.warn(
        'Skipping window in the past',
        {
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          now: now.toISOString(),
        },
        'LookaheadGeneration'
      );
      continue;
    }

    await generateContentWindow(llmClient, windowStart, windowEnd);
    windowsGenerated++;

    logger.info(
      `Generated window ${i + 1}/${windowsToGenerate}`,
      {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
      'LookaheadGeneration'
    );
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
async function checkTimeWindowHasContent(
  windowStart: Date,
  windowEnd: Date
): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
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
    logger.info(
      'Content already exists for time window - skipping generation',
      {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
      'LookaheadGeneration'
    );
    return;
  }

  // Get the continuous game to calculate current day for arc plan phase detection
  const game = await db
    .select({ startedAt: games.startedAt })
    .from(games)
    .where(eq(games.isContinuous, true))
    .limit(1);

  // Calculate current game day (0-indexed from game start)
  const gameStartedAt = game[0]?.startedAt;
  const currentDay = gameStartedAt
    ? Math.floor(
        (windowStart.getTime() - gameStartedAt.getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : undefined;

  // Get active questions
  const activeQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.status, 'active'))
    .limit(3);

  if (activeQuestions.length === 0) {
    logger.warn(
      'No active questions - skipping content generation',
      {},
      'LookaheadGeneration'
    );
    return;
  }

  // Vary post count per window (6-10) using biased random for natural distribution
  const numPosts = biasedRandomCount(6, 10);
  const windowDuration = windowEnd.getTime() - windowStart.getTime();

  // Generate events probabilistically using secure random
  const shouldGenerateEvents = secureRandom() < 0.3;
  if (shouldGenerateEvents && activeQuestions.length > 0) {
    // Generate events at random times within the window
    const randomOffset = secureRandom() * windowDuration;
    const eventTimestamp = new Date(windowStart.getTime() + randomOffset);

    // Pass currentDay for arc plan phase detection and signal direction
    const eventsCreated = await generateEvents(
      activeQuestions,
      eventTimestamp,
      currentDay
    );
    if (eventsCreated > 0) {
      logger.info(
        `Generated ${eventsCreated} events in lookahead window`,
        {
          timestamp: eventTimestamp.toISOString(),
          currentDay,
        },
        'LookaheadGeneration'
      );
    }
  }

  // Get actors, organizations, world facts, AND shared post context in parallel
  // Loading shared context ONCE eliminates N+1 queries during parallel post generation
  const [actorStates, worldFactsContext, sharedContext] = await Promise.all([
    db
      .select()
      .from(actorState)
      .orderBy(desc(actorState.reputationPoints))
      .limit(15),
    worldFactsService.generatePromptContext(),
    loadSharedPostContext(), // Load ONCE for all NPC posts
  ]);

  // Combine static actor data with dynamic state
  const actorsList = actorStates
    .map((state) => {
      const staticActor = StaticDataRegistry.getActor(state.id);
      if (!staticActor) return null;
      return {
        ...staticActor,
        tradingBalance: state.tradingBalance,
        reputationPoints: state.reputationPoints,
        hasPool: state.hasPool,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // Get media organizations from static registry
  const orgsList = StaticDataRegistry.getAllOrganizations()
    .filter((org) => org.type === 'media')
    .slice(0, 5);

  if (actorsList.length === 0 && orgsList.length === 0) {
    logger.warn(
      'No actors or organizations found - skipping content generation',
      {},
      'LookaheadGeneration'
    );
    return;
  }

  let postsCreated = 0;

  // Pre-shuffle actors and orgs for this window to avoid deterministic selection
  const shuffledActors = secureShuffle(actorsList);
  const shuffledOrgs = secureShuffle(orgsList);
  const shuffledQuestions = secureShuffle([...activeQuestions]);

  // Generate posts in parallel for better performance
  const postPromises = Array.from({ length: numPosts }, async (_, i) => {
    // Distribute timestamps naturally across window using secure random
    const randomOffset = secureRandom() * windowDuration;
    const postTimestamp = new Date(windowStart.getTime() + randomOffset);

    // Weighted random choice between actor and org (70% actor, 30% org if both available)
    const useActor =
      shuffledActors.length > 0 &&
      (shuffledOrgs.length === 0 || secureRandom() < 0.7);

    // Pick from shuffled lists with wraparound
    const creator = useActor
      ? shuffledActors[i % shuffledActors.length]
      : shuffledOrgs[i % shuffledOrgs.length];

    if (!creator) {
      return 0;
    }

    // Weight question selection toward those with sooner resolution dates using urgency scoring
    const question =
      shuffledQuestions.length > 0
        ? weightedPick(shuffledQuestions, urgencyWeight(5))
        : activeQuestions[0];

    if (!question || !question.text) {
      return 0;
    }

    // Generate post content using LLM
    if (useActor) {
      const actor = creator as (typeof actorsList)[number];
      const success = await generateNPCPost(
        llmClient,
        actor,
        question,
        worldFactsContext,
        postTimestamp,
        sharedContext, // Pass pre-loaded context to avoid N+1 queries
        currentDay // Pass currentDay for arc plan phase detection and signal guidance
      );
      if (success) {
        logger.debug(
          'Created lookahead NPC post',
          {
            actor: actor.name,
            timestamp: postTimestamp.toISOString(),
            questionId: question.id,
            currentDay,
          },
          'LookaheadGeneration'
        );
      }
      return success ? 1 : 0;
    }
    const org = creator as (typeof orgsList)[number];

    // 10% chance to generate a full article instead of a short post
    const shouldCreateArticle = secureRandom() < 0.1;
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
        logger.debug(
          'Created lookahead org article',
          {
            org: org.name,
            timestamp: postTimestamp.toISOString(),
            questionId: question.id,
          },
          'LookaheadGeneration'
        );
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
        logger.debug(
          'Created lookahead org post',
          {
            org: org.name,
            timestamp: postTimestamp.toISOString(),
            questionId: question.id,
          },
          'LookaheadGeneration'
        );
      }
    }

    return success ? 1 : 0;
  });

  // Wait for all posts to complete
  const results = await Promise.allSettled(postPromises);

  // Count successful posts
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value > 0) {
      postsCreated += result.value;
    } else if (result.status === 'rejected') {
      logger.warn(
        'Post generation failed in lookahead window',
        {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
        'LookaheadGeneration'
      );
    }
  }

  logger.info(
    'Content window generated',
    {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      postsCreated,
      attempted: numPosts,
    },
    'LookaheadGeneration'
  );
}

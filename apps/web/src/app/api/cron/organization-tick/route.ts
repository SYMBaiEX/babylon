/**
 * Organization Tick Cron Job API
 *
 * @route POST /api/cron/organization-tick - Execute organization autonomous tick
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Dedicated cron job for media organizations (AINBC, AIxios, BloombAIrg, etc.)
 * to generate SHORT POSTS ONLY (social media style updates).
 *
 * Article generation is handled separately by /api/cron/article-tick.
 * This separation provides:
 * 1. Organizations post frequently (social media presence)
 * 2. Articles are rate-limited and event-driven
 * 3. Clear separation of concerns
 *
 * Architecture:
 * - game-tick: Game engine (markets, events, world state)
 * - npc-tick: Actor NPCs (Sam AIltman, AIlon Musk, etc.)
 * - organization-tick: Media org POSTS only (short updates)
 * - article-tick: ALL article generation (centralized, rate-limited)
 * - agent-tick: User-created agents
 */

import {
  DistributedLockService,
  getCacheOrFetch,
  recordCronExecution,
  relayCronToStaging,
  verifyCronAuth,
} from '@babylon/api';
import { db, eq, games, generateSnowflakeId, posts } from '@babylon/db';
import {
  BabylonLLMClient,
  getActiveEventsForPosting,
  StaticDataRegistry,
  secureRandom,
  worldFactsService,
} from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureEngineServices } from '@/lib/engine/ensure-engine-services';

/**
 * Maximum consecutive errors before aborting the tick (circuit breaker).
 * Prevents cascading failures if there's a systemic issue.
 * Mirrors the same pattern used in npc-tick.
 */
const MAX_CONSECUTIVE_ERRORS = Number(process.env.ORG_TICK_MAX_ERRORS) || 5;

/**
 * Zod schema for validating LLM response formats.
 * Handles both direct { post: string } and wrapped { response: { post: string } } formats.
 */
const LLMPostResponseSchema = z.union([
  z.object({ post: z.string().min(1) }),
  z.object({ response: z.object({ post: z.string().min(1) }) }),
]);

/**
 * Extract post content from validated LLM response.
 * Returns the post string or null if extraction fails.
 */
function extractPostFromResponse(
  response: z.infer<typeof LLMPostResponseSchema>
): string {
  if ('response' in response && response.response?.post) {
    return response.response.post;
  }
  if ('post' in response) {
    return response.post;
  }
  // This shouldn't happen after Zod validation, but TypeScript needs it
  throw new Error('Unexpected response structure after validation');
}

/** Game state shape for cache */
interface GameState {
  id: string;
  isRunning: boolean;
  isContinuous: boolean;
  currentDay: number | null;
}

// Vercel function configuration
export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';

/**
 * Number of organizations to process per tick.
 * Configurable via ORG_TICK_BATCH_SIZE environment variable.
 * Each org generates 1 short post per tick.
 */
const ORGS_PER_TICK = Number(process.env.ORG_TICK_BATCH_SIZE) || 2;

/**
 * GET /api/cron/organization-tick
 * Alias for POST endpoint to support GET requests from cron services.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * POST /api/cron/organization-tick
 *
 * Executes organization autonomous tick for media orgs.
 */
export async function POST(_req: NextRequest) {
  ensureEngineServices();

  // Verify cron authorization
  if (!verifyCronAuth(_req, { jobName: 'OrganizationTick' })) {
    logger.warn(
      'Unauthorized organization-tick request attempt',
      undefined,
      'OrganizationTick'
    );
    return NextResponse.json(
      { error: 'Unauthorized cron request' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const processId = `org-tick-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  logger.info('Organization tick started', { processId }, 'OrganizationTick');

  // Relay to staging if configured
  const relayResult = await relayCronToStaging(_req, 'organization-tick');
  if (relayResult.forwarded) {
    logger.info(
      'Cron execution relayed to staging - skipping local execution',
      { status: relayResult.status, error: relayResult.error },
      'OrganizationTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Relayed to staging environment',
      relayStatus: relayResult.status,
      processed: 0,
    });
  }

  // Acquire global lock to prevent overlapping cron invocations
  // Duration matches maxDuration (300s) to prevent overlap when ticks take longer than cron interval
  const globalLockAcquired = await DistributedLockService.acquireLock({
    lockId: 'organization-tick-global',
    durationMs: 300 * 1000, // 300 seconds (5 minutes) - matches maxDuration
    operation: 'organization-tick-global',
    processId,
  });
  if (!globalLockAcquired) {
    logger.info(
      'Organization tick skipped - previous tick still running',
      { processId },
      'OrganizationTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Previous tick still running',
      processed: 0,
    });
  }

  // Wrap remaining logic in try-finally to ensure global lock release
  try {
    // Check GAME_START environment variable
    const gameStartEnv = process.env.GAME_START?.toLowerCase();
    if (gameStartEnv === 'false' || gameStartEnv === '0') {
      logger.info(
        'Game disabled via GAME_START env var - skipping organization tick',
        { GAME_START: process.env.GAME_START },
        'OrganizationTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game disabled via GAME_START environment variable',
        processed: 0,
      });
    }

    // Check Game status from database (cached for 60s to reduce DB load)
    const gameState = await getCacheOrFetch<GameState | null>(
      'continuous-game',
      async () => {
        const [game] = await db
          .select({
            id: games.id,
            isRunning: games.isRunning,
            isContinuous: games.isContinuous,
            currentDay: games.currentDay,
          })
          .from(games)
          .where(eq(games.isContinuous, true))
          .limit(1);
        return game ?? null;
      },
      { namespace: 'organization-tick', ttl: 60 }
    );

    if (!gameState) {
      logger.info(
        'Organization tick skipped (No continuous game found)',
        {},
        'OrganizationTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No continuous game found',
        duration: Date.now() - startTime,
        processed: 0,
      });
    }

    if (!gameState.isRunning) {
      logger.info(
        'Organization tick paused (Game is not running)',
        { gameId: gameState.id },
        'OrganizationTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game is paused',
        gameId: gameState.id,
        duration: Date.now() - startTime,
        processed: 0,
      });
    }

    // Get all media organizations from the StaticDataRegistry
    const allOrgs = StaticDataRegistry.getAllOrganizations().filter(
      (org) => org.type === 'media'
    );

    if (allOrgs.length === 0) {
      logger.warn(
        'No media organizations found in registry',
        {},
        'OrganizationTick'
      );
      return NextResponse.json({
        success: true,
        processed: 0,
        duration: Date.now() - startTime,
        warning: 'No media organizations found in registry',
      });
    }

    // Get active events for context
    const activeEventsData = await getActiveEventsForPosting();

    // Get world facts for context
    const worldFactsContext = await worldFactsService.generatePromptContext();

    // Randomly select organizations for this tick using Fisher-Yates shuffle with secureRandom
    const shuffledOrgs = [...allOrgs];
    for (let i = shuffledOrgs.length - 1; i > 0; i--) {
      const j = Math.floor(secureRandom() * (i + 1));
      const temp = shuffledOrgs[i]!;
      shuffledOrgs[i] = shuffledOrgs[j]!;
      shuffledOrgs[j] = temp;
    }
    const orgsThisTick = shuffledOrgs.slice(0, ORGS_PER_TICK);

    logger.info(
      `Organization tick processing ${orgsThisTick.length} orgs`,
      {
        totalOrgs: allOrgs.length,
        selectedOrgs: orgsThisTick.map((o) => o.name),
      },
      'OrganizationTick'
    );

    const results: Array<{
      orgId: string;
      name: string;
      status: string;
      error?: string;
      duration: number;
    }> = [];
    let postsCreated = 0;
    let errors = 0;
    let consecutiveOrgErrors = 0;
    let abortedDueToCircuitBreaker = false;

    // Create LLM client for organization posts
    const llmClient = BabylonLLMClient.forGameTick();

    for (const org of orgsThisTick) {
      // Circuit breaker: abort if too many consecutive errors
      if (consecutiveOrgErrors >= MAX_CONSECUTIVE_ERRORS) {
        abortedDueToCircuitBreaker = true;
        logger.error(
          `Circuit breaker triggered after ${consecutiveOrgErrors} consecutive errors`,
          { processId, orgsRemaining: orgsThisTick.length - results.length },
          'OrganizationTick'
        );
        break;
      }

      const orgStartTime = Date.now();

      try {
        // Generate content based on active events and world context
        const eventContext =
          activeEventsData.activeEvents.length > 0
            ? `Recent events: ${activeEventsData.activeEvents
                .slice(0, 3)
                .map((e) => e.questionId)
                .join(', ')}`
            : '';

        // Build prompt for organization POST (not article - articles are handled by article-tick)
        const prompt = buildOrgPostPrompt(org, worldFactsContext, eventContext);

        // Generate content using LLM
        const rawResponse = await llmClient.generateJSON<
          { post: string } | { response: { post: string } }
        >(
          prompt,
          {
            properties: { post: { type: 'string' } },
            required: ['post'],
          },
          {
            maxTokens: 280,
            temperature: 0.8,
          }
        );

        // Validate LLM response with Zod schema
        const parseResult = LLMPostResponseSchema.safeParse(rawResponse);
        if (!parseResult.success) {
          logger.warn(
            'LLM response failed schema validation',
            {
              orgId: org.id,
              orgName: org.name,
              errors: parseResult.error.issues,
              rawResponse: JSON.stringify(rawResponse).slice(0, 200),
            },
            'OrganizationTick'
          );
          throw new Error(
            `Invalid LLM response format: ${parseResult.error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`
          );
        }

        // Extract post content from validated response
        const rawPost = extractPostFromResponse(parseResult.data);

        if (rawPost.trim().length === 0) {
          throw new Error('Empty post content from LLM');
        }

        // Parse response and create post
        const content = rawPost.trim();
        const now = new Date();

        // Create the post in database (always type: 'post', never 'article')
        const postId = await generateSnowflakeId();
        await db.insert(posts).values({
          id: postId,
          content,
          authorId: org.id,
          gameId: gameState.id,
          dayNumber: gameState.currentDay ?? 1,
          timestamp: now,
          createdAt: now,
          type: 'post',
        });

        postsCreated++;
        consecutiveOrgErrors = 0; // Reset on success
        results.push({
          orgId: org.id,
          name: org.name,
          status: 'success',
          duration: Date.now() - orgStartTime,
        });

        logger.info(
          `Organization ${org.name} created post`,
          {
            orgId: org.id,
            postId,
            duration: Date.now() - orgStartTime,
          },
          'OrganizationTick'
        );
      } catch (error) {
        errors++;
        consecutiveOrgErrors++;
        logger.error(
          `Error processing organization ${org.name}`,
          {
            orgId: org.id,
            error: error instanceof Error ? error.message : String(error),
            consecutiveOrgErrors,
          },
          'OrganizationTick'
        );

        results.push({
          orgId: org.id,
          name: org.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - orgStartTime,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info(
      `Organization tick completed in ${duration}ms`,
      {
        orgsProcessed: orgsThisTick.length,
        postsCreated,
        errors,
      },
      'OrganizationTick'
    );

    // Record metrics
    // Consider success if there were no errors OR if some work succeeded (partial success)
    recordCronExecution('organization-tick', new Date(startTime), {
      success: errors === 0 || postsCreated > 0,
      processed: orgsThisTick.length,
      postsCreated,
      errorCount: errors,
      abortedDueToCircuitBreaker,
    });

    return NextResponse.json({
      success: errors === 0 && !abortedDueToCircuitBreaker,
      processed: orgsThisTick.length,
      postsCreated,
      duration,
      errors,
      abortedDueToCircuitBreaker,
      results,
    });
  } finally {
    // Always release global lock
    await DistributedLockService.releaseLock(
      'organization-tick-global',
      processId
    );
  }
}

/**
 * Build a prompt for organization POST generation (not articles).
 * Articles are handled by the separate article-tick cron job.
 */
function buildOrgPostPrompt(
  org: { id: string; name: string; description?: string },
  worldFacts: string,
  eventContext: string
): string {
  const orgStyle = getOrgStyle(org.id);

  return `You are posting as ${org.name}, a ${org.description || 'news organization'}.

${worldFacts}

${eventContext}

Write a short news post (1-2 sentences, under 280 characters) in the style of ${org.name}.
${orgStyle}

The post should:
- Be breaking news, an update, or commentary
- Use the publication's voice and editorial stance
- Include relevant hashtags if appropriate
- Be attention-grabbing but factual
- Reference specific parody names (AIlon Musk, Sam AIltman, etc.) when relevant`;
}

/**
 * Get the editorial style for an organization.
 * Uses the postStyle from StaticDataRegistry if available,
 * otherwise falls back to a default professional style.
 */
function getOrgStyle(orgId: string): string {
  const org = StaticDataRegistry.getOrganization(orgId);
  if (org?.postStyle) {
    return org.postStyle;
  }

  return 'Professional news reporting style.';
}

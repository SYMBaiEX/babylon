/**
 * Organization Tick Cron Job API
 *
 * @route POST /api/cron/organization-tick - Execute organization autonomous tick
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Dedicated cron job for media organizations (AINBC, AIxios, BloombAIrg, etc.).
 * Runs separately from npc-tick (actors) to:
 * 1. Generate news posts and articles from media orgs
 * 2. Allow independent control over org posting frequency
 * 3. React to world events with breaking news
 *
 * Architecture:
 * - game-tick: Game engine (lookahead buffer, markets, world state)
 * - npc-tick: Actor NPCs (Sam AIltman, AIlon Musk, etc.)
 * - organization-tick: Media orgs (AINBC, AIxios, BloombAIrg)
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
 */
const ORGS_PER_TICK = Number(process.env.ORG_TICK_BATCH_SIZE) || 2;

/**
 * Probability of generating an article vs a post (0-1).
 * Articles are longer-form content, posts are short news updates.
 */
const ARTICLE_PROBABILITY = 0.15;

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

    // Randomly select organizations for this tick using secureRandom for consistency
    const shuffledOrgs = [...allOrgs].sort(() => secureRandom() - 0.5);
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
      postType?: 'post' | 'article';
      error?: string;
      duration: number;
    }> = [];
    let postsCreated = 0;
    let errors = 0;

    // Create LLM client for organization posts
    const llmClient = BabylonLLMClient.forGameTick();

    for (const org of orgsThisTick) {
      const orgStartTime = Date.now();

      try {
        // Determine if this should be an article or a post
        const isArticle = secureRandom() < ARTICLE_PROBABILITY;
        const postType = isArticle ? 'article' : 'post';

        // Generate content based on active events and world context
        const eventContext =
          activeEventsData.activeEvents.length > 0
            ? `Recent events: ${activeEventsData.activeEvents
                .slice(0, 3)
                .map((e) => e.questionId)
                .join(', ')}`
            : '';

        // Build prompt for organization post
        const prompt = buildOrgPrompt(
          org,
          worldFactsContext,
          eventContext,
          isArticle
        );

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
            maxTokens: isArticle ? 800 : 280,
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

        // Create the post in database
        const postId = await generateSnowflakeId();
        await db.insert(posts).values({
          id: postId,
          content: isArticle ? content.substring(0, 500) : content,
          authorId: org.id,
          gameId: gameState.id,
          dayNumber: gameState.currentDay ?? 1,
          timestamp: now,
          createdAt: now,
          type: isArticle ? 'article' : 'post',
          ...(isArticle && {
            articleTitle: extractTitle(content),
            fullContent: content,
            category: 'news',
          }),
        });

        postsCreated++;
        results.push({
          orgId: org.id,
          name: org.name,
          status: 'success',
          postType,
          duration: Date.now() - orgStartTime,
        });

        logger.info(
          `Organization ${org.name} created ${postType}`,
          {
            orgId: org.id,
            postId,
            postType,
            duration: Date.now() - orgStartTime,
          },
          'OrganizationTick'
        );
      } catch (error) {
        errors++;
        logger.error(
          `Error processing organization ${org.name}`,
          {
            orgId: org.id,
            error: error instanceof Error ? error.message : String(error),
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
    recordCronExecution('organization-tick', new Date(startTime), {
      success: errors === 0,
      processed: orgsThisTick.length,
      postsCreated,
      errorCount: errors,
    });

    return NextResponse.json({
      success: errors === 0,
      processed: orgsThisTick.length,
      postsCreated,
      duration,
      errors,
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
 * Build a prompt for organization post generation
 */
function buildOrgPrompt(
  org: { id: string; name: string; description?: string },
  worldFacts: string,
  eventContext: string,
  isArticle: boolean
): string {
  const orgStyle = getOrgStyle(org.id);

  if (isArticle) {
    return `You are writing as ${org.name}, a ${org.description || 'news organization'}.

${worldFacts}

${eventContext}

Write a short news article (2-3 paragraphs) in the style of ${org.name}.
${orgStyle}

The article should:
- Have a compelling headline
- Cover current events in the AI/crypto/tech space
- Match the publication's voice and editorial stance
- Be concise but informative

Format: Start with the headline, then the article body.`;
  }

  return `You are posting as ${org.name}, a ${org.description || 'news organization'}.

${worldFacts}

${eventContext}

Write a short news post (1-2 sentences, under 280 characters) in the style of ${org.name}.
${orgStyle}

The post should:
- Be breaking news or an update
- Use the publication's voice
- Include relevant hashtags if appropriate
- Be attention-grabbing but factual`;
}

/**
 * Get the editorial style for an organization
 */
function getOrgStyle(orgId: string): string {
  const styles: Record<string, string> = {
    ainbc: 'Mainstream, balanced reporting with slight establishment lean.',
    aixios: 'Punchy, newsletter-style updates. Smart brevity.',
    bloombairg: 'Financial focus, data-driven, professional tone.',
    ainfowars: 'Conspiratorial, anti-establishment, sensationalist.',
    techcrainch: 'Startup and tech focused, insider perspective.',
    'the-vairge': 'Consumer tech, cultural commentary, accessible.',
    waired: 'Long-form tech journalism, thoughtful analysis.',
    'aimerica-first': 'Populist, America-first perspective, anti-globalist.',
  };

  return styles[orgId] || 'Professional news reporting style.';
}

/**
 * Extract a title from article content
 */
function extractTitle(content: string): string {
  // Try to extract first line as title
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length > 0) {
    const firstLine = lines[0]!.trim();
    // Remove common title markers
    return firstLine
      .replace(/^#+\s*/, '')
      .replace(/^\*\*(.+)\*\*$/, '$1')
      .replace(/^"(.+)"$/, '$1')
      .substring(0, 200);
  }
  return 'Breaking News';
}

/**
 * Article Tick Cron Job API
 *
 * @route POST /api/cron/article-tick - Execute article generation tick
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Centralized cron job for ALL article generation. Runs independently from
 * organization-tick which handles short social media posts.
 *
 * This separation provides:
 * 1. Clear rate limiting control (2 articles/hour max)
 * 2. Event-driven article generation (arc events, question milestones)
 * 3. Proper pacing without flooding the feed
 * 4. Organizations can be aware of their own articles for context
 *
 * Architecture:
 * - game-tick: Game engine (markets, events, world state)
 * - npc-tick: Actor NPCs (Sam AIltman, AIlon Musk, etc.)
 * - organization-tick: Media org POSTS only (short news updates)
 * - article-tick: ALL article generation (centralized)
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
  ArticleGenerator,
  articleRateLimiter,
  BabylonLLMClient,
  characterMappingService,
  generateArticleImageWithRetry,
  getActiveEventsForPosting,
  hasEventBeenCovered,
  markEventAsCovered,
  StaticDataRegistry,
  secureRandom,
  worldFactsService,
} from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
 * Maximum articles to generate per tick.
 *
 * Set to 1 to ensure:
 * - Minimal TOCTOU race window (only one article attempt per tick)
 * - Even distribution across cron intervals
 * - Predictable LLM cost per tick
 *
 * With cron running every 10 minutes, this allows up to 6 articles/hour
 * if the rate limiter (default 2/hour) permits.
 */
const MAX_ARTICLES_PER_TICK = 1;

/**
 * Article payload for persistence
 */
interface ArticlePayload {
  title: string;
  summary: string;
  article: string;
}

/**
 * Persist an article to the database.
 * Handles text transformation, image generation, and DB insert.
 *
 * @param payload - The article content (title, summary, article body)
 * @param authorId - The organization ID authoring the article
 * @param gameState - Current game state for context
 * @returns The created post ID
 */
async function persistArticle(
  payload: ArticlePayload,
  authorId: string,
  gameState: GameState
): Promise<string> {
  // Validate required fields before doing any work
  const trimmedTitle = payload.title?.trim() ?? '';
  const trimmedSummary = payload.summary?.trim() ?? '';
  const trimmedArticle = payload.article?.trim() ?? '';

  if (!trimmedTitle) {
    throw new Error('Missing article title');
  }
  if (!trimmedSummary) {
    throw new Error('Missing article summary');
  }
  if (!trimmedArticle) {
    throw new Error('Missing article body');
  }
  if (!authorId) {
    throw new Error('Missing authorId');
  }
  if (!gameState?.id) {
    throw new Error('Missing gameState.id');
  }

  // Transform content to use parody names
  const transformedTitle =
    await characterMappingService.transformText(trimmedTitle);
  const transformedSummary =
    await characterMappingService.transformText(trimmedSummary);
  const transformedBody =
    await characterMappingService.transformText(trimmedArticle);

  // Generate article image if available
  let imageUrl: string | null = null;
  if (process.env.FAL_KEY) {
    imageUrl = await generateArticleImageWithRetry({
      title: transformedTitle.transformedText,
      summary: transformedSummary.transformedText,
      category: 'news',
    });
  }

  // Re-check rate limit immediately before insert to prevent TOCTOU race condition
  // Another process may have created articles between the initial check and now
  const { allowed: stillAllowed } = await articleRateLimiter.canGenerateArticle();
  if (!stillAllowed) {
    throw new Error('Rate limit exceeded during article generation');
  }

  const postId = await generateSnowflakeId();
  const now = new Date();

  await db.insert(posts).values({
    id: postId,
    type: 'article',
    content: transformedSummary.transformedText,
    fullContent: transformedBody.transformedText,
    articleTitle: transformedTitle.transformedText,
    category: 'news',
    imageUrl: imageUrl || undefined,
    authorId,
    gameId: gameState.id,
    dayNumber: gameState.currentDay ?? 1,
    timestamp: now,
    createdAt: now,
  });

  return postId;
}

/**
 * GET /api/cron/article-tick
 * Alias for POST endpoint to support GET requests from cron services.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * POST /api/cron/article-tick
 *
 * Generates articles based on active events and questions.
 * Rate limited to prevent feed flooding.
 */
export async function POST(_req: NextRequest) {
  // Verify cron authorization
  if (!verifyCronAuth(_req, { jobName: 'ArticleTick' })) {
    logger.warn(
      'Unauthorized article-tick request attempt',
      undefined,
      'ArticleTick'
    );
    return NextResponse.json(
      { error: 'Unauthorized cron request' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const processId = `article-tick-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  logger.info('Article tick started', { processId }, 'ArticleTick');

  // Relay to staging if configured
  const relayResult = await relayCronToStaging(_req, 'article-tick');
  if (relayResult.forwarded) {
    logger.info(
      'Cron execution relayed to staging - skipping local execution',
      { status: relayResult.status, error: relayResult.error },
      'ArticleTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Relayed to staging environment',
      relayStatus: relayResult.status,
      articlesCreated: 0,
    });
  }

  // Acquire global lock to prevent overlapping cron invocations
  const globalLockAcquired = await DistributedLockService.acquireLock({
    lockId: 'article-tick-global',
    durationMs: 300 * 1000, // 5 minutes
    operation: 'article-tick-global',
    processId,
  });
  if (!globalLockAcquired) {
    logger.info(
      'Article tick skipped - previous tick still running',
      { processId },
      'ArticleTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Previous tick still running',
      articlesCreated: 0,
    });
  }

  try {
    // Check GAME_START environment variable
    const gameStartEnv = process.env.GAME_START?.toLowerCase();
    if (gameStartEnv === 'false' || gameStartEnv === '0') {
      logger.info(
        'Game disabled via GAME_START env var - skipping article tick',
        { GAME_START: process.env.GAME_START },
        'ArticleTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game disabled via GAME_START environment variable',
        articlesCreated: 0,
      });
    }

    // Check Game status from database
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
      { namespace: 'article-tick', ttl: 60 }
    );

    if (!gameState) {
      logger.info(
        'Article tick skipped (No continuous game found)',
        {},
        'ArticleTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No continuous game found',
        duration: Date.now() - startTime,
        articlesCreated: 0,
      });
    }

    if (!gameState.isRunning) {
      logger.info(
        'Article tick paused (Game is not running)',
        { gameId: gameState.id },
        'ArticleTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game is paused',
        gameId: gameState.id,
        duration: Date.now() - startTime,
        articlesCreated: 0,
      });
    }

    // Check rate limit first
    const { allowed, currentCount, maxAllowed, remaining } =
      await articleRateLimiter.canGenerateArticle();

    if (!allowed) {
      logger.info(
        'Article tick skipped - rate limit reached',
        { currentCount, maxAllowed },
        'ArticleTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Rate limit reached',
        currentCount,
        maxAllowed,
        duration: Date.now() - startTime,
        articlesCreated: 0,
      });
    }

    logger.info(
      'Article rate limit check passed',
      { currentCount, maxAllowed, remaining },
      'ArticleTick'
    );

    // Get news organizations from static registry
    const newsOrgs = StaticDataRegistry.getOrganizationsByType('media');
    const actorsList = StaticDataRegistry.getTopActors(50);

    if (newsOrgs.length === 0) {
      logger.warn('No news organizations found', {}, 'ArticleTick');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No news organizations available',
        articlesCreated: 0,
      });
    }

    // Get active events for article generation
    const activeEventsData = await getActiveEventsForPosting();
    const worldFactsContext = await worldFactsService.generatePromptContext();

    // Create LLM client and article generator
    const llmClient = BabylonLLMClient.forGameTick();
    const articleGen = new ArticleGenerator(llmClient);

    let articlesCreated = 0;
    let errorCount = 0;
    const articlesToGenerate = Math.min(MAX_ARTICLES_PER_TICK, remaining);

    // Generate articles based on active events
    if (activeEventsData.activeEvents.length > 0 && articlesToGenerate > 0) {
      // Pick a random event to cover
      const eventIndex = Math.floor(
        secureRandom() * activeEventsData.activeEvents.length
      );
      const event = activeEventsData.activeEvents[eventIndex];

      if (event) {
        // Check if we've already covered this event using explicit tracking
        const eventId = event.questionId;
        const alreadyCovered = hasEventBeenCovered(eventId);

        if (!alreadyCovered) {
          // Pick a random news org to write the article
          const orgIndex = Math.floor(secureRandom() * newsOrgs.length);
          const org = newsOrgs[orgIndex]!;

          try {
            const article = await generateEventArticle(
              event,
              org,
              actorsList,
              worldFactsContext,
              articleGen,
              gameState,
              llmClient
            );

            if (article) {
              articlesCreated++;
              // Mark this event as covered for future duplicate detection
              markEventAsCovered(eventId, org.id, article.id);
              logger.info(
                `Article created by ${org.name}`,
                { eventId: event.questionId, articleId: article.id },
                'ArticleTick'
              );
            }
          } catch (error) {
            errorCount++;
            logger.error(
              'Failed to generate event article',
              {
                eventId: event.questionId,
                orgId: org.id,
                error: error instanceof Error ? error.message : String(error),
              },
              'ArticleTick'
            );
          }
        } else {
          logger.debug(
            'Event already covered - skipping',
            { eventId: event.questionId },
            'ArticleTick'
          );
        }
      }
    }

    // If no event articles, generate a baseline article
    if (articlesCreated === 0 && articlesToGenerate > 0) {
      const orgIndex = Math.floor(secureRandom() * newsOrgs.length);
      const org = newsOrgs[orgIndex]!;

      try {
        const article = await generateBaselineArticle(
          org,
          actorsList,
          worldFactsContext,
          gameState,
          llmClient
        );

        if (article) {
          articlesCreated++;
          logger.info(
            `Baseline article created by ${org.name}`,
            { articleId: article.id },
            'ArticleTick'
          );
        }
      } catch (error) {
        errorCount++;
        logger.error(
          'Failed to generate baseline article',
          {
            orgId: org.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'ArticleTick'
        );
      }
    }

    const duration = Date.now() - startTime;
    const success = errorCount === 0;

    logger.info(
      `Article tick completed in ${duration}ms`,
      { articlesCreated, errorCount, success },
      'ArticleTick'
    );

    recordCronExecution('article-tick', new Date(startTime), {
      success,
      articlesCreated,
      errorCount,
    });

    return NextResponse.json({
      success,
      articlesCreated,
      errorCount,
      duration,
      rateLimit: { currentCount, maxAllowed, remaining },
    });
  } finally {
    await DistributedLockService.releaseLock('article-tick-global', processId);
  }
}

/**
 * Generate an article about a specific event
 */
async function generateEventArticle(
  event: { questionId: string },
  org: { id: string; name: string | null; description: string | null },
  _actorsList: Array<{ id: string; name: string; description?: string }>,
  worldFactsContext: string,
  _articleGen: ArticleGenerator,
  gameState: GameState,
  llmClient: BabylonLLMClient
): Promise<{ id: string } | null> {
  const prompt = `You are ${org.name}, a ${org.description || 'news organization'}.

${worldFactsContext}

CURRENT TOPIC: Question ID ${event.questionId} has active market activity

Write a compelling news article about this event.

CRITICAL RULES:
- Use ONLY parody names (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.) - NEVER real names
- Match the publication's voice and editorial stance
- Be informative and engaging

Your article should include:
- A compelling headline (max 100 chars)
- A 2-3 sentence summary (max 400 chars)
- A full article body of 3-4 paragraphs

Return your response as XML:
<response>
  <title>headline here</title>
  <summary>summary here</summary>
  <article>full article body here</article>
</response>`;

  const rawResponse = await llmClient.generateJSON<
    | { title: string; summary: string; article: string }
    | { response: { title: string; summary: string; article: string } }
  >(
    prompt,
    {
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        article: { type: 'string' },
      },
      required: ['title', 'summary', 'article'],
    },
    {
      temperature: 0.7,
      maxTokens: 2000,
      format: 'xml',
      promptType: 'generate_event_article',
    }
  );

  const articleData =
    'response' in rawResponse && rawResponse.response
      ? rawResponse.response
      : (rawResponse as { title: string; summary: string; article: string });

  if (!articleData.title || !articleData.summary || !articleData.article) {
    return null;
  }

  // Use shared helper for transformation, image generation, and DB insert
  const postId = await persistArticle(articleData, org.id, gameState);
  return { id: postId };
}

/**
 * Generate a baseline article (not tied to a specific event)
 */
async function generateBaselineArticle(
  org: { id: string; name: string | null; description: string | null },
  actorsList: Array<{ id: string; name: string; description?: string }>,
  worldFactsContext: string,
  gameState: GameState,
  llmClient: BabylonLLMClient
): Promise<{ id: string } | null> {
  // Pick a random actor to focus on
  const actorIndex = Math.floor(
    secureRandom() * Math.min(10, actorsList.length)
  );
  const actor = actorsList[actorIndex];

  const topic = actor
    ? `${actor.name} and recent developments`
    : 'AI industry trends and market movements';

  const prompt = `You are ${org.name}, a ${org.description || 'news organization'}.

${worldFactsContext}

Write a news article about: ${topic}

CRITICAL RULES:
- Use ONLY parody names (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.) - NEVER real names
- Match the publication's voice and editorial stance
- Be informative and engaging
- Focus on the AI/crypto/tech space

Your article should include:
- A compelling headline (max 100 chars)
- A 2-3 sentence summary (max 400 chars)
- A full article body of 3-4 paragraphs

Return your response as XML:
<response>
  <title>headline here</title>
  <summary>summary here</summary>
  <article>full article body here</article>
</response>`;

  const rawResponse = await llmClient.generateJSON<
    | { title: string; summary: string; article: string }
    | { response: { title: string; summary: string; article: string } }
  >(
    prompt,
    {
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        article: { type: 'string' },
      },
      required: ['title', 'summary', 'article'],
    },
    {
      temperature: 0.7,
      maxTokens: 2000,
      format: 'xml',
      promptType: 'generate_baseline_article',
    }
  );

  const articleData =
    'response' in rawResponse && rawResponse.response
      ? rawResponse.response
      : (rawResponse as { title: string; summary: string; article: string });

  if (!articleData.title || !articleData.summary || !articleData.article) {
    return null;
  }

  // Use shared helper for transformation, image generation, and DB insert
  const postId = await persistArticle(articleData, org.id, gameState);
  return { id: postId };
}

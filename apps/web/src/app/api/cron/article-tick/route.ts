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
import { db, eq, games, posts } from '@babylon/db';
import {
  type Article,
  ArticleGenerator,
  articleRateLimiter,
  BabylonLLMClient,
  generateArticleImageWithRetry,
  getActiveEventsForPosting,
  hasEventBeenCovered,
  markEventAsCovered,
  type StaticActor,
  StaticDataRegistry,
  type StaticOrganization,
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

/**
 * Map StaticActor[] to Actor[] interface expected by ArticleGenerator.
 * Extracted to module-scope helper to avoid duplication between
 * generateEventArticle and generateBaselineArticle.
 */
function mapStaticActorsToActors(actorsList: StaticActor[]) {
  return actorsList.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    domain: a.domain,
    personality: a.personality,
    tier: a.tier ?? undefined,
    affiliations: a.affiliations,
    postStyle: a.postStyle,
    postExample: a.postExample, // Keep as string[] to match Actor interface
    role: a.role,
    initialLuck: a.initialLuck as 'low' | 'medium' | 'high',
    initialMood: a.initialMood,
  }));
}

/**
 * Map StaticOrganization to Organization interface expected by ArticleGenerator.
 */
function mapStaticOrgToOrganization(org: StaticOrganization) {
  return {
    id: org.id,
    name: org.name,
    description: org.description,
    type: org.type,
    canBeInvolved: org.canBeInvolved,
  };
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
 * Result type for persistArticle to handle rate-limiting gracefully
 */
type PersistArticleResult =
  | { success: true; postId: string }
  | { success: false; rateLimited: true };

/**
 * Persist an article to the database.
 * ArticleGenerator already handles character mapping, so we just persist.
 *
 * @param article - The Article from ArticleGenerator (already has parody names)
 * @param gameState - Current game state for context
 * @returns Success with post ID, or rate-limited result (not an error)
 */
async function persistArticle(
  article: Article,
  gameState: GameState
): Promise<PersistArticleResult> {
  // Validate required fields before doing any work
  if (!article.title?.trim()) {
    throw new Error('Missing article title');
  }
  if (!article.summary?.trim()) {
    throw new Error('Missing article summary');
  }
  if (!article.content?.trim()) {
    throw new Error('Missing article body');
  }
  if (!article.authorOrgId) {
    throw new Error('Missing authorOrgId');
  }
  if (!gameState?.id) {
    throw new Error('Missing gameState.id');
  }

  // Re-check rate limit immediately before insert to prevent TOCTOU race condition
  // Another process may have created articles between the initial check and now
  const { allowed: stillAllowed } =
    await articleRateLimiter.canGenerateArticle();
  if (!stillAllowed) {
    // Return rate-limited result instead of throwing - this is not an error condition
    logger.info(
      'Article skipped due to rate limit (TOCTOU re-check)',
      { authorId: article.authorOrgId },
      'ArticleTick'
    );
    return { success: false, rateLimited: true };
  }

  const postId = article.id; // Use the ID from ArticleGenerator
  const now = new Date();

  // Insert article first without image - image generation is fire-and-forget
  // ArticleGenerator already applied character mapping to title/summary/content
  await db.insert(posts).values({
    id: postId,
    type: 'article',
    content: article.summary,
    fullContent: article.content,
    articleTitle: article.title,
    byline: article.byline || undefined,
    biasScore: article.biasScore || undefined,
    sentiment: article.sentiment || undefined,
    slant: article.slant || undefined,
    category: article.category || 'news',
    imageUrl: undefined, // Will be updated asynchronously if FAL_KEY is set
    authorId: article.authorOrgId,
    gameId: gameState.id,
    dayNumber: gameState.currentDay ?? 1,
    timestamp: article.publishedAt || now,
    createdAt: now,
  });

  // Fire-and-forget image generation - updates post asynchronously after insert
  // Use void to explicitly mark as intentionally unhandled (silences floating-promise lint)
  if (process.env.FAL_KEY) {
    void generateArticleImageWithRetry({
      title: article.title,
      summary: article.summary,
      category: article.category || 'news',
    })
      .then(async (imageUrl) => {
        if (imageUrl) {
          // Update the post with the generated image URL
          try {
            await db
              .update(posts)
              .set({ imageUrl })
              .where(eq(posts.id, postId));
          } catch (err) {
            logger.warn(
              'Failed to update article with image URL',
              {
                postId,
                authorId: article.authorOrgId,
                error: err instanceof Error ? err.message : String(err),
              },
              'ArticleTick'
            );
          }
        }
      })
      .catch((err) => {
        logger.debug(
          'Image generation failed (non-blocking)',
          {
            postId,
            authorId: article.authorOrgId,
            error: err instanceof Error ? err.message : String(err),
          },
          'ArticleTick'
        );
      });
  }

  return { success: true, postId };
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

    // Get world facts context with graceful fallback if service fails
    let worldFactsContext = '';
    try {
      worldFactsContext = await worldFactsService.generatePromptContext();
    } catch (error) {
      logger.warn(
        'Failed to fetch world facts context - proceeding without',
        { error: error instanceof Error ? error.message : String(error) },
        'ArticleTick'
      );
    }

    // Create LLM client for article generation
    const llmClient = BabylonLLMClient.forGameTick();

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
      skipped: false,
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
 * Generate an article about a specific event using ArticleGenerator
 */
async function generateEventArticle(
  event: { questionId: string; text?: string },
  org: StaticOrganization,
  actorsList: StaticActor[],
  worldFactsContext: string,
  gameState: GameState,
  llmClient: BabylonLLMClient
): Promise<{ id: string } | null> {
  // P0: Pre-check rate limit BEFORE expensive LLM calls to avoid wasting resources
  const { allowed } = await articleRateLimiter.canGenerateArticle();
  if (!allowed) {
    logger.info(
      'Event article skipped - rate limit reached before LLM call',
      { eventId: event.questionId, orgId: org.id },
      'ArticleTick'
    );
    return null;
  }

  // Create ArticleGenerator instance
  const articleGen = new ArticleGenerator(llmClient);

  // Use helper functions to map static data to expected interfaces
  const organization = mapStaticOrgToOrganization(org);
  const actors = mapStaticActorsToActors(actorsList);

  // Create question object for ArticleGenerator
  const question = {
    id: event.questionId,
    text: event.text || `Market activity for ${event.questionId}`,
    scenario: 1,
    outcome: false,
    rank: 1,
    createdDate: new Date().toISOString().split('T')[0]!,
    resolutionDate: '',
    status: 'active' as const,
  };

  try {
    // Generate article using ArticleGenerator (handles character mapping internally)
    // Pass worldFactsContext for current game state awareness
    const article = await articleGen.generateArticleForQuestion(
      question,
      organization,
      'breaking', // Event articles are breaking news
      actors,
      [], // Recent events (empty - world context provides this info)
      worldFactsContext // World facts context for current game state
    );

    // Persist the article (includes TOCTOU re-check for race conditions)
    const result = await persistArticle(article, gameState);

    // Handle rate-limited result (not an error, just return null)
    if (!result.success) {
      return null;
    }

    return { id: result.postId };
  } catch (error) {
    logger.error(
      'ArticleGenerator failed for event article',
      {
        eventId: event.questionId,
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'ArticleTick'
    );
    return null;
  }
}

/**
 * Generate a baseline article (not tied to a specific event) using ArticleGenerator
 */
async function generateBaselineArticle(
  org: StaticOrganization,
  actorsList: StaticActor[],
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

  // P0: Pre-check rate limit BEFORE expensive LLM calls to avoid wasting resources
  const { allowed } = await articleRateLimiter.canGenerateArticle();
  if (!allowed) {
    logger.info(
      'Baseline article skipped - rate limit reached before LLM call',
      { topic, orgId: org.id },
      'ArticleTick'
    );
    return null;
  }

  // Create ArticleGenerator instance
  const articleGen = new ArticleGenerator(llmClient);

  // Use helper functions to map static data to expected interfaces
  const organization = mapStaticOrgToOrganization(org);
  const actors = mapStaticActorsToActors(actorsList);

  // Create synthetic question for baseline article (topic-based)
  const question = {
    id: `baseline-${Date.now()}`,
    text: topic,
    scenario: 1,
    outcome: false,
    rank: 1,
    createdDate: new Date().toISOString().split('T')[0]!,
    resolutionDate: '',
    status: 'active' as const,
  };

  try {
    // Generate article using ArticleGenerator (handles character mapping internally)
    // Pass worldFactsContext for current game state awareness
    const article = await articleGen.generateArticleForQuestion(
      question,
      organization,
      'commentary', // Baseline articles are commentary/analysis
      actors,
      [], // Recent events (empty - world context provides this info)
      worldFactsContext // World facts context for current game state
    );

    // Persist the article (includes TOCTOU re-check for race conditions)
    const result = await persistArticle(article, gameState);

    // Handle rate-limited result (not an error, just return null)
    if (!result.success) {
      return null;
    }

    return { id: result.postId };
  } catch (error) {
    logger.error(
      'ArticleGenerator failed for baseline article',
      {
        topic,
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'ArticleTick'
    );
    return null;
  }
}

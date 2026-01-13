/**
 * Markets Tick Cron Job API
 *
 * @route POST /api/cron/markets-tick - Execute market lifecycle tick
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Owns the complete lifecycle of all 10 prediction markets:
 * - Creation: Generate new questions with timeframe-appropriate content
 * - Monitoring: Track active markets by timeframe
 * - Resolution: Resolve mature markets and aggregate signals
 * - Settlement: Execute position payouts atomically
 * - Replacement: Create new market when one resolves
 *
 * Market Structure (10 active markets at all times):
 * - 1x 3-day market
 * - 1x 2-day market
 * - 1x 1-day market
 * - 1x 12-hour market
 * - 1x 6-hour market
 * - 1x 1-hour market
 * - 2x 30-minute markets
 * - 2x 15-minute markets
 *
 * Architecture:
 * - game-tick: World simulation (events, arcs, world state)
 * - markets-tick: Market lifecycle (this file)
 * - npc-tick: NPC behavior (trading + social)
 * - organization-tick: Org posts
 * - article-tick: Article generation
 * - agent-tick: Player agents
 */

import {
  DistributedLockService,
  getCacheOrFetch,
  recordCronExecution,
  relayCronToStaging,
  verifyCronAuth,
} from '@babylon/api';
import {
  PredictionDbAdapter as CorePredictionDbAdapter,
  PredictionMarketService as CorePredictionMarketService,
} from '@babylon/core/markets/prediction';
import {
  type ArcStateType,
  and,
  db,
  desc,
  eq,
  games,
  generateSnowflakeId,
  gte,
  lte,
  type MarketCategory,
  max,
  posts,
  questions,
  timeframedMarkets,
  worldEvents,
} from '@babylon/db';
import {
  BabylonLLMClient,
  publishOracleCommitments,
  publishOracleReveals,
  QuestionManager,
  resolveQuestionPayouts,
  SignalExtractionService,
  StaticDataRegistry,
  timeframeArcPlanner,
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

// ============================================================================
// Market Creation Configuration
// ============================================================================

/**
 * Default scenario ID for new questions.
 * Consistent with QuestionManager defaults.
 */
const DEFAULT_SCENARIO_ID = 1;

/**
 * Default initial liquidity for new markets (in base units).
 * This determines the initial AMM pool depth.
 */
const DEFAULT_INITIAL_LIQUIDITY = 20000;

/**
 * Mock wallet for market creation operations.
 * The markets-tick cron creates markets without real wallet operations
 * since it's a system-level process, not user-initiated.
 *
 * These no-op stubs satisfy the CorePredictionMarketService interface
 * while preventing any actual balance changes.
 */
const MOCK_WALLET = {
  debit: async () => {},
  credit: async () => {},
  recordPnL: async () => {},
  getBalance: async () => ({ balance: 0 }),
} as const;

/**
 * Default fee configuration for system-created markets.
 * Zero fees since these are automated market creation operations.
 */
const SYSTEM_MARKET_FEES = {
  tradingFeeRate: 0,
  platformShare: 0,
  referrerShare: 0,
  minFeeAmount: 0,
} as const;

/**
 * Market structure configuration - maintains exactly 10 active markets
 * with staggered timeframes for constant activity.
 */
const MARKET_STRUCTURE: Record<
  string,
  { count: number; durationMs: number; label: string }
> = {
  '3d': {
    count: 1,
    durationMs: 3 * 24 * 60 * 60 * 1000,
    label: '3-day',
  },
  '2d': {
    count: 1,
    durationMs: 2 * 24 * 60 * 60 * 1000,
    label: '2-day',
  },
  '1d': {
    count: 1,
    durationMs: 24 * 60 * 60 * 1000,
    label: '1-day',
  },
  '12h': {
    count: 1,
    durationMs: 12 * 60 * 60 * 1000,
    label: '12-hour',
  },
  '6h': {
    count: 1,
    durationMs: 6 * 60 * 60 * 1000,
    label: '6-hour',
  },
  '1h': {
    count: 1,
    durationMs: 60 * 60 * 1000,
    label: '1-hour',
  },
  '30m': {
    count: 2,
    durationMs: 30 * 60 * 1000,
    label: '30-minute',
  },
  '15m': {
    count: 2,
    durationMs: 15 * 60 * 1000,
    label: '15-minute',
  },
};

// Total: 10 markets (1+1+1+1+1+1+2+2)

// TimeframeCategory is now handled by QuestionManager.generateTimeframeQuestion()

/**
 * GET /api/cron/markets-tick
 * Alias for POST endpoint to support GET requests from cron services.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}

/**
 * POST /api/cron/markets-tick
 *
 * Executes the full market lifecycle:
 * 1. Ensure 10 markets are active (create missing ones)
 * 2. Resolve mature markets
 * 3. Settle positions
 * 4. Create replacement markets
 */
export async function POST(_req: NextRequest) {
  // Verify cron authorization
  if (!verifyCronAuth(_req, { jobName: 'MarketsTick' })) {
    logger.warn(
      'Unauthorized markets-tick request attempt',
      undefined,
      'MarketsTick'
    );
    return NextResponse.json(
      { error: 'Unauthorized cron request' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const processId = `markets-tick-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  logger.info('Markets tick started', { processId }, 'MarketsTick');

  // Relay to staging if configured
  const relayResult = await relayCronToStaging(_req, 'markets-tick');
  if (relayResult.forwarded) {
    logger.info(
      'Cron execution relayed to staging - skipping local execution',
      { status: relayResult.status, error: relayResult.error },
      'MarketsTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Relayed to staging environment',
      relayStatus: relayResult.status,
    });
  }

  // Acquire global lock to prevent overlapping cron invocations
  const globalLockAcquired = await DistributedLockService.acquireLock({
    lockId: 'markets-tick-global',
    durationMs: 300 * 1000, // 5 minutes
    operation: 'markets-tick-global',
    processId,
  });

  if (!globalLockAcquired) {
    logger.info(
      'Markets tick skipped - previous tick still running',
      { processId },
      'MarketsTick'
    );
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Previous tick still running',
    });
  }

  try {
    // Check GAME_START environment variable
    const gameStartEnv = process.env.GAME_START?.toLowerCase();
    if (gameStartEnv === 'false' || gameStartEnv === '0') {
      logger.info(
        'Game disabled via GAME_START env var - skipping markets tick',
        { GAME_START: process.env.GAME_START },
        'MarketsTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game disabled',
      });
    }

    // Get or fetch game state
    const gameState = await getCacheOrFetch<GameState>(
      'markets-tick:game-state',
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

        if (!game) {
          // Log warning so operators are alerted to missing game configuration
          // This could indicate a DB issue or missing game setup
          logger.warn(
            'No continuous game found in database - using fallback state',
            {
              attemptedQuery: 'games.isContinuous = true',
              fallbackId: 'continuous',
              action: 'Markets tick will be skipped (isRunning: false)',
            },
            'MarketsTick'
          );
          return {
            id: 'continuous',
            isRunning: false,
            isContinuous: true,
            currentDay: 1,
          };
        }

        return {
          id: game.id,
          isRunning: game.isRunning ?? false,
          isContinuous: game.isContinuous ?? true,
          currentDay: game.currentDay,
        };
      },
      { ttl: 30 }
    );

    if (!gameState.isRunning) {
      logger.info(
        'Game not running - skipping markets tick',
        { gameId: gameState.id },
        'MarketsTick'
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Game not running',
      });
    }

    // Initialize LLM client for question generation
    const llmClient = BabylonLLMClient.forGameTick();

    // Results tracking with detailed performance metrics
    const results = {
      marketsResolved: 0,
      marketsCreated: 0,
      positionsSettled: 0,
      oracleReveals: 0,
      marketsByTimeframe: {} as Record<string, number>,
    };

    // Performance metrics for monitoring bottlenecks
    const metrics = {
      getActiveMarketsMs: 0,
      resolutionMs: 0,
      creationMs: 0,
      totalDbQueries: 0,
      totalLlmCalls: 0,
    };

    const now = new Date();
    const deadline = startTime + 240000; // 4 minute budget (leave 1 min buffer)

    // Step 1: Get current market distribution
    const activeMarketsStart = Date.now();
    const activeMarkets = await getActiveMarketsByTimeframe();
    metrics.getActiveMarketsMs = Date.now() - activeMarketsStart;
    results.marketsByTimeframe = Object.fromEntries(
      Object.entries(activeMarkets).map(([tf, markets]) => [tf, markets.length])
    );

    logger.info(
      'Current market distribution',
      {
        ...results.marketsByTimeframe,
        queryTimeMs: metrics.getActiveMarketsMs,
      },
      'MarketsTick'
    );

    // Step 2: Resolve mature markets
    const resolutionStart = Date.now();
    const matureMarkets = await getMarketsReadyForResolution(now);

    logger.info(
      `Found ${matureMarkets.length} markets ready for resolution`,
      {
        matureMarkets: matureMarkets.map((m) => ({
          id: m.id,
          timeframe: m.timeframe,
        })),
      },
      'MarketsTick'
    );

    for (const market of matureMarkets) {
      if (Date.now() > deadline) {
        logger.warn('Deadline reached, stopping resolution', {}, 'MarketsTick');
        break;
      }

      try {
        // Resolve the market (includes proof gen, payouts, oracle reveal)
        const resolutionResult = await resolveMarket(market, llmClient, gameState);
        if (resolutionResult.resolved) {
          results.marketsResolved++;
        }
        if (resolutionResult.oracleRevealed) {
          results.oracleReveals++;
        }

        // Create replacement market of same timeframe
        const created = await createMarketForTimeframe(
          market.timeframe,
          MARKET_STRUCTURE[market.timeframe]?.durationMs ||
            getDefaultDuration(market.timeframe),
          llmClient,
          gameState
        );

        if (created) {
          results.marketsCreated++;
        }
      } catch (error) {
        logger.error(
          'Failed to resolve/replace market',
          {
            marketId: market.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'MarketsTick'
        );
      }
    }
    metrics.resolutionMs = Date.now() - resolutionStart;

    // Step 3: Ensure market structure (fill any gaps)
    const creationStart = Date.now();
    for (const [timeframe, config] of Object.entries(MARKET_STRUCTURE)) {
      if (Date.now() > deadline) break;

      const currentCount = activeMarkets[timeframe]?.length || 0;
      const needed = config.count - currentCount;

      if (needed > 0) {
        logger.info(
          `Creating ${needed} missing ${timeframe} market(s)`,
          { currentCount, target: config.count },
          'MarketsTick'
        );

        for (let i = 0; i < needed; i++) {
          if (Date.now() > deadline) break;

          try {
            const created = await createMarketForTimeframe(
              timeframe,
              config.durationMs,
              llmClient,
              gameState
            );

            if (created) {
              results.marketsCreated++;
            }
          } catch (error) {
            logger.error(
              'Failed to create market',
              {
                timeframe,
                error: error instanceof Error ? error.message : String(error),
              },
              'MarketsTick'
            );
          }
        }
      }
    }
    metrics.creationMs = Date.now() - creationStart;

    const durationMs = Date.now() - startTime;

    // Record execution for monitoring with detailed metrics
    recordCronExecution('markets-tick', new Date(startTime), {
      success: true,
      durationMs,
      ...results,
      metrics,
    });

    // Log detailed performance breakdown for monitoring
    logger.info(
      'Markets tick completed',
      {
        durationMs,
        ...results,
        performanceBreakdown: {
          activeMarketsQueryMs: metrics.getActiveMarketsMs,
          resolutionPhaseMs: metrics.resolutionMs,
          creationPhaseMs: metrics.creationMs,
          overheadMs:
            durationMs -
            metrics.getActiveMarketsMs -
            metrics.resolutionMs -
            metrics.creationMs,
        },
      },
      'MarketsTick'
    );

    // Warn if execution is taking too long (over 2 minutes)
    if (durationMs > 120000) {
      logger.warn(
        'Markets tick execution time exceeds 2 minutes',
        {
          durationMs,
          resolutionMs: metrics.resolutionMs,
          creationMs: metrics.creationMs,
          marketsResolved: results.marketsResolved,
          marketsCreated: results.marketsCreated,
        },
        'MarketsTick'
      );
    }

    return NextResponse.json({
      success: true,
      durationMs,
      ...results,
      metrics,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Markets tick failed', { error: errorMessage }, 'MarketsTick');

    recordCronExecution('markets-tick', new Date(startTime), {
      success: false,
      error: errorMessage,
    });

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  } finally {
    // Always release the global lock
    await DistributedLockService.releaseLock('markets-tick-global', processId);
  }
}

/**
 * Get active markets grouped by timeframe
 */
async function getActiveMarketsByTimeframe(): Promise<
  Record<
    string,
    Array<{ id: string; questionId: string; resolutionDate: Date }>
  >
> {
  const now = new Date();

  // Get all active questions (not resolved, not past resolution date)
  const activeQuestions = await db
    .select({
      id: questions.id,
      questionNumber: questions.questionNumber,
      resolutionDate: questions.resolutionDate,
    })
    .from(questions)
    .where(
      and(eq(questions.status, 'active'), gte(questions.resolutionDate, now))
    );

  // Group by timeframe (inferred from resolution date)
  const grouped: Record<
    string,
    Array<{ id: string; questionId: string; resolutionDate: Date }>
  > = {};

  for (const q of activeQuestions) {
    const tf = inferTimeframe(q.resolutionDate);
    if (!grouped[tf]) {
      grouped[tf] = [];
    }
    grouped[tf].push({
      id: q.id,
      questionId: q.id,
      resolutionDate: q.resolutionDate,
    });
  }

  return grouped;
}

/**
 * Infer timeframe from resolution date
 */
function inferTimeframe(resolutionDate: Date | null): string {
  if (!resolutionDate) return '1d';

  const now = new Date();
  const diffMs = resolutionDate.getTime() - now.getTime();
  const diffHours = diffMs / (60 * 60 * 1000);

  if (diffHours <= 0.25) return '15m';
  if (diffHours <= 0.5) return '30m';
  if (diffHours <= 1) return '1h';
  if (diffHours <= 6) return '6h';
  if (diffHours <= 12) return '12h';
  if (diffHours <= 24) return '1d';
  if (diffHours <= 48) return '2d';
  return '3d';
}

/**
 * Get markets ready for resolution
 *
 * NOTE: We join with timeframedMarkets to get the canonical stored timeframe,
 * NOT inferTimeframe(resolutionDate). For mature markets, inferTimeframe would
 * return '15m' since (resolutionDate - now) is negative, which is incorrect.
 */
async function getMarketsReadyForResolution(now: Date): Promise<
  Array<{
    id: string;
    questionNumber: number;
    timeframe: string;
    resolutionDate: Date;
  }>
> {
  // Join questions with timeframedMarkets to get the stored timeframe
  const matureQuestions = await db
    .select({
      id: questions.id,
      questionNumber: questions.questionNumber,
      resolutionDate: questions.resolutionDate,
      timeframe: timeframedMarkets.timeframe,
    })
    .from(questions)
    .leftJoin(timeframedMarkets, eq(timeframedMarkets.questionId, questions.id))
    .where(
      and(eq(questions.status, 'active'), lte(questions.resolutionDate, now))
    );

  return matureQuestions.map((q) => ({
    id: q.id,
    questionNumber: q.questionNumber,
    // Use stored timeframe from timeframedMarkets; fallback to '1d' if not found
    timeframe: q.timeframe ?? '1d',
    resolutionDate: q.resolutionDate,
  }));
}

/**
 * Resolve a market with complete lifecycle:
 * 1. Signal extraction (validation/logging)
 * 2. Proof generation (LLM-based resolution explanation)
 * 3. Payout execution (position settlements)
 * 4. Oracle reveal (blockchain verification)
 * 5. State updates (timeframedMarkets, questions)
 *
 * The outcome is pre-determined at creation for blockchain verifiability.
 * Proof generation explains WHY the outcome occurred for transparency.
 */
async function resolveMarket(
  market: {
    id: string;
    questionNumber: number;
    timeframe: string;
  },
  llmClient: BabylonLLMClient,
  gameState: GameState
): Promise<{ resolved: boolean; oracleRevealed: boolean }> {
  logger.info(
    `Resolving ${market.timeframe} market`,
    { questionNumber: market.questionNumber },
    'MarketsTick'
  );

  // Fetch full question data for proof generation
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.questionNumber, market.questionNumber))
    .limit(1);

  if (!question) {
    logger.error(
      `Question not found for market ${market.questionNumber}`,
      {},
      'MarketsTick'
    );
    return { resolved: false, oracleRevealed: false };
  }

  // Check if already resolved (idempotency)
  if (question.status === 'resolved') {
    logger.info(
      `Market Q${market.questionNumber} already resolved`,
      {},
      'MarketsTick'
    );
    return { resolved: true, oracleRevealed: false };
  }

  // ==========================================================================
  // STEP 1: Signal Extraction (non-blocking validation)
  // ==========================================================================
  try {
    const signalAnalysis = await SignalExtractionService.extractMarketSignal(
      market.questionNumber
    );

    logger.info(
      `Signal analysis for Q${market.questionNumber}`,
      {
        questionNumber: market.questionNumber,
        timeframe: market.timeframe,
        suggestedOutcome: signalAnalysis.suggestedOutcome,
        confidence: signalAnalysis.confidence,
        yesSignal: signalAnalysis.yesSignal,
        noSignal: signalAnalysis.noSignal,
        signalStrength: signalAnalysis.signalStrength,
        totalPosts: signalAnalysis.totalPosts,
      },
      'MarketsTick'
    );

    // Log narrative coherence check
    if (
      signalAnalysis.suggestedOutcome !== 'UNCERTAIN' &&
      signalAnalysis.confidence > 0.7
    ) {
      const expectedOutcome = question.outcome ? 'YES' : 'NO';
      const coherent = signalAnalysis.suggestedOutcome === expectedOutcome;
      logger.info(
        `Narrative coherence: ${coherent ? 'ALIGNED' : 'DIVERGENT'}`,
        {
          expected: expectedOutcome,
          suggested: signalAnalysis.suggestedOutcome,
          confidence: signalAnalysis.confidence,
        },
        'MarketsTick'
      );
    }
  } catch (error) {
    logger.warn(
      `Signal extraction failed for Q${market.questionNumber}`,
      { error: error instanceof Error ? error.message : String(error) },
      'MarketsTick'
    );
  }

  // ==========================================================================
  // STEP 2: Proof Generation (if not already generated)
  // ==========================================================================
  const hasStoredProof =
    Boolean(question.resolutionProofUrl) &&
    Boolean(question.resolutionDescription);

  if (!hasStoredProof) {
    try {
      // Load actors and organizations for proof context
      const allActors = StaticDataRegistry.getAllActors()
        .filter((a) => a.tier !== null)
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          domain: a.domain,
          personality: a.personality,
          affiliations: a.affiliations,
          postStyle: a.postStyle,
          postExample: a.postExample,
          tier: a.tier!,
          role: a.role ?? 'unknown',
          initialLuck: (a.initialLuck as 'low' | 'medium' | 'high') ?? 'medium',
          initialMood: a.initialMood ?? 0,
        }));

      const organizations = StaticDataRegistry.getAllOrganizations().map(
        (o) => ({
          id: o.id,
          name: o.name,
          ticker: o.ticker,
          description: o.description,
          type: o.type,
          canBeInvolved: o.canBeInvolved,
          initialPrice: o.initialPrice ?? undefined,
        })
      );

      // Get recent events for proof context
      const recentDbEvents = await db
        .select()
        .from(worldEvents)
        .where(
          gte(
            worldEvents.timestamp,
            new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          )
        )
        .orderBy(desc(worldEvents.timestamp))
        .limit(50);

      // Convert to format QuestionManager expects
      const mappedEvents = recentDbEvents
        .filter((e) => e.eventType && e.visibility)
        .map((e) => ({
          id: e.id,
          day: e.dayNumber || 0,
          type: e.eventType as
            | 'announcement'
            | 'meeting'
            | 'leak'
            | 'development'
            | 'scandal'
            | 'rumor'
            | 'deal'
            | 'conflict'
            | 'revelation',
          description: e.description,
          actors: (e.actors as string[]) || [],
          relatedQuestion: e.relatedQuestion || undefined,
          pointsToward: (e.pointsToward === 'YES' || e.pointsToward === 'NO'
            ? e.pointsToward
            : undefined) as 'YES' | 'NO' | undefined,
          visibility: e.visibility as
            | 'public'
            | 'leaked'
            | 'secret'
            | 'private'
            | 'group',
        }));

      // Create minimal DayTimeline structure for proof generation context
      // Only events are needed for resolution proof - other fields can be empty
      const recentTimelines: Array<{
        day: number;
        events: typeof mappedEvents;
        summary: string;
        groupChats: Record<string, never[]>;
        feedPosts: never[];
        luckChanges: never[];
        moodChanges: never[];
      }> = [
        {
          day: 0,
          events: mappedEvents,
          summary: 'Recent events context',
          groupChats: {},
          feedPosts: [],
          luckChanges: [],
          moodChanges: [],
        },
      ];

      const questionManager = new QuestionManager(llmClient);
      const questionForManager = {
        id: question.questionNumber,
        text: question.text,
        scenario: question.scenarioId || 1,
        outcome: question.outcome,
        rank: question.rank || 1,
        status: 'active' as const,
      };

      const proofResult = await questionManager.generateResolutionWithProof(
        questionForManager,
        allActors,
        organizations,
        recentTimelines
      );

      // Save proof to database
      const proofTimestamp = new Date();
      await db.transaction(async (tx) => {
        // Save proof article if generated
        // Note: Proof articles use type 'proof' (not 'article') to:
        // 1. Avoid counting toward the article rate limiter (feed pacing)
        // 2. Allow separate filtering in the /api/posts feed
        // 3. Keep resolution evidence separate from news articles
        if (proofResult.proof?.type === 'article') {
          await tx.insert(posts).values({
            id: proofResult.proof.article.id,
            type: 'proof', // Different from 'article' - exempt from rate limiting
            content: proofResult.proof.article.summary,
            fullContent: proofResult.proof.article.content,
            articleTitle: proofResult.proof.article.title,
            authorId: proofResult.proof.article.authorOrgId,
            gameId: gameState.id,
            dayNumber: gameState.currentDay ?? 1,
            timestamp: proofTimestamp,
            createdAt: proofTimestamp,
            category: proofResult.proof.article.category,
            sentiment: proofResult.proof.article.sentiment,
            slant: proofResult.proof.article.slant,
            biasScore: proofResult.proof.article.biasScore,
          });
        }

        // Update question with proof
        await tx
          .update(questions)
          .set({
            resolutionDescription: proofResult.description,
            resolutionProofUrl: proofResult.proof?.url ?? null,
            resolutionConfidence: proofResult.confidence,
            requiresManualReview: proofResult.requiresManualReview,
            resolutionReviewStatus: proofResult.requiresManualReview
              ? 'pending'
              : null,
            updatedAt: new Date(),
          })
          .where(eq(questions.id, question.id));
      });

      logger.info(
        `Generated resolution proof for Q${market.questionNumber}`,
        {
          hasArticle: proofResult.proof?.type === 'article',
          confidence: proofResult.confidence,
          requiresManualReview: proofResult.requiresManualReview,
        },
        'MarketsTick'
      );

      // Skip resolution if manual review required
      if (proofResult.requiresManualReview) {
        logger.warn(
          `Q${market.questionNumber} queued for manual review`,
          { confidence: proofResult.confidence },
          'MarketsTick'
        );
        return { resolved: false, oracleRevealed: false };
      }
    } catch (error) {
      logger.error(
        `Proof generation failed for Q${market.questionNumber}`,
        { error: error instanceof Error ? error.message : String(error) },
        'MarketsTick'
      );
      // Continue with resolution even without proof - payout is critical
    }
  }

  // ==========================================================================
  // STEP 3: Execute Payouts
  // ==========================================================================
  try {
    await resolveQuestionPayouts(market.questionNumber);
  } catch (error) {
    // Payout failure is critical - halt resolution to prevent partial state
    logger.error(
      `Payout execution failed for Q${market.questionNumber} - halting resolution`,
      {
        questionNumber: market.questionNumber,
        marketId: market.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'MarketsTick'
    );
    // Re-throw to abort cron run - positions must not be left unsettled
    throw new Error(
      `Payout failed for Q${market.questionNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // ==========================================================================
  // STEP 4: Oracle Reveal (blockchain verification)
  // ==========================================================================
  let oracleRevealed = false;
  try {
    const oracleResult = await publishOracleReveals([
      { id: question.id, outcome: question.outcome },
    ]);
    oracleRevealed = oracleResult.revealed > 0;

    if (oracleRevealed) {
      logger.info(
        `Oracle reveal published for Q${market.questionNumber}`,
        { outcome: question.outcome },
        'MarketsTick'
      );
    }
  } catch (error) {
    logger.debug(
      `Oracle reveal skipped (not configured or unavailable)`,
      { error: error instanceof Error ? error.message : String(error) },
      'MarketsTick'
    );
  }

  // ==========================================================================
  // STEP 5: Update timeframedMarkets state
  // ==========================================================================
  await db
    .update(timeframedMarkets)
    .set({
      isResolved: true,
      isActive: false,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(timeframedMarkets.questionId, market.id));

  logger.info(
    `Resolved ${market.timeframe} market completely`,
    {
      questionNumber: market.questionNumber,
      outcome: question.outcome ? 'YES' : 'NO',
      oracleRevealed,
    },
    'MarketsTick'
  );

  return { resolved: true, oracleRevealed };
}

/**
 * Create a new market for a specific timeframe.
 *
 * SCALABILITY FOR 300K+ USERS:
 * - Uses QuestionManager with comprehensive game context (world events, trending)
 * - Stores arc metadata in timeframedMarkets table (single source of truth)
 * - No inline NPC trading - handled by npc-tick for decoupled processing
 * - Oracle commitments for blockchain verifiability
 * - Event generation handled by existing timeframe-arc-processor.ts
 */
async function createMarketForTimeframe(
  timeframe: string,
  durationMs: number,
  llmClient: BabylonLLMClient,
  _gameState: GameState
): Promise<boolean> {
  const now = new Date();
  const resolutionDate = new Date(now.getTime() + durationMs);

  logger.info(
    `Creating ${timeframe} market`,
    { resolutionDate: resolutionDate.toISOString(), durationMs },
    'MarketsTick'
  );

  try {
    // Use QuestionManager for narrative-connected question generation
    // This queries world events, trending topics, and active questions for context
    const questionManager = new QuestionManager(llmClient);
    const questionData = await questionManager.generateTimeframeQuestion(
      timeframe,
      durationMs
    );

    if (!questionData) {
      logger.warn(
        `Failed to generate question for ${timeframe}`,
        {},
        'MarketsTick'
      );
      return false;
    }

    // Pre-generate IDs before transaction to track for potential cleanup
    const questionId = await generateSnowflakeId();
    const questionNumber = await getNextQuestionNumber();
    const timeframedMarketId = await generateSnowflakeId();

    // Create timeframe-appropriate arc plan before transaction
    // Arc plan is used for:
    // 1. Determining signal direction in events (via timeframe-arc-processor)
    // 2. Identifying insider/deceiver NPCs for authentic posting
    const actors = StaticDataRegistry.getAllActors()
      .filter((a) => a.role === 'main' || a.role === 'supporting')
      .slice(0, 30)
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        tier: a.tier ?? undefined,
        role: a.role,
        personality: a.personality,
        domain: a.domain,
        affiliations: a.affiliations,
      }));

    const organizations = StaticDataRegistry.getAllOrganizations()
      .filter((o) => o.type === 'company')
      .slice(0, 20)
      .map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        type: o.type as
          | 'company'
          | 'media'
          | 'government'
          | 'vc'
          | 'organization'
          | 'financial',
        canBeInvolved: o.canBeInvolved ?? true,
      }));

    const arcPlan = timeframeArcPlanner.planTimeframeArc(
      questionId,
      questionData.text,
      timeframe,
      durationMs,
      questionData.expectedOutcome,
      actors,
      organizations,
      questionData.affiliatedActorIds,
      questionData.affiliatedOrgIds
    );

    // Wrap all DB writes in a transaction to prevent orphaned rows
    // If any step fails, the entire transaction rolls back
    let market!: { id: string };

    await db.transaction(async (tx) => {
      // Step 1: Create the question in the database
      await tx.insert(questions).values({
        id: questionId,
        questionNumber,
        text: questionData.text,
        scenarioId: DEFAULT_SCENARIO_ID,
        outcome: questionData.expectedOutcome,
        rank: 1,
        resolutionDate,
        status: 'active',
        updatedAt: now,
      });

      // Step 2: Create corresponding market using CorePredictionMarketService
      // Uses MOCK_WALLET since this is system-level creation, not user-initiated
      // Note: CorePredictionMarketService uses its own DB adapter, but if it fails,
      // we still roll back the question insert above
      const marketService = new CorePredictionMarketService({
        db: new CorePredictionDbAdapter(),
        wallet: MOCK_WALLET,
        fees: SYSTEM_MARKET_FEES,
      });

      market = await marketService.ensureMarketExists({
        marketId: questionId,
        initialLiquidity: DEFAULT_INITIAL_LIQUIDITY,
        description: questionData.resolutionCriteria,
      });

      // Step 3: Register in timeframedMarkets table - this is the SINGLE SOURCE OF TRUTH
      // for timeframe-based market state. The timeframe-arc-processor.ts reads from this
      // table to:
      // - Advance arc state (e.g., setup -> active -> climax)
      // - Generate events with appropriate signal direction
      // - Spawn sub-markets if configured
      await tx.insert(timeframedMarkets).values({
        id: timeframedMarketId,
        questionId,
        timeframe: mapTimeframeToDbType(timeframe),
        category: inferCategory(questionData.text),
        startTime: now,
        endTime: resolutionDate,
        arcState: (arcPlan.phaseOrder[0] || 'setup') as ArcStateType,
        arcStateEnteredAt: now,
        // Store affiliated actors/orgs for context in NPC behavior
        affiliatedActorIds: arcPlan.affiliatedActorIds,
        affiliatedOrgIds: arcPlan.affiliatedOrgIds,
      });
    });

    // Publish oracle commitment for blockchain verifiability
    // The outcome is committed at creation time so it can't be tampered with
    try {
      const oracleResult = await publishOracleCommitments([
        {
          id: questionId,
          questionNumber,
          text: questionData.text,
          outcome: questionData.expectedOutcome,
        },
      ]);

      if (oracleResult.committed > 0) {
        logger.debug(
          `Oracle commitment published for Q${questionNumber}`,
          { committed: oracleResult.committed },
          'MarketsTick'
        );
      }
    } catch (oracleError) {
      // Oracle is optional - log but don't fail market creation
      logger.debug(
        `Oracle commitment skipped (not configured or unavailable)`,
        {
          error:
            oracleError instanceof Error
              ? oracleError.message
              : String(oracleError),
        },
        'MarketsTick'
      );
    }

    logger.info(
      `Created ${timeframe} market`,
      {
        questionNumber,
        questionId,
        marketId: market.id,
        timeframedMarketId,
        resolutionDate: resolutionDate.toISOString(),
        arcPhases: arcPlan.phaseOrder.length,
        insiders: arcPlan.insiders.length,
        deceivers: arcPlan.deceivers.length,
      },
      'MarketsTick'
    );

    // NPC trading on new markets is handled by npc-tick
    // This decoupling provides better scalability:
    // - markets-tick focuses on market lifecycle
    // - npc-tick handles all NPC behavior independently
    // - No inline LLM calls for NPC decisions

    return true;
  } catch (error) {
    logger.error(
      `Failed to create ${timeframe} market`,
      { error: error instanceof Error ? error.message : String(error) },
      'MarketsTick'
    );
    return false;
  }
}

/**
 * Infer market category from question text.
 * Used for filtering and organization in the UI.
 */
function inferCategory(questionText: string): MarketCategory {
  const text = questionText.toLowerCase();

  if (
    text.includes('bitcoin') ||
    text.includes('crypto') ||
    text.includes('eth') ||
    text.includes('token') ||
    text.includes('blockchain')
  ) {
    return 'crypto';
  }
  if (
    text.includes('tech') ||
    text.includes('software') ||
    text.includes('ai') ||
    text.includes('stock') ||
    text.includes('share') ||
    text.includes('ticker')
  ) {
    return 'tech';
  }
  if (
    text.includes('president') ||
    text.includes('congress') ||
    text.includes('vote') ||
    text.includes('election') ||
    text.includes('senate')
  ) {
    return 'politics';
  }
  if (
    text.includes('movie') ||
    text.includes('album') ||
    text.includes('celebrity') ||
    text.includes('award') ||
    text.includes('music')
  ) {
    return 'entertainment';
  }
  if (
    text.includes('game') ||
    text.includes('match') ||
    text.includes('championship') ||
    text.includes('score') ||
    text.includes('team')
  ) {
    return 'sports';
  }
  if (
    text.includes('research') ||
    text.includes('study') ||
    text.includes('discovery') ||
    text.includes('experiment')
  ) {
    return 'science';
  }
  if (
    text.includes('ceo') ||
    text.includes('company') ||
    text.includes('merger') ||
    text.includes('deal') ||
    text.includes('earnings')
  ) {
    return 'business';
  }

  return 'general';
}

/**
 * Map our timeframe strings to database MarketTimeframe enum values
 */
function mapTimeframeToDbType(
  timeframe: string
): 'flash' | 'intraday' | 'daily' | 'weekly' | 'monthly' | 'quarterly' {
  switch (timeframe) {
    case '15m':
    case '30m':
      return 'flash';
    case '1h':
    case '6h':
      return 'intraday';
    case '12h':
    case '1d':
      return 'daily';
    case '2d':
    case '3d':
    default:
      return 'weekly';
  }
}

/**
 * Get the next question number using an efficient MAX query.
 * Uses a single SQL aggregation instead of fetching all rows.
 */
async function getNextQuestionNumber(): Promise<number> {
  const result = await db
    .select({ maxNumber: max(questions.questionNumber) })
    .from(questions);

  // Handle null/undefined case (no questions exist yet)
  const rawMaxNumber = result[0]?.maxNumber;

  // Coerce to JS number - DB may return string, bigint, or number
  let maxNumber: number;
  if (rawMaxNumber === null || rawMaxNumber === undefined) {
    maxNumber = 0;
  } else if (typeof rawMaxNumber === 'bigint') {
    maxNumber = Number(rawMaxNumber);
  } else if (typeof rawMaxNumber === 'string') {
    maxNumber = parseInt(rawMaxNumber, 10);
    if (Number.isNaN(maxNumber)) {
      maxNumber = 0;
    }
  } else {
    maxNumber = Number(rawMaxNumber);
  }

  return maxNumber + 1;
}

// Old generateTimeframeQuestion and buildQuestionPrompt removed - now using QuestionManager.generateTimeframeQuestion()

/**
 * Get default duration for a timeframe
 */
function getDefaultDuration(timeframe: string): number {
  return MARKET_STRUCTURE[timeframe]?.durationMs || 24 * 60 * 60 * 1000;
}

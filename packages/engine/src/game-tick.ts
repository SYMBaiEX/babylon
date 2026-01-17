/**
 * Game tick - executes one canonical unit of game progression.
 * Used for both realtime (cron) and simulation modes.
 * Handles content generation, market decisions, question resolution, and system updates.
 */

import {
  PredictionDbAdapter as CorePredictionDbAdapter,
  PredictionMarketService as CorePredictionMarketService,
} from '@babylon/core/markets/prediction';
import {
  actorRelationships,
  and,
  arcStates,
  count,
  db,
  getDbInstance as dbService,
  desc,
  eq,
  games,
  gte,
  inArray,
  isNull,
  type JsonValue,
  markets as marketsSchema,
  organizationState,
  perpMarketSnapshots,
  perpPositions,
  pools,
  positions,
  posts,
  postTags,
  questions as questionsSchema,
  tags,
  tickTokenStats,
  trendingTags,
  widgetCaches,
  worldEvents,
  worldFacts,
} from '@babylon/db';
import {
  calculatePriceFromHoldings,
  DIAMOND_ADDRESS,
  generateSnowflakeId,
  getCurrentRpcUrl,
  logger,
  PERP_MARKET_CONFIG,
  PREDICTION_MARKET_ABI,
  REPUTATION_SYSTEM_BASE_SEPOLIA,
} from '@babylon/shared';
import { BabylonLLMClient } from './llm/openai-client';
import { MarketDecisionEngine } from './MarketDecisionEngine';
import { NPCInvestmentManager } from './npc/npc-investment-manager';
import { QuestionManager } from './QuestionManager';
import { RelationshipEvolutionEngine } from './RelationshipEvolutionEngine';
// Services - using barrel exports from services/index.ts
import {
  ActorSocialActions,
  AlphaGroupInviteService,
  bootstrapGameIfNeeded,
  calculateTrendingIfNeeded,
  calculateTrendingTags,
  createArcState,
  createParodyHeadlineGenerator,
  DistributedLockService,
  FollowingMechanics,
  generateArcPulseEventsIfNeeded,
  generateEvents,
  generateOrgPost,
  getOracleService,
  getTrendingPromptContext,
  initFalClient,
  invalidateAfterPredictionTrade,
  MarketContextService,
  NPCGroupDynamicsService,
  npcSocialEngagementService,
  PriceUpdateService,
  processArcTick,
  processNPCSocialEngagements,
  ReputationService,
  rssFeedService,
  StaticDataRegistry,
  syncReputationIfAvailable,
  TokenStatsService,
  TradeExecutionService,
  timeframeArcProcessor,
  WalletService,
  worldFactsGenerator,
} from './services';
import { broadcastToChannel } from './services/realtime-broadcaster';
import type { TradingExecutionResult } from './types/market-decisions';
import type {
  DayTimeline,
  Organization,
  Question,
  SelectedActor,
  WorldEvent,
} from './types/shared';
import { calculateEstimatedCost } from './types/token-stats';
import { getGameDayNumber, toSafeDayNumber } from './utils/date-utils';
import { deriveStrategyFromPersonality } from './utils/shared-utils';
import { worldFactsService } from './world-facts-service';
// Note: Event-market pipeline is called from within narrative-event-processor

// Services that are still in the web app (Web3/Oracle specific - use dynamic imports)

export interface GameTickResult {
  postsCreated: number;
  eventsCreated: number;
  articlesCreated: number;
  marketsUpdated: number;
  questionsResolved: number;
  questionsCreated: number;
  widgetCachesUpdated: number;
  trendingCalculated: boolean;
  reputationSynced: boolean;
  /** NPC social engagement metrics */
  npcLikesCreated?: number;
  npcSharesCreated?: number;
  npcCommentsCreated?: number;
  npcSocialActionsProcessed?: number;
  npcFollowsCreated?: number;
  npcUnfollows?: number;
  npcRebalanceActionsExecuted?: number;
  reputationSyncStats?: {
    total: number;
    successful: number;
    failed: number;
  };
  alphaInvitesSent: number;
  /** Number of NPC replies to other NPCs' posts (public discourse) */
  discourseReplies?: number;
  npcGroupDynamics?: {
    groupsCreated: number;
    membersAdded: number;
    membersRemoved: number;
    usersInvited: number;
    usersAutoJoined: number;
    usersKicked: number;
    messagesPosted: number;
  };
  oracleCommits: number;
  oracleReveals: number;
  oracleErrors: number;
  worldFactsUpdated?: boolean;
  worldFactsStats?: {
    feedsFetched: number;
    newHeadlines: number;
    parodiesGenerated: number;
    headlinesCleaned: number;
    worldFactsGenerated: number;
    worldFactsArchived: number;
  };
  relationshipsUpdated?: number;
  /** Number of markets with simulated price volatility applied */
  priceVolatilitySimulated?: number;
  /** Narrative arc processing stats */
  narrativeArcs?: {
    arcsProcessed: number;
    transitioned: number;
    eventsGenerated: number;
  };
  /** Timeframed market processing stats */
  timeframedMarkets?: {
    marketsProcessed: number;
    transitionsOccurred: number;
    eventsGenerated: number;
    subMarketsSpawned: number;
    errors: string[];
    eventTriggers: Array<{
      marketId: string;
      eventType: string;
      timeframe: string;
      arcState: string;
    }>;
  };
  /** Token usage statistics for this tick */
  tokenStats?: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUSD?: number;
  };
}

/** Executes a complete game tick (content, markets, questions, system updates). */
export async function executeGameTick(
  skipContentGeneration = false
): Promise<GameTickResult> {
  const timestamp = new Date();
  const startedAt = Date.now();
  const budgetMs = Number(process.env.GAME_TICK_BUDGET_MS || 180000); // 3 minutes default
  const deadline = startedAt + budgetMs;

  // Reserve 60 seconds for critical operations (market decisions, widget updates)
  const criticalOpsReserveMs = 60000;
  const criticalOpsDeadline = startedAt + budgetMs - criticalOpsReserveMs;

  // Start token usage collection for this tick
  const tokenStatsTickId = TokenStatsService.startTick(`tick-${startedAt}`);

  logger.info(
    'Executing game tick',
    { timestamp: timestamp.toISOString(), tokenStatsTickId },
    'GameTick'
  );

  // Initialize result counters
  const result: GameTickResult = {
    postsCreated: 0,
    eventsCreated: 0,
    articlesCreated: 0,
    marketsUpdated: 0,
    questionsResolved: 0,
    questionsCreated: 0,
    widgetCachesUpdated: 0,
    trendingCalculated: false,
    reputationSynced: false,
    alphaInvitesSent: 0,
    oracleCommits: 0,
    oracleReveals: 0,
    oracleErrors: 0,
  };

  // Bootstrap game data if needed (actors, organizations, mappings, pools, etc.)
  const bootstrapResult = await bootstrapGameIfNeeded();

  // Initialize fal.ai for article image generation (non-blocking)
  initFalClient();
  if (bootstrapResult) {
    const hasChanges =
      bootstrapResult.actorsCreated > 0 ||
      bootstrapResult.actorsToppedUp > 0 ||
      bootstrapResult.organizationsCreated > 0 ||
      bootstrapResult.poolsCreated > 0;

    if (hasChanges) {
      logger.info(
        'Game data bootstrapped',
        {
          actorsCreated: bootstrapResult.actorsCreated,
          actorsToppedUp: bootstrapResult.actorsToppedUp,
          organizationsCreated: bootstrapResult.organizationsCreated,
          poolsCreated: bootstrapResult.poolsCreated,
        },
        'GameTick'
      );
    }
  }

  // Compute game-relative day numbers for new writes (forward-only)
  const [continuousGame] = await db
    .select({ startedAt: games.startedAt, id: games.id })
    .from(games)
    .where(eq(games.isContinuous, true))
    .limit(1);
  const gameStartedAt = continuousGame?.startedAt ?? null;

  // Validate startedAt is set - critical for day calculation
  if (!gameStartedAt) {
    logger.error(
      'Game startedAt is NULL - day calculation will fail. Game day will default to 1.',
      { gameId: continuousGame?.id },
      'GameTick'
    );
  }

  const dayNumberForTimestamp = (t: Date): number | undefined => {
    if (!gameStartedAt) return undefined;
    return toSafeDayNumber(getGameDayNumber(gameStartedAt, t));
  };

  // Bootstrap initial content if this is a fresh setup
  await bootstrapContentIfNeeded(timestamp);

  // Initialize LLM client for game tick operations
  // Priority: Groq > Claude > OpenAI
  const llmClient = BabylonLLMClient.forGameTick();
  const stats = llmClient.getStats();
  logger.info(
    'LLM client initialized for game tick operations',
    {
      provider: stats.provider,
      model: stats.model,
    },
    'GameTick'
  );

  // Get active questions from database
  const activeQuestions = await db
    .select()
    .from(questionsSchema)
    .where(eq(questionsSchema.status, 'active'));

  logger.info(
    `Found ${activeQuestions.length} active questions`,
    { count: activeQuestions.length },
    'GameTick'
  );

  // Generate initial questions FIRST if this is the first tick
  let currentActiveQuestions = activeQuestions;
  if (activeQuestions.length === 0 && Date.now() < deadline) {
    logger.info(
      'First tick detected - generating initial questions',
      {},
      'GameTick'
    );
    const questionsGenerated = await generateNewQuestions(
      5, // Generate 5 initial questions
      llmClient,
      deadline
    );
    result.questionsCreated = questionsGenerated;

    // Reload active questions after generation (use new variable to avoid mutation)
    currentActiveQuestions = await db
      .select()
      .from(questionsSchema)
      .where(eq(questionsSchema.status, 'active'));

    logger.info(
      `Initial questions created: ${questionsGenerated}`,
      { count: questionsGenerated },
      'GameTick'
    );

    // Publish commitments to blockchain oracle
    if (questionsGenerated > 0 && currentActiveQuestions.length > 0) {
      const oracleResult = await publishOracleCommitments(
        currentActiveQuestions
      );
      result.oracleCommits += oracleResult.committed;
      result.oracleErrors += oracleResult.errors;
    }
  }

  const questionsToResolve = currentActiveQuestions.filter(
    (q: { resolutionDate: Date | null }) => {
      if (!q.resolutionDate) return false;
      const resolutionDate = new Date(q.resolutionDate);
      return resolutionDate <= timestamp;
    }
  );

  if (questionsToResolve.length > 0) {
    logger.info(
      `Resolving ${questionsToResolve.length} questions`,
      { count: questionsToResolve.length },
      'GameTick'
    );

    // Load required data for proof generation using StaticDataRegistry (preferred over loadActorsData)
    const staticActors = StaticDataRegistry.getAllActors();
    // Map StaticActor to SelectedActor, ensuring required fields are present
    const allActors: SelectedActor[] = staticActors
      .filter((actor) => actor.tier !== null)
      .map((actor) => ({
        id: actor.id,
        name: actor.name,
        description: actor.description,
        domain: actor.domain,
        personality: actor.personality,
        affiliations: actor.affiliations,
        postStyle: actor.postStyle,
        postExample: actor.postExample,
        tier: actor.tier!,
        role: actor.role ?? 'unknown',
        initialLuck:
          (actor.initialLuck as 'low' | 'medium' | 'high') ?? 'medium',
        initialMood: actor.initialMood ?? 0,
      }));
    // Map StaticOrganization to Organization type
    const organizations: Organization[] =
      StaticDataRegistry.getAllOrganizations().map((o) => ({
        id: o.id,
        name: o.name,
        ticker: o.ticker,
        description: o.description,
        type: o.type,
        canBeInvolved: o.canBeInvolved,
        initialPrice: o.initialPrice ?? undefined,
      }));

    // Get recent events for context
    const recentDbEvents = await db
      .select()
      .from(worldEvents)
      .where(
        gte(
          worldEvents.timestamp,
          new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        )
      )
      .orderBy(desc(worldEvents.timestamp));

    // Type guards for WorldEvent fields
    const isValidEventType = (type: string): type is WorldEvent['type'] => {
      return [
        'announcement',
        'meeting',
        'leak',
        'development',
        'scandal',
        'rumor',
        'deal',
        'conflict',
        'revelation',
        'development:occurred',
        'news:published',
      ].includes(type);
    };

    const isValidVisibility = (
      vis: string
    ): vis is WorldEvent['visibility'] => {
      return ['public', 'leaked', 'secret', 'private', 'group'].includes(vis);
    };

    const isValidPointsToward = (
      pt: string | null | undefined
    ): pt is WorldEvent['pointsToward'] => {
      return pt === null || pt === undefined || pt === 'YES' || pt === 'NO';
    };

    // Convert to DayTimeline format for QuestionManager
    const mappedEvents: WorldEvent[] = recentDbEvents
      .filter(
        (e) => isValidEventType(e.eventType) && isValidVisibility(e.visibility)
      )
      .map((e) => ({
        id: e.id,
        day: e.dayNumber || 0,
        type: e.eventType as WorldEvent['type'],
        description: e.description,
        actors: e.actors as string[],
        relatedQuestion: e.relatedQuestion || undefined,
        pointsToward: isValidPointsToward(e.pointsToward)
          ? e.pointsToward
          : undefined,
        visibility: e.visibility as WorldEvent['visibility'],
      }));

    const recentTimelines: DayTimeline[] = [
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
    const questionsToReveal: Array<{ id: string; outcome: boolean }> = [];

    // Resolve payouts
    // Each question resolution is wrapped in try/catch to prevent partial failures
    // from breaking the entire tick. Failed resolutions will be retried next tick.
    for (const question of questionsToResolve) {
      try {
        const isApproved = question.resolutionReviewStatus === 'approved';
        const isPendingManualReview =
          question.requiresManualReview && !isApproved;
        const hasStoredProof =
          Boolean(question.resolutionProofUrl) &&
          Boolean(question.resolutionDescription);

        if (isPendingManualReview && hasStoredProof) {
          logger.info(
            'Skipping question resolution (pending manual review)',
            {
              questionId: question.id,
              questionNumber: question.questionNumber,
              confidence: question.resolutionConfidence ?? null,
              reviewStatus: question.resolutionReviewStatus ?? 'pending',
            },
            'GameTick'
          );
          continue;
        }

        // Generate resolution proof content
        // We cast question to Question type - database question fields are compatible
        const questionForManager: Question = {
          id: question.questionNumber,
          text: question.text,
          scenario: question.scenarioId || 1,
          outcome: question.outcome,
          rank: question.rank || 1,
          status: 'active',
        };

        // Only generate proof if we don't have one stored
        // Avoids regenerating existing proofs when only confidence is missing
        const shouldGenerateProof = !hasStoredProof;

        let generatedProof: Awaited<
          ReturnType<QuestionManager['generateResolutionWithProof']>
        > | null = null;

        if (shouldGenerateProof) {
          const proofResult = await questionManager.generateResolutionWithProof(
            questionForManager,
            allActors,
            organizations,
            recentTimelines
          );

          generatedProof = proofResult;

          const reviewStatus = proofResult.requiresManualReview
            ? 'pending'
            : null;

          // Save proof article (if any) and update question atomically.
          await db.transaction(async (tx) => {
            if (proofResult.proof?.type === 'article') {
              await tx.insert(posts).values({
                id: proofResult.proof.article.id,
                type: 'article',
                content: proofResult.proof.article.summary,
                fullContent: proofResult.proof.article.content,
                articleTitle: proofResult.proof.article.title,
                authorId: proofResult.proof.article.authorOrgId,
                gameId: 'continuous',
                timestamp: new Date(),
                category: proofResult.proof.article.category,
                sentiment: proofResult.proof.article.sentiment,
                slant: proofResult.proof.article.slant,
                biasScore: proofResult.proof.article.biasScore,
              });
            }

            await tx
              .update(questionsSchema)
              .set({
                resolutionDescription: proofResult.description,
                resolutionProofUrl: proofResult.proof?.url ?? null,
                resolutionConfidence: proofResult.confidence,
                requiresManualReview: proofResult.requiresManualReview,
                resolutionReviewStatus: reviewStatus,
                updatedAt: new Date(),
              })
              .where(eq(questionsSchema.id, question.id));
          });

          if (proofResult.proof?.type === 'article') {
            logger.info(
              `Generated resolution proof for Q${question.questionNumber}`,
              {
                proofUrl: proofResult.proof.url,
                articleId: proofResult.proof.article.id,
                confidence: proofResult.confidence,
                requiresManualReview: proofResult.requiresManualReview,
                confidenceSignals: proofResult.confidenceSignals,
              },
              'GameTick'
            );
          }
        }

        const requiresManualReview =
          generatedProof?.requiresManualReview ?? question.requiresManualReview;
        const reviewStatus =
          generatedProof?.requiresManualReview === true
            ? 'pending'
            : question.resolutionReviewStatus;

        // If low-confidence, queue for manual review instead of resolving now.
        if (requiresManualReview && reviewStatus !== 'approved') {
          logger.warn(
            'Queued question for manual resolution review',
            {
              questionId: question.id,
              questionNumber: question.questionNumber,
              confidence:
                generatedProof?.confidence ?? question.resolutionConfidence,
              reviewStatus: reviewStatus ?? 'pending',
            },
            'GameTick'
          );
          continue;
        }

        // resolveQuestionPayouts has its own internal transaction for payout operations
        // and updates question status to 'resolved' atomically
        await resolveQuestionPayouts(question.questionNumber);
        result.questionsResolved++;
        questionsToReveal.push({ id: question.id, outcome: question.outcome });
      } catch (error) {
        // Log error but continue with other questions
        // Failed question will remain in 'active' status and be retried next tick
        logger.error(
          `Question resolution failed - will retry next tick`,
          {
            questionId: question.id,
            questionNumber: question.questionNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'GameTick'
        );
      }
    }

    // Publish reveals to blockchain oracle
    const oracleResult = await publishOracleReveals(questionsToReveal);
    result.oracleReveals += oracleResult.revealed;
    result.oracleErrors += oracleResult.errors;
  }

  // Organization content generation (media news articles) and world events
  // NPC posts and replies are now handled by /api/cron/npc-tick
  // Skip if buffer is sufficient (content generation handled by lookahead service)
  if (!skipContentGeneration) {
    if (Date.now() < criticalOpsDeadline) {
      // Generate organization content only (news articles from media orgs)
      const { posts, articles } = await generateOrganizationContent(
        currentActiveQuestions.slice(0, 3),
        timestamp,
        llmClient,
        criticalOpsDeadline,
        dayNumberForTimestamp
      );
      result.postsCreated = posts;
      result.articlesCreated = articles;
    } else {
      logger.warn(
        'Skipping organization content generation – tick budget exceeded',
        { budgetMs },
        'GameTick'
      );
    }

    // Generate world events based on active questions
    const eventsGenerated = await generateEvents(
      currentActiveQuestions.slice(0, 3),
      timestamp,
      dayNumberForTimestamp(timestamp)
    );
    const pulseEventsGenerated = await generateArcPulseEventsIfNeeded(
      currentActiveQuestions.slice(0, 3),
      timestamp,
      dayNumberForTimestamp(timestamp)
    );
    result.eventsCreated = eventsGenerated + pulseEventsGenerated;

    // NPC posts and replies are now handled by /api/cron/npc-tick
    // This removes the old generateMixedPosts and generateNPCRepliesFromPreviousTicks calls
  } else {
    logger.info(
      'Skipping content generation (buffer sufficient)',
      undefined,
      'GameTick'
    );
  }

  // CRITICAL PRIORITY: Generate and execute NPC trading decisions
  // This ALWAYS runs - uses the full deadline, not the critical ops deadline
  // Market decisions are essential for game economy and must always execute
  logger.info(
    'Starting critical market decision operations',
    {
      timeRemaining: deadline - Date.now(),
    },
    'GameTick'
  );

  const baselineResult =
    await NPCInvestmentManager.executeBaselineInvestments(timestamp);

  if (baselineResult) {
    const baselineUpdates = await updateMarketPricesFromTrades(
      timestamp,
      baselineResult
    );
    result.marketsUpdated += baselineUpdates;
  }

  const contextService = new MarketContextService();

  // Create LLM client for market decisions
  // Priority: Groq > Claude > OpenAI
  const marketDecisionLLM = BabylonLLMClient.forGameTick();
  const marketLLMStats = marketDecisionLLM.getStats();
  logger.info(
    `Using ${marketLLMStats.provider} for market decisions`,
    { model: marketLLMStats.model },
    'GameTick'
  );

  // Configure decision engine with model and token limits from environment
  // Use qwen/qwen3-32b on Groq for background trading operations
  const modelName = process.env.MARKET_DECISION_MODEL || 'qwen/qwen3-32b';

  // Model-aware output token limits:
  // Input and output are SEPARATE limits on modern models
  // - Kimi models: 260k INPUT + 16k OUTPUT (separate)
  // - qwen3-32b: 130k INPUT + 32k OUTPUT (separate)
  const isKimiModel = modelName.toLowerCase().includes('kimi');
  const defaultMaxOutput = isKimiModel ? 16000 : 32000;
  const maxOutputTokens = Number.parseInt(
    process.env.MARKET_DECISION_MAX_OUTPUT_TOKENS ||
      defaultMaxOutput.toString(),
    10
  );

  const decisionEngine = new MarketDecisionEngine(
    marketDecisionLLM,
    contextService,
    {
      model: modelName,
      maxOutputTokens,
    }
  );
  const executionService = new TradeExecutionService();

  const marketDecisions = await decisionEngine.generateBatchDecisions();

  if (marketDecisions.length === 0) {
    logger.info('No NPC market trades generated this tick', {}, 'GameTick');
  } else {
    const executionResult =
      await executionService.executeDecisionBatch(marketDecisions);

    logger.info(
      `NPC Trading: ${executionResult.successfulTrades} trades executed`,
      {
        successful: executionResult.successfulTrades,
        failed: executionResult.failedTrades,
        holds: executionResult.holdDecisions,
      },
      'GameTick'
    );

    // Update prices based on NPC trades
    const marketsUpdated = await updateMarketPricesFromTrades(
      timestamp,
      executionResult
    );
    result.marketsUpdated += marketsUpdated;
  }

  // =========================================================================
  // NPC SOCIAL ENGAGEMENT (likes, shares, comments)
  // Creates organic social activity to make the feed feel alive
  // =========================================================================
  if (Date.now() < deadline) {
    try {
      // Set LLM client for NPC comment generation
      npcSocialEngagementService.setLLMClient(llmClient);

      const socialEngagementResult = await processNPCSocialEngagements({
        now: timestamp,
        currentDay: dayNumberForTimestamp(timestamp) ?? undefined,
      });
      result.npcLikesCreated = socialEngagementResult.likesCreated;
      result.npcSharesCreated = socialEngagementResult.sharesCreated;
      result.npcCommentsCreated = socialEngagementResult.commentsCreated;

      if (
        socialEngagementResult.likesCreated > 0 ||
        socialEngagementResult.sharesCreated > 0 ||
        socialEngagementResult.commentsCreated > 0
      ) {
        logger.info(
          'NPC social engagements processed',
          {
            likes: socialEngagementResult.likesCreated,
            shares: socialEngagementResult.sharesCreated,
            comments: socialEngagementResult.commentsCreated,
            actors: socialEngagementResult.actorsEngaged,
          },
          'GameTick'
        );
      }
    } catch (error) {
      logger.error(
        'NPC social engagement failed',
        { error: error instanceof Error ? error.message : String(error) },
        'GameTick'
      );
    }
  }

  // =========================================================================
  // NPC SOCIAL ACTIONS (DMs, group invites based on interactions)
  // =========================================================================
  if (Date.now() < deadline) {
    try {
      const socialActions =
        await ActorSocialActions.processRandomSocialActions();
      result.npcSocialActionsProcessed = socialActions.length;

      if (socialActions.length > 0) {
        logger.info(
          'NPC social actions processed',
          {
            total: socialActions.length,
            invites: socialActions.filter((a) => a.type === 'group_chat_invite')
              .length,
            dms: socialActions.filter((a) => a.type === 'dm').length,
          },
          'GameTick'
        );
      }
    } catch (error) {
      logger.error(
        'NPC social actions failed',
        { error: error instanceof Error ? error.message : String(error) },
        'GameTick'
      );
    }
  }

  // =========================================================================
  // NPC FOLLOWING (proactive follows and unfollow checks)
  // NPCs follow active players and unfollow inactive ones
  // FollowingMechanics enforces its own time-slicing using the passed-in deadline
  // =========================================================================
  if (Date.now() < criticalOpsDeadline) {
    // Process proactive following of active players
    try {
      const followResult =
        await FollowingMechanics.processProactiveFollowing(criticalOpsDeadline);
      result.npcFollowsCreated = followResult.followsCreated;

      if (followResult.followsCreated > 0) {
        logger.info(
          'NPC proactive follows processed',
          {
            followsCreated: followResult.followsCreated,
            playersConsidered: followResult.playersConsidered,
          },
          'GameTick'
        );
      }
    } catch (error) {
      logger.error(
        'NPC proactive following failed',
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'GameTick'
      );
    }

    // Process unfollow checks (runs probabilistically) - separate try/catch so a failure doesn't hide follow progress
    try {
      const unfollowCount =
        await FollowingMechanics.processUnfollowChecks(criticalOpsDeadline);
      result.npcUnfollows = unfollowCount;
    } catch (error) {
      logger.error(
        'NPC unfollow checks failed',
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'GameTick'
      );
    }
  }

  // =========================================================================
  // NPC PORTFOLIO REBALANCING
  // Monitor NPC portfolios and execute rebalancing actions
  // =========================================================================
  if (Date.now() < deadline) {
    try {
      // Get all active NPC pools and monitor them
      const activePools = await db
        .select({ id: pools.id, npcActorId: pools.npcActorId })
        .from(pools)
        .where(eq(pools.isActive, true))
        .limit(10); // Limit to prevent overwhelming the tick

      let rebalanceActionsExecuted = 0;
      // Cap on total rebalance actions per tick to prevent expensive ticks
      const maxActionsPerTick = 20;

      for (const pool of activePools) {
        if (Date.now() >= deadline) break;
        if (rebalanceActionsExecuted >= maxActionsPerTick) {
          logger.debug(
            'Rebalance action cap reached, stopping pool processing',
            { maxActionsPerTick, poolsRemaining: activePools.length },
            'GameTick'
          );
          break;
        }

        // Skip pools without an NPC actor ID
        if (!pool.npcActorId) {
          continue;
        }

        const poolStartTime = Date.now();
        const actor = StaticDataRegistry.getActor(pool.npcActorId);

        // Determine trading strategy from actor data
        // Prefer explicit strategy property if available, otherwise derive from personality
        let strategy: 'aggressive' | 'conservative' | 'balanced' = 'balanced';
        if (actor) {
          // Check for explicit strategy property first (preferred)
          if ('strategy' in actor && typeof actor.strategy === 'string') {
            const explicitStrategy = actor.strategy.toLowerCase();
            if (
              explicitStrategy === 'aggressive' ||
              explicitStrategy === 'conservative' ||
              explicitStrategy === 'balanced'
            ) {
              strategy = explicitStrategy;
            }
          } else {
            // Use utility function to derive strategy from personality
            strategy = deriveStrategyFromPersonality(actor.personality);
          }
        }

        const rebalanceActions = await NPCInvestmentManager.monitorPortfolio(
          pool.id,
          pool.npcActorId,
          strategy
        );

        let poolActionsExecuted = 0;
        if (rebalanceActions.length > 0) {
          // Execute rebalance actions through NPCInvestmentManager
          for (const action of rebalanceActions) {
            if (rebalanceActionsExecuted >= maxActionsPerTick) break;
            try {
              await NPCInvestmentManager.executeRebalanceAction(
                pool.npcActorId,
                pool.id,
                action
              );
              rebalanceActionsExecuted++;
              poolActionsExecuted++;
            } catch (actionError) {
              logger.warn(
                'Failed to execute rebalance action',
                {
                  poolId: pool.id,
                  action: action.type,
                  error:
                    actionError instanceof Error
                      ? actionError.message
                      : String(actionError),
                },
                'GameTick'
              );
            }
          }
        }

        // Log per-pool timing for performance tuning
        const poolDuration = Date.now() - poolStartTime;
        if (poolDuration > 100 || poolActionsExecuted > 0) {
          logger.debug(
            'Pool rebalance processed',
            {
              poolId: pool.id,
              durationMs: poolDuration,
              actionsExecuted: poolActionsExecuted,
            },
            'GameTick'
          );
        }
      }

      result.npcRebalanceActionsExecuted = rebalanceActionsExecuted;

      if (rebalanceActionsExecuted > 0) {
        logger.info(
          'NPC portfolio rebalancing completed',
          { actionsExecuted: rebalanceActionsExecuted },
          'GameTick'
        );
      }
    } catch (error) {
      logger.error(
        'NPC portfolio rebalancing failed',
        { error: error instanceof Error ? error.message : String(error) },
        'GameTick'
      );
    }
  }

  // Article generation is now centralized in article-tick cron job.
  // This prevents duplicate article generation and ensures proper rate limiting.
  // Arc events still generate articles via generateArticlesForArcEvent() in narrative-event-processor.
  // See: apps/web/src/app/api/cron/article-tick/route.ts

  const currentActiveCount =
    currentActiveQuestions.length - result.questionsResolved;
  if (currentActiveCount < 10) {
    const shouldForceGeneration = currentActiveCount <= 0;
    if (Date.now() < deadline || shouldForceGeneration) {
      if (shouldForceGeneration && Date.now() >= deadline) {
        logger.warn(
          'No active prediction questions – forcing generation past tick budget',
          { budgetMs, currentActiveCount },
          'GameTick'
        );
      }

      // If we've exceeded the tick budget, still allow a small window to avoid
      // periods with zero active prediction markets.
      const generationDeadline =
        Date.now() < deadline ? deadline : Date.now() + 30_000;
      const questionsGenerated = await generateNewQuestions(
        Math.min(3, 15 - currentActiveCount),
        llmClient,
        generationDeadline
      );
      result.questionsCreated += questionsGenerated;
    } else {
      logger.warn(
        'Skipping question generation – tick budget exceeded',
        { budgetMs },
        'GameTick'
      );
    }
  }

  // Process narrative arcs for active questions
  // Each question can have an arc that progresses through phases
  // Arc events now create world events and can trigger article generation
  if (Date.now() < deadline) {
    const narrativeStats = await processNarrativeArcs(
      currentActiveQuestions,
      dayNumberForTimestamp(timestamp) ?? 1,
      llmClient
    );
    result.narrativeArcs = narrativeStats;
    if (narrativeStats.transitioned > 0 || narrativeStats.eventsGenerated > 0) {
      logger.info('Narrative arcs processed', narrativeStats, 'GameTick');
    }
  }

  // Process timeframed markets (multi-timeframe arcs: flash, intraday, daily, etc.)
  // These use timestamp-based progression rather than day-based
  if (Date.now() < deadline) {
    const timeframeStats = await timeframeArcProcessor.processTick(timestamp);
    result.timeframedMarkets = timeframeStats;
    if (timeframeStats.marketsProcessed > 0) {
      logger.info(
        'Timeframed markets processed',
        {
          processed: timeframeStats.marketsProcessed,
          transitions: timeframeStats.transitionsOccurred,
          events: timeframeStats.eventsGenerated,
          spawns: timeframeStats.subMarketsSpawned,
        },
        'GameTick'
      );
    }
  }

  // Calculate and update currentDay based on game start time
  const currentDay = dayNumberForTimestamp(timestamp);

  // Log day calculation for diagnostics
  logger.info(
    'Game day calculation',
    {
      startedAt: gameStartedAt?.toISOString(),
      currentTimestamp: timestamp.toISOString(),
      calculatedDay: currentDay,
      willSetTo: currentDay ?? 1,
      hoursElapsed: gameStartedAt
        ? Math.floor(
            (timestamp.getTime() - gameStartedAt.getTime()) / (1000 * 60 * 60)
          )
        : null,
    },
    'GameTick'
  );

  await db
    .update(games)
    .set({
      lastTickAt: timestamp,
      updatedAt: timestamp,
      currentDay: currentDay ?? 1,
    })
    .where(eq(games.isContinuous, true));

  const cachesUpdated = await updateWidgetCaches();
  result.widgetCachesUpdated = cachesUpdated;

  // Calculate trending tags if needed (checks 30-minute interval internally)
  // Force calculation on first tick if we just generated baseline posts
  const forceCalculation =
    result.postsCreated > 0 && result.articlesCreated > 0;
  const trendingCalculated = forceCalculation
    ? await forceTrendingCalculation()
    : await calculateTrendingIfNeeded();
  result.trendingCalculated = trendingCalculated;
  if (trendingCalculated) {
    logger.info('Trending tags recalculated', {}, 'GameTick');
  }

  // Sync reputation to ERC-8004 if service is available
  // Service is provided by agents package via setReputationSyncService()
  const syncResult = await syncReputationIfAvailable({
    limit: 10, // Small batch during game tick
    offset: 0,
    forceRecalculate: false,
    prioritizeNew: true, // Prioritize new accounts
  });
  if (syncResult) {
    result.reputationSynced = syncResult.synced > 0;
    if (syncResult.synced > 0) {
      result.reputationSyncStats = {
        total: syncResult.total,
        successful: syncResult.synced,
        failed: syncResult.failed,
      };
      logger.info(
        'Reputation sync completed during game tick',
        result.reputationSyncStats,
        'GameTick'
      );
    }
  }

  // Update world facts if needed (checks 24-hour interval internally)
  const worldFactsResult = await updateWorldFactsIfNeeded();
  result.worldFactsUpdated = worldFactsResult.updated;
  if (worldFactsResult.updated && worldFactsResult.stats) {
    result.worldFactsStats = worldFactsResult.stats;
    logger.info(
      'World facts update completed',
      worldFactsResult.stats,
      'GameTick'
    );
  }

  // Process alpha group invites (small chance for highly engaged users)
  const invites = await AlphaGroupInviteService.processTickInvites();
  result.alphaInvitesSent = invites.length;
  if (invites.length > 0) {
    logger.info(
      'Alpha group invites sent',
      { count: invites.length, invites },
      'GameTick'
    );
  }

  // Evolve NPC relationships based on recent interactions (every 10 ticks to save compute)
  const shouldEvolveRelationships =
    Math.floor(timestamp.getTime() / 60000) % 10 === 0;
  if (shouldEvolveRelationships && Date.now() < deadline) {
    logger.info('Evolving NPC relationships...', undefined, 'GameTick');
    const relationshipEngine = new RelationshipEvolutionEngine(llmClient);
    const relationshipsUpdated =
      await relationshipEngine.analyzeAndUpdateRelationships();
    result.relationshipsUpdated = relationshipsUpdated;
    if (relationshipsUpdated > 0) {
      logger.info(
        `✅ Updated ${relationshipsUpdated} relationships`,
        { count: relationshipsUpdated },
        'GameTick'
      );
    }

    // Cleanup stale NPC anti-repetition histories (same cadence as relationships)
    // This prevents unbounded memory growth in long-running processes
    const { antiRepetitionService } = await import(
      './services/npc-anti-repetition-service'
    );
    const cleanedHistories = antiRepetitionService.cleanupStaleHistories();
    if (cleanedHistories > 0) {
      logger.debug(
        `Cleaned up ${cleanedHistories} stale NPC anti-repetition histories`,
        { count: cleanedHistories },
        'GameTick'
      );
    }
  }

  // Process NPC group dynamics (form, join, leave, post, invite, kick)
  const dynamics = await NPCGroupDynamicsService.processTickDynamics();
  result.npcGroupDynamics = {
    groupsCreated: dynamics.groupsCreated,
    membersAdded: dynamics.membersAdded,
    membersRemoved: dynamics.membersRemoved,
    usersInvited: dynamics.usersInvited,
    usersAutoJoined: dynamics.usersAutoJoined,
    usersKicked: dynamics.usersKicked,
    messagesPosted: dynamics.messagesPosted,
  };
  if (
    dynamics.groupsCreated > 0 ||
    dynamics.membersAdded > 0 ||
    dynamics.membersRemoved > 0 ||
    dynamics.usersInvited > 0 ||
    dynamics.usersKicked > 0 ||
    dynamics.messagesPosted > 0
  ) {
    logger.info('NPC group dynamics processed', dynamics, 'GameTick');
  }

  const durationMs = Date.now() - startedAt;

  // Validation: Quality checks after game tick
  const validationWarnings: string[] = [];

  // Verify markets were updated if NPC trading ran
  // Check both baseline investments and market decisions
  const hadNPCTrading =
    baselineResult || (marketDecisions && marketDecisions.length > 0);
  if (result.marketsUpdated === 0 && hadNPCTrading) {
    validationWarnings.push('NPC trading executed but no markets were updated');
  }

  // Verify content was generated if buffer was low and not skipped
  if (
    !skipContentGeneration &&
    result.postsCreated === 0 &&
    result.articlesCreated === 0 &&
    result.eventsCreated === 0
  ) {
    validationWarnings.push(
      'Content generation ran but no content was created'
    );
  }

  // Verify questions resolved correctly
  if (result.questionsResolved > 0) {
    // Check that resolved questions have correct status
    const resolvedQuestions = await db
      .select()
      .from(questionsSchema)
      .where(
        and(
          eq(questionsSchema.status, 'resolved'),
          gte(questionsSchema.updatedAt, new Date(timestamp.getTime() - 60000)) // Updated in last minute
        )
      )
      .limit(result.questionsResolved);

    if (resolvedQuestions.length !== result.questionsResolved) {
      validationWarnings.push(
        `Expected ${result.questionsResolved} resolved questions but found ${resolvedQuestions.length}`
      );
    }
  }

  // Validate market prices are reasonable (0-100% for predictions)
  const activeMarkets = await db
    .select()
    .from(marketsSchema)
    .where(
      and(
        eq(marketsSchema.resolved, false),
        gte(marketsSchema.endDate, timestamp)
      )
    )
    .limit(10);

  for (const market of activeMarkets) {
    const yesShares = Number(market.yesShares);
    const noShares = Number(market.noShares);
    const totalShares = yesShares + noShares;

    if (totalShares > 0) {
      const yesOdds = (yesShares / totalShares) * 100;
      const noOdds = (noShares / totalShares) * 100;

      // Odds should be between 0 and 100%
      if (yesOdds < 0 || yesOdds > 100 || noOdds < 0 || noOdds > 100) {
        validationWarnings.push(
          `Market ${market.id} has invalid odds: YES=${yesOdds.toFixed(2)}%, NO=${noOdds.toFixed(2)}%`
        );
      }

      // Odds should sum to approximately 100% (allowing for rounding)
      const sum = yesOdds + noOdds;
      if (sum < 99.9 || sum > 100.1) {
        validationWarnings.push(
          `Market ${market.id} odds don't sum to 100%: ${sum.toFixed(2)}%`
        );
      }
    }
  }

  // Log validation warnings if any
  if (validationWarnings.length > 0) {
    logger.warn(
      'Game tick validation warnings',
      {
        warnings: validationWarnings,
        result,
      },
      'GameTick'
    );
  }

  // End token stats collection and store in database
  const tickTokenStatsData = TokenStatsService.endTick();
  if (tickTokenStatsData) {
    // Calculate estimated cost from per-model usage
    let estimatedCostUSD = 0;
    for (const modelStats of tickTokenStatsData.byModel) {
      const cost = calculateEstimatedCost(
        modelStats.model,
        modelStats.totalInputTokens,
        modelStats.totalOutputTokens
      );
      estimatedCostUSD += cost.totalCostUSD;
    }

    // Add token stats to result
    result.tokenStats = {
      totalCalls: tickTokenStatsData.totalCalls,
      totalInputTokens: tickTokenStatsData.totalInputTokens,
      totalOutputTokens: tickTokenStatsData.totalOutputTokens,
      totalTokens: tickTokenStatsData.totalTokens,
      estimatedCostUSD,
    };

    // Store token stats in database (non-blocking)
    // Serialize complex types to JSON-compatible format
    const byPromptTypeJson = JSON.parse(
      JSON.stringify(tickTokenStatsData.byPromptType)
    ) as JsonValue;
    const byModelJson = JSON.parse(
      JSON.stringify(tickTokenStatsData.byModel)
    ) as JsonValue;

    db.insert(tickTokenStats)
      .values({
        id: tickTokenStatsData.tickId,
        tickId: tickTokenStatsData.tickId,
        tickStartedAt: tickTokenStatsData.tickStartedAt,
        tickCompletedAt: tickTokenStatsData.tickCompletedAt,
        tickDurationMs: tickTokenStatsData.tickDurationMs,
        totalCalls: tickTokenStatsData.totalCalls,
        totalInputTokens: tickTokenStatsData.totalInputTokens,
        totalOutputTokens: tickTokenStatsData.totalOutputTokens,
        totalTokens: tickTokenStatsData.totalTokens,
        byPromptType: byPromptTypeJson,
        byModel: byModelJson,
      })
      .catch((error: Error) => {
        logger.warn(
          'Failed to store token stats',
          { error: error.message, tickId: tickTokenStatsData.tickId },
          'GameTick'
        );
      });

    logger.info(
      'Token stats collected',
      {
        tickId: tickTokenStatsData.tickId,
        totalCalls: tickTokenStatsData.totalCalls,
        totalTokens: tickTokenStatsData.totalTokens,
        inputTokens: tickTokenStatsData.totalInputTokens,
        outputTokens: tickTokenStatsData.totalOutputTokens,
      },
      'GameTick'
    );
  }

  // Simulate market volatility (independent of NPC trades)
  // This keeps markets "alive" with realistic price movements
  try {
    const volatilityUpdates = await simulateMarketVolatility();
    if (volatilityUpdates > 0) {
      result.priceVolatilitySimulated = volatilityUpdates;
    }
  } catch (error) {
    logger.warn(
      'Volatility simulation failed',
      { error: error instanceof Error ? error.message : String(error) },
      'GameTick'
    );
  }

  logger.info(
    'Game tick completed',
    {
      ...result,
      durationMs,
      validationWarnings:
        validationWarnings.length > 0 ? validationWarnings.length : undefined,
    },
    'GameTick'
  );

  return result;
}

/**
 * Bootstrap content on first game tick
 * Ensures trending and relationships are initialized automatically
 * Note: News articles are NOT pre-populated - they come from actual questions/events
 */
async function bootstrapContentIfNeeded(_timestamp: Date): Promise<void> {
  // Check if we need to bootstrap
  const [trendingResult, relationshipResult] = await Promise.all([
    db.select({ count: count() }).from(trendingTags),
    db.select({ count: count() }).from(actorRelationships),
  ]);
  const trendingCount = Number(trendingResult[0]?.count ?? 0);
  const relationshipCount = Number(relationshipResult[0]?.count ?? 0);

  const MIN_TRENDING = 5;

  // If we have enough of everything, nothing to do
  if (trendingCount >= MIN_TRENDING && relationshipCount > 0) {
    return;
  }

  logger.info(
    'Bootstrapping initial content...',
    {
      currentTrending: trendingCount,
      currentRelationships: relationshipCount,
      needTrending: trendingCount < MIN_TRENDING,
      needRelationships: relationshipCount === 0,
    },
    'GameTick'
  );

  // Bootstrap relationships FIRST (needed for social dynamics)
  if (relationshipCount === 0) {
    await bootstrapInitialRelationships();
  }

  // Bootstrap trending if needed (requires posts and tags)
  if (trendingCount < MIN_TRENDING) {
    await bootstrapTrending();
  }

  const [finalTrending, finalRelationships] = await Promise.all([
    db.select({ count: count() }).from(trendingTags),
    db.select({ count: count() }).from(actorRelationships),
  ]);
  logger.info(
    'Bootstrap complete',
    {
      trendingCount: Number(finalTrending[0]?.count ?? 0),
      relationshipCount: Number(finalRelationships[0]?.count ?? 0),
    },
    'GameTick'
  );
}

/**
 * Generate initial NPC relationships on first tick
 */
async function bootstrapInitialRelationships(): Promise<void> {
  logger.info('Generating initial NPC relationships...', undefined, 'GameTick');

  // Get all actors and organizations from STATIC REGISTRY (no DB call!)
  const staticActors = StaticDataRegistry.getAllActors();
  const staticOrgs = StaticDataRegistry.getAllOrganizations();

  // Convert to Actor type
  const actorData = staticActors.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description || undefined,
    domain: a.domain,
    personality: a.personality || undefined,
    affiliations: a.affiliations,
  }));

  const orgData = staticOrgs.map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    type: o.type as 'company' | 'media' | 'government',
    canBeInvolved: true,
  }));

  // Generate relationships
  const engine = new RelationshipEvolutionEngine();
  const created = await engine.generateInitialRelationships(actorData, orgData);

  logger.info(
    `✅ Generated ${created} initial relationships`,
    { count: created },
    'GameTick'
  );
}

/**
 * Bootstrap trending tags
 */
async function bootstrapTrending(): Promise<void> {
  logger.info('Bootstrapping trending tags...', undefined, 'GameTick');

  // Check if we have enough posts and tags
  const [postCountResult, taggedPostCountResult] = await Promise.all([
    db.select({ count: count() }).from(posts),
    db
      .select({ count: count() })
      .from(posts)
      .innerJoin(postTags, eq(posts.id, postTags.postId)),
  ]);
  const postCount = Number(postCountResult[0]?.count ?? 0);
  const taggedPostCount = Number(taggedPostCountResult[0]?.count ?? 0);

  logger.info(
    'Post/tag status for trending',
    {
      totalPosts: postCount,
      taggedPosts: taggedPostCount,
      taggedPercentage:
        postCount > 0 ? Math.round((taggedPostCount / postCount) * 100) : 0,
    },
    'GameTick'
  );

  // If we have tagged posts, calculate trending
  if (taggedPostCount >= 10) {
    await calculateTrendingTags();
    logger.info(
      'Calculated trending from existing posts',
      undefined,
      'GameTick'
    );
    return;
  }

  // If we have posts but they're not tagged, tag them first
  if (postCount >= 10 && taggedPostCount < 10) {
    logger.info(
      'Posts exist but not tagged, waiting for auto-tagging...',
      undefined,
      'GameTick'
    );
    logger.info(
      'Trending will be calculated once posts are tagged',
      undefined,
      'GameTick'
    );
    return;
  }

  // If we have very few posts, create sample tags and trending
  logger.info('Creating sample trending data...', undefined, 'GameTick');

  const sampleTags = [
    { name: 'markets', displayName: 'Markets', category: 'Finance' },
    { name: 'tech', displayName: 'Tech', category: 'Tech' },
    { name: 'ai', displayName: 'AI', category: 'Tech' },
    { name: 'finance', displayName: 'Finance', category: 'Finance' },
    { name: 'innovation', displayName: 'Innovation', category: 'Tech' },
  ];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < sampleTags.length; i++) {
    const tagData = sampleTags[i];
    if (!tagData) continue;

    // Create tag (check if exists first)
    const [existingTag] = await db
      .select({
        id: tags.id,
        name: tags.name,
        displayName: tags.displayName,
        category: tags.category,
      })
      .from(tags)
      .where(eq(tags.name, tagData.name))
      .limit(1);

    let tag: {
      id: string;
      name: string;
      displayName: string;
      category: string | null;
    };
    if (existingTag) {
      tag = existingTag;
    } else {
      const [newTag] = await db
        .insert(tags)
        .values({
          id: await generateSnowflakeId(),
          name: tagData.name,
          displayName: tagData.displayName,
          category: tagData.category,
          updatedAt: now,
        })
        .returning();
      if (!newTag) {
        logger.warn('Failed to create tag', { tagData }, 'GameTick');
        continue;
      }
      tag = {
        id: newTag.id,
        name: newTag.name,
        displayName: newTag.displayName,
        category: newTag.category,
      };
    }

    // Create trending entry with real post count (0 since no posts are tagged yet)
    const score = (sampleTags.length - i) * 10 + Math.random() * 5;

    await db.insert(trendingTags).values({
      id: await generateSnowflakeId(),
      tagId: tag.id,
      score,
      postCount: 0, // Real count - will be updated when trending is calculated
      rank: i + 1,
      windowStart: weekAgo,
      windowEnd: now,
      relatedContext: null,
    });
  }

  logger.info(
    `Created ${sampleTags.length} sample trending tags`,
    undefined,
    'GameTick'
  );
}

/**
 * Generate organization content (news articles and posts from media orgs)
 * NPC posts are now handled by /api/cron/npc-tick
 */
async function generateOrganizationContent(
  questions: Array<{ id: string; text: string; questionNumber: number }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number,
  dayNumberForTimestamp: (t: Date) => number | undefined
): Promise<{ posts: number; articles: number }> {
  const postsToGenerate = 1; // Organization posts/articles per tick (reduced from 4)

  if (questions.length === 0) {
    logger.warn(
      'No questions available for org content generation',
      {},
      'GameTick'
    );
    return { posts: 0, articles: 0 };
  }

  // Get organizations and world context
  const [worldFactsBase, trendingContext] = await Promise.all([
    worldFactsService.generatePromptContext(),
    getTrendingPromptContext(),
  ]);

  const worldFactsContext = worldFactsBase + trendingContext;

  // Get media organizations from static registry
  const orgsList = StaticDataRegistry.getAllOrganizations()
    .filter((org) => org.type === 'media')
    .slice(0, 8);

  if (orgsList.length === 0) {
    logger.warn(
      'No media organizations found for content generation',
      {},
      'GameTick'
    );
    return { posts: 0, articles: 0 };
  }

  // Shuffle orgs for variety
  const shuffledOrgs = [...orgsList].sort(() => Math.random() - 0.5);
  const shuffledQuestions = [...questions].sort(() => Math.random() - 0.5);

  logger.info(
    `Generating ${postsToGenerate} organization posts/articles`,
    {
      orgsAvailable: orgsList.length,
      uniqueQuestions: shuffledQuestions.length,
    },
    'GameTick'
  );

  // Generate posts with timestamps spread across the tick interval
  const tickDurationMs = 60000;
  const timeSlotMs = tickDurationMs / postsToGenerate;

  // Articles are now centralized in article-tick cron job.
  // This function generates organization posts only.
  const postPromises = Array.from(
    { length: Math.min(postsToGenerate, shuffledOrgs.length) },
    async (_, i) => {
      if (Date.now() > deadlineMs) {
        return 0;
      }

      const org = shuffledOrgs[i];
      if (!org) return 0;

      const question = shuffledQuestions[i % shuffledQuestions.length];
      if (!question?.text) return 0;

      const slotOffset = i * timeSlotMs;
      const randomJitter = Math.random() * timeSlotMs * 0.8;
      const timestampWithOffset = new Date(
        timestamp.getTime() + slotOffset + randomJitter
      );
      const postDayNumber = dayNumberForTimestamp(timestampWithOffset);

      const success = await generateOrgPost(
        llm,
        org,
        question,
        worldFactsContext,
        timestampWithOffset,
        postDayNumber
      );
      return success ? 1 : 0;
    }
  );

  const results = await Promise.allSettled(postPromises);

  let postsCreated = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      postsCreated += result.value;
    }
  }

  logger.info(
    'Organization post generation complete',
    {
      postsCreated,
      orgsAvailable: orgsList.length,
      attempted: postPromises.length,
    },
    'GameTick'
  );

  return { posts: postsCreated, articles: 0 };
}

// generateEvents moved to services/event-generation-helpers.ts

/** Update market prices based on NPC trading activity (investment-based pricing). */
export async function updateMarketPricesFromTrades(
  _timestamp: Date,
  executionResult: TradingExecutionResult
): Promise<number> {
  if (!executionResult.executedTrades.length) return 0;

  const hasPerpTrades = executionResult.executedTrades.some(
    (t) => t.marketType === 'perp'
  );
  if (!hasPerpTrades) return 0;

  // Recompute perp prices from open PerpPosition rows.
  // NPC perps now trade via PerpMarketService (perpPositions table), so using
  // legacy poolPositions would keep prices effectively static.
  const snapshots = await db
    .select({
      ticker: perpMarketSnapshots.ticker,
      organizationId: perpMarketSnapshots.organizationId,
      currentPrice: perpMarketSnapshots.currentPrice,
    })
    .from(perpMarketSnapshots);

  if (snapshots.length === 0) return 0;

  // Scope recomputation to tickers actually traded this tick (when available).
  const tradedTickers = new Set(
    executionResult.executedTrades
      .filter(
        (
          t
        ): t is (typeof executionResult.executedTrades)[number] & {
          ticker: string;
        } => t.marketType === 'perp' && typeof t.ticker === 'string'
      )
      .map((t) => t.ticker.toUpperCase())
  );

  const selected =
    tradedTickers.size > 0
      ? snapshots.filter((s) => tradedTickers.has(s.ticker.toUpperCase()))
      : snapshots;

  if (selected.length === 0) return 0;

  const orgIds = [...new Set(selected.map((s) => s.organizationId))];
  const orgStates = await db
    .select({
      id: organizationState.id,
      basePrice: organizationState.basePrice,
    })
    .from(organizationState)
    .where(inArray(organizationState.id, orgIds));
  const initialByOrgId = new Map(
    orgStates.map((o) => [o.id, Number(o.basePrice ?? 100)])
  );

  const tickers = selected.map((s) => s.ticker);
  const positionsOpen = await db
    .select({
      ticker: perpPositions.ticker,
      side: perpPositions.side,
      size: perpPositions.size,
    })
    .from(perpPositions)
    .where(
      and(
        inArray(perpPositions.ticker, tickers),
        isNull(perpPositions.closedAt)
      )
    );

  const holdingsByTicker = new Map<string, number>();
  for (const pos of positionsOpen) {
    const current = holdingsByTicker.get(pos.ticker) ?? 0;
    const delta = pos.side === 'long' ? Number(pos.size) : -Number(pos.size);
    holdingsByTicker.set(pos.ticker, current + delta);
  }

  const updates = selected
    .map((snap) => {
      const basePrice = initialByOrgId.get(snap.organizationId);
      const initialPrice =
        typeof basePrice === 'number' &&
        Number.isFinite(basePrice) &&
        basePrice > 0
          ? basePrice
          : Number(snap.currentPrice ?? 100);
      const currentPrice = Number(snap.currentPrice ?? initialPrice);
      const netHoldings = holdingsByTicker.get(snap.ticker) ?? 0;

      const newPrice = calculatePriceFromHoldings(
        initialPrice,
        currentPrice,
        netHoldings,
        PERP_MARKET_CONFIG
      );

      if (Math.abs(newPrice - currentPrice) < 0.001) return null;

      return {
        organizationId: snap.organizationId,
        newPrice,
        source: 'npc_trade' as const,
        reason: 'NPC trading price impact',
        metadata: { ticker: snap.ticker },
      };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  if (updates.length === 0) return 0;

  const applied = await PriceUpdateService.applyUpdates(updates);

  logger.info(
    `Perp price recomputation applied ${applied.length} updates`,
    { count: applied.length },
    'GameTick'
  );

  return applied.length;
}

/**
 * Generate new questions using QuestionManager
 */
async function generateNewQuestions(
  count: number,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  const questionManager = new QuestionManager(llm);
  return await questionManager.generateQuestionsForContinuousGame(
    count,
    deadlineMs
  );
}

/**
 * Resolve question payouts
 */
export async function resolveQuestionPayouts(
  questionNumber: number
): Promise<void> {
  const [question] = await db
    .select()
    .from(questionsSchema)
    .where(eq(questionsSchema.questionNumber, questionNumber))
    .limit(1);

  if (!question) return;

  // Try to find market by question id first, then by question text
  let [market] = await db
    .select()
    .from(marketsSchema)
    .where(eq(marketsSchema.id, question.id))
    .limit(1);

  if (!market) {
    [market] = await db
      .select()
      .from(marketsSchema)
      .where(eq(marketsSchema.question, question.text))
      .limit(1);
  }

  if (!market) return;

  if (market.resolved) {
    logger.info(
      'Market already resolved, skipping payouts',
      { marketId: market.id, questionNumber },
      'GameTick'
    );
    return;
  }

  const winningSide = question.outcome;
  const resolutionTimestamp = new Date();

  // Store market properties in consts to ensure type narrowing
  const marketId = market.id;
  const marketOnChainMarketId = market.onChainMarketId;
  const marketOnChainResolved = market.onChainResolved;

  const pnlsToRecord: Array<{ userId: string; pnl: number }> = [];
  let totalPayout = 0;
  let positionsSettled = 0;

  await db.transaction(async (tx) => {
    const coreService = new CorePredictionMarketService({
      db: new CorePredictionDbAdapter(tx),
      wallet: {
        debit: async () => {
          throw new Error('Unexpected debit during market resolution');
        },
        credit: async ({ userId, amount, reason, description, relatedId }) => {
          totalPayout += amount;
          await WalletService.credit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId,
            tx
          );
        },
        recordPnL: async ({ userId, pnl }) => {
          pnlsToRecord.push({ userId, pnl });
        },
        getBalance: (userId: string) => WalletService.getBalance(userId),
      },
      broadcast: {
        emit: (_channel, payload) =>
          broadcastToChannel('markets', payload as Record<string, JsonValue>),
      },
      cache: {
        invalidate: () => invalidateAfterPredictionTrade(marketId),
      },
      fees: {
        tradingFeeRate: 0,
        platformShare: 0,
        referrerShare: 0,
        minFeeAmount: 0,
      },
      clock: { now: () => resolutionTimestamp },
    });

    // Estimate positions settled for logging (coreService updates all positions for the market)
    const existingPositions = await tx
      .select({ id: positions.id })
      .from(positions)
      .where(eq(positions.marketId, marketId));
    positionsSettled = existingPositions.length;

    await coreService.resolve({
      marketId,
      winningSide: winningSide ? 'yes' : 'no',
      resolvedAt: resolutionTimestamp,
      resolutionDescription: question.resolutionDescription ?? undefined,
      resolutionProofUrl: question.resolutionProofUrl ?? undefined,
    });

    await tx
      .update(questionsSchema)
      .set({
        status: 'resolved',
        resolvedOutcome: winningSide,
        updatedAt: resolutionTimestamp,
      })
      .where(eq(questionsSchema.id, question.id));
  });

  // Record PnL post-transaction to avoid nested transactions inside the DB tx.
  for (const entry of pnlsToRecord) {
    if (entry.pnl === 0) continue;
    await WalletService.recordPnL(
      entry.userId,
      entry.pnl,
      'pred_resolve',
      marketId
    );
  }

  // Check if on-chain reputation updates are configured (requires deployer key)
  if (process.env.DEPLOYER_PRIVATE_KEY && REPUTATION_SYSTEM_BASE_SEPOLIA) {
    await ReputationService.updateReputationForResolvedMarket({
      marketId: marketId,
      outcome: winningSide,
    });
  } else {
    logger.debug(
      'Skipping reputation update - DEPLOYER_PRIVATE_KEY not configured',
      { marketId: marketId },
      'GameTick'
    );
  }

  // Resolve market on-chain if onChainMarketId exists
  let onChainResolutionTxHash: string | null = null;
  if (marketOnChainMarketId && !marketOnChainResolved) {
    onChainResolutionTxHash = await resolveMarketOnChain(
      marketOnChainMarketId,
      winningSide ? 1 : 0 // Binary market: true = 1, false = 0
    );
  }

  if (onChainResolutionTxHash) {
    await db
      .update(marketsSchema)
      .set({
        onChainResolved: true,
        onChainResolutionTxHash,
        updatedAt: new Date(),
      })
      .where(eq(marketsSchema.id, marketId));
  }

  logger.info(
    'Resolved prediction market payouts',
    {
      marketId: market.id,
      questionNumber,
      winningSide: winningSide ? 'YES' : 'NO',
      totalPayout,
      positionsSettled,
    },
    'GameTick'
  );
}

/**
 * Resolve market on-chain via PredictionMarketFacet
 */
async function resolveMarketOnChain(
  onChainMarketId: string,
  winningOutcome: number
): Promise<string> {
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const rpcUrl = getCurrentRpcUrl();

  if (!DIAMOND_ADDRESS || !deployerPrivateKey) {
    throw new Error(
      'Missing blockchain configuration - DEPLOYER_PRIVATE_KEY required'
    );
  }

  const { createPublicClient, createWalletClient, http, parseAbi } =
    await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { baseSepolia } = await import('viem/chains');

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const account = privateKeyToAccount(deployerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // Resolve market on-chain
  // winningOutcome must be uint8 (0 or 1 for binary markets)
  const txHash = await walletClient.writeContract({
    address: DIAMOND_ADDRESS as `0x${string}`,
    abi: parseAbi(PREDICTION_MARKET_ABI),
    functionName: 'resolveMarket',
    args: [onChainMarketId as `0x${string}`, winningOutcome as number],
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  return txHash;
}

/**
 * Publish question commitments to blockchain oracle
 */
export async function publishOracleCommitments(
  questions: Array<{
    id: string;
    questionNumber: number;
    text: string;
    outcome: boolean;
  }>
): Promise<{ committed: number; errors: number }> {
  let committed = 0;
  let errors = 0;

  // Check if oracle is configured
  if (
    !process.env.NEXT_PUBLIC_BABYLON_ORACLE ||
    !process.env.ORACLE_PRIVATE_KEY
  ) {
    logger.info(
      'Oracle not configured, skipping commitments',
      undefined,
      'GameTick'
    );
    return { committed: 0, errors: 0 };
  }

  const oracleService = getOracleService();

  // Health check
  const health = await oracleService.healthCheck();
  if (!health.healthy) {
    logger.error(
      `Oracle health check failed: ${health.error}`,
      undefined,
      'GameTick'
    );
    return { committed: 0, errors: questions.length };
  }

  // Batch commit games
  const batch = questions.map((q) => ({
    questionId: q.id,
    questionNumber: q.questionNumber,
    question: q.text,
    category: 'general', // Could extract from question text
    outcome: q.outcome,
  }));

  const result = await oracleService.batchCommitGames(batch);

  // Update questions with oracle data
  for (const success of result.successful) {
    await db
      .update(questionsSchema)
      .set({
        oracleSessionId: success.sessionId,
        oracleCommitment: success.commitment,
        oracleCommitTxHash: success.txHash,
        oracleCommitBlock: success.blockNumber || null,
        updatedAt: new Date(),
      })
      .where(eq(questionsSchema.id, success.questionId));
    committed++;
  }

  errors = result.failed.length;

  if (errors > 0) {
    logger.warn(
      `${errors} oracle commits failed`,
      { failures: result.failed },
      'GameTick'
    );
  }

  logger.info(
    `Oracle commits: ${committed} successful, ${errors} failed`,
    undefined,
    'GameTick'
  );

  return { committed, errors };
}

/**
 * Publish question reveals to blockchain oracle
 */
export async function publishOracleReveals(
  questions: Array<{ id: string; outcome: boolean }>
): Promise<{ revealed: number; errors: number }> {
  let revealed = 0;
  let errors = 0;

  // Check if oracle is configured
  if (
    !process.env.NEXT_PUBLIC_BABYLON_ORACLE ||
    !process.env.ORACLE_PRIVATE_KEY
  ) {
    logger.info(
      'Oracle not configured, skipping reveals',
      undefined,
      'GameTick'
    );
    return { revealed: 0, errors: 0 };
  }

  const oracleService = getOracleService();

  // Health check
  const health = await oracleService.healthCheck();
  if (!health.healthy) {
    logger.error(
      `Oracle health check failed: ${health.error}`,
      undefined,
      'GameTick'
    );
    return { revealed: 0, errors: questions.length };
  }

  // Batch reveal games
  const batch = questions.map((q) => ({
    questionId: q.id,
    outcome: q.outcome,
    winners: [], // Could get from positions
    totalPayout: BigInt(0), // Could calculate from positions
  }));

  const result = await oracleService.batchRevealGames(batch);

  // Update questions with oracle data
  for (const success of result.successful) {
    await db
      .update(questionsSchema)
      .set({
        oracleRevealTxHash: success.txHash,
        oracleRevealBlock: success.blockNumber || null,
        oraclePublishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questionsSchema.id, success.questionId));
    revealed++;
  }

  errors = result.failed.length;

  if (errors > 0) {
    logger.warn(
      `${errors} oracle reveals failed`,
      { failures: result.failed },
      'GameTick'
    );
  }

  logger.info(
    `Oracle reveals: ${revealed} successful, ${errors} failed`,
    undefined,
    'GameTick'
  );

  return { revealed, errors };
}
/**
 * Update widget caches
 * This pre-generates and caches widget data to improve performance
 */
async function updateWidgetCaches(): Promise<number> {
  let cachesUpdated = 0;

  // Get static organization data from registry
  const staticOrgs = StaticDataRegistry.getAllOrganizations();
  // Get dynamic price data from database
  const orgStates = await dbService().getAllOrganizationStates();
  const priceMap = new Map(orgStates.map((s) => [s.id, s.currentPrice]));

  // Combine static and dynamic data - filter to companies only
  const companies = staticOrgs
    .filter((org) => org.type === 'company')
    .map((org) => ({
      id: org.id,
      name: org.name,
      initialPrice: org.initialPrice,
      currentPrice: priceMap.get(org.id) ?? org.initialPrice,
    }));

  if (!companies || companies.length === 0) {
    logger.warn('No companies found for widget cache update', {}, 'GameTick');
    return 0;
  }

  const perpMarketsWithStats = await Promise.all(
    companies
      .filter(
        (company: (typeof companies)[number]) =>
          company && company.id && company.name
      )
      .map(async (company: (typeof companies)[number]) => {
        const currentPrice =
          company.currentPrice || company.initialPrice || 100;

        const priceHistory = await dbService().getPriceHistory(
          company.id,
          1440
        );

        let changePercent24h = 0;

        if (priceHistory && priceHistory.length > 0) {
          const price24hAgo = priceHistory[priceHistory.length - 1];
          if (price24hAgo && price24hAgo.price) {
            const change24h = currentPrice - price24hAgo.price;
            changePercent24h = (change24h / price24hAgo.price) * 100;
          }
        }

        return {
          ticker: company.id.toUpperCase().replace(/-/g, ''),
          organizationId: company.id,
          name: company.name || 'Unknown Company',
          currentPrice,
          changePercent24h,
          volume24h: 0,
        };
      })
  );

  const topPerpGainers = perpMarketsWithStats
    .sort(
      (
        a: (typeof perpMarketsWithStats)[number],
        b: (typeof perpMarketsWithStats)[number]
      ) => Math.abs(b.changePercent24h) - Math.abs(a.changePercent24h)
    )
    .slice(0, 3);

  // 2. Get top 3 pool gainers
  const poolsList = await db
    .select({
      id: pools.id,
      name: pools.name,
      npcActorId: pools.npcActorId,
      totalDeposits: pools.totalDeposits,
      totalValue: pools.totalValue,
    })
    .from(pools)
    .where(eq(pools.isActive, true))
    .orderBy(desc(pools.totalValue));

  // Get actor names for pools from STATIC REGISTRY (no DB call!)
  const poolActorIds = poolsList.map((p) => p.npcActorId).filter(Boolean);
  const poolActorMap = new Map<string, string>();
  for (const actorId of poolActorIds) {
    const actor = StaticDataRegistry.getActor(actorId);
    if (actor) {
      poolActorMap.set(actorId, actor.name);
    }
  }

  const poolsWithReturn = poolsList
    .filter((pool: (typeof poolsList)[number]) => pool && pool.id && pool.name) // Filter out invalid pools
    .map((pool: (typeof poolsList)[number]) => {
      const totalDeposits = Number.parseFloat(
        pool.totalDeposits?.toString() ?? '0'
      );
      const totalValue = Number.parseFloat(pool.totalValue?.toString() ?? '0');
      const totalReturn =
        totalDeposits > 0
          ? ((totalValue - totalDeposits) / totalDeposits) * 100
          : 0;

      // Extract Actor name
      const npcActorName = pool.npcActorId
        ? poolActorMap.get(pool.npcActorId) || 'Unknown'
        : 'Unknown';

      return {
        id: pool.id,
        name: pool.name,
        npcActorName,
        totalReturn,
        totalValue,
      };
    });

  const topPoolGainers = poolsWithReturn
    .sort(
      (
        a: (typeof poolsWithReturn)[number],
        b: (typeof poolsWithReturn)[number]
      ) => b.totalReturn - a.totalReturn
    )
    .slice(0, 3);

  // 3. Get top 3 questions by time-weighted volume
  const activeMarketsList = await db
    .select({
      id: marketsSchema.id,
      question: marketsSchema.question,
      yesShares: marketsSchema.yesShares,
      noShares: marketsSchema.noShares,
      createdAt: marketsSchema.createdAt,
    })
    .from(marketsSchema)
    .where(
      and(
        eq(marketsSchema.resolved, false),
        gte(marketsSchema.endDate, new Date())
      )
    );

  const marketsWithTimeWeightedVolume = activeMarketsList.map(
    (market: (typeof activeMarketsList)[number]) => {
      const yesShares = market.yesShares ? Number(market.yesShares) : 0;
      const noShares = market.noShares ? Number(market.noShares) : 0;
      const totalShares = yesShares + noShares;
      const totalVolume = totalShares * 0.5;

      const ageInHours =
        (Date.now() - market.createdAt.getTime()) / (1000 * 60 * 60);
      const timeWeight =
        ageInHours < 24
          ? 2.0
          : Math.max(1.0, 2.0 - (ageInHours - 24) / (6 * 24));

      const timeWeightedScore = totalVolume * timeWeight;

      const yesPrice = totalShares > 0 ? yesShares / totalShares : 0.5;

      return {
        id: market.id, // Keep as Snowflake string, don't convert to int
        text: market.question || 'Unknown Question',
        totalVolume,
        yesPrice,
        timeWeightedScore,
      };
    }
  );

  const topVolumeQuestions = marketsWithTimeWeightedVolume
    .sort(
      (
        a: (typeof marketsWithTimeWeightedVolume)[number],
        b: (typeof marketsWithTimeWeightedVolume)[number]
      ) => b.timeWeightedScore - a.timeWeightedScore
    )
    .slice(0, 3);

  // Update cache
  const cacheData = {
    topPerpGainers,
    topPoolGainers,
    topVolumeQuestions,
    lastUpdated: new Date().toISOString(),
  };

  // Check if widget cache entry exists
  const [existingCache] = await db
    .select({ widget: widgetCaches.widget })
    .from(widgetCaches)
    .where(eq(widgetCaches.widget, 'markets'))
    .limit(1);

  if (existingCache) {
    await db
      .update(widgetCaches)
      .set({
        data: cacheData as JsonValue,
        updatedAt: new Date(),
      })
      .where(eq(widgetCaches.widget, 'markets'));
  } else {
    await db.insert(widgetCaches).values({
      widget: 'markets',
      data: cacheData as JsonValue,
      updatedAt: new Date(),
    });
  }

  cachesUpdated++;
  logger.info('Updated markets widget cache', {}, 'GameTick');

  return cachesUpdated;
}

/**
 * Force trending calculation (for first tick with baseline posts)
 * Waits a few seconds for tags to be generated from posts, then calculates trending
 */
async function forceTrendingCalculation(): Promise<boolean> {
  logger.info('Forcing trending calculation (first tick)', {}, 'GameTick');

  // Wait 3 seconds for tag generation to complete (tags are generated async)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Call trending calculation directly (already imported at top of file)
  await calculateTrendingTags();

  logger.info('Forced trending calculation complete', {}, 'GameTick');
  return true;
}

// World facts update interval (configurable, default 8 hours - runs ~3 times per game day)
const DEFAULT_WORLD_FACTS_UPDATE_INTERVAL_HOURS = 8;
const parsedIntervalHours = Number(
  process.env.WORLD_FACTS_UPDATE_INTERVAL_HOURS
);
const WORLD_FACTS_UPDATE_INTERVAL_MS =
  (Number.isFinite(parsedIntervalHours) && parsedIntervalHours > 0
    ? parsedIntervalHours
    : DEFAULT_WORLD_FACTS_UPDATE_INTERVAL_HOURS) *
  60 *
  60 *
  1000;

// Lock configuration for world facts generation
// Default 30 minutes to handle slow LLM responses; configurable via env
const WORLD_FACTS_LOCK_ID = 'world-facts-generation';
const DEFAULT_WORLD_FACTS_LOCK_DURATION_MINUTES = 30;
const parsedLockDuration = Number(
  process.env.WORLD_FACTS_LOCK_DURATION_MINUTES
);
const WORLD_FACTS_LOCK_DURATION_MS =
  (Number.isFinite(parsedLockDuration) && parsedLockDuration > 0
    ? parsedLockDuration
    : DEFAULT_WORLD_FACTS_LOCK_DURATION_MINUTES) *
  60 *
  1000;
// Renew lock at half the TTL (minimum 1 minute) to prevent expiry during long-running generation
const MIN_LOCK_RENEWAL_INTERVAL_MS = 60 * 1000; // 1 minute minimum
const WORLD_FACTS_LOCK_RENEWAL_INTERVAL_MS = Math.max(
  MIN_LOCK_RENEWAL_INTERVAL_MS,
  Math.floor(WORLD_FACTS_LOCK_DURATION_MS / 2)
);

/**
 * Check if we should update world facts
 * Uses the most recent auto-generated world fact's createdAt timestamp
 * This ensures game tick and cron don't conflict - they track independently
 */
async function shouldUpdateWorldFacts(): Promise<boolean> {
  // Check when world facts from game activity were last generated
  // Using 'auto-generated' source to track game activity facts specifically
  const [lastAutoFact] = await db
    .select({ createdAt: worldFacts.createdAt })
    .from(worldFacts)
    .where(eq(worldFacts.source, 'auto-generated'))
    .orderBy(desc(worldFacts.createdAt))
    .limit(1);

  if (!lastAutoFact || !lastAutoFact.createdAt) {
    logger.info(
      'No auto-generated world facts found, triggering initial generation',
      undefined,
      'GameTick'
    );
    return true; // Never generated before
  }

  const timeSinceLastGeneration = Date.now() - lastAutoFact.createdAt.getTime();
  const shouldUpdate =
    timeSinceLastGeneration >= WORLD_FACTS_UPDATE_INTERVAL_MS;

  if (shouldUpdate) {
    logger.info(
      'World facts generation triggered',
      {
        hoursSinceLastGeneration: Math.round(
          timeSinceLastGeneration / (60 * 60 * 1000)
        ),
        thresholdHours: WORLD_FACTS_UPDATE_INTERVAL_MS / (60 * 60 * 1000),
      },
      'GameTick'
    );
  }

  return shouldUpdate;
}

/**
 * Updates world facts if 8+ hours since last update.
 * Uses distributed locking to prevent concurrent generation across multiple processes.
 * Inserts a last-run marker to prevent re-triggers when generation produces no facts.
 */
export async function updateWorldFactsIfNeeded(): Promise<{
  updated: boolean;
  stats?: {
    feedsFetched: number;
    newHeadlines: number;
    parodiesGenerated: number;
    headlinesCleaned: number;
    worldFactsGenerated: number;
    worldFactsArchived: number;
  };
}> {
  // Check if update is needed BEFORE acquiring lock to reduce database usage
  // This avoids lock acquire/release overhead on most ticks (updates only every ~8 hours)
  const shouldUpdate = await shouldUpdateWorldFacts();
  if (!shouldUpdate) {
    logger.debug('World facts update not needed yet', undefined, 'GameTick');
    return { updated: false };
  }

  // Generate a unique process ID for this run
  const processId = `game-tick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Acquire distributed lock to prevent concurrent generation
  const lockAcquired = await DistributedLockService.acquireLock({
    lockId: WORLD_FACTS_LOCK_ID,
    durationMs: WORLD_FACTS_LOCK_DURATION_MS,
    operation: 'world-facts-generation',
    processId,
  });

  if (!lockAcquired) {
    logger.debug(
      'World facts generation lock held by another process, skipping',
      {
        processId,
        lockId: WORLD_FACTS_LOCK_ID,
        lockDurationMs: WORLD_FACTS_LOCK_DURATION_MS,
      },
      'GameTick'
    );
    return { updated: false };
  }

  logger.debug(
    'Acquired world facts generation lock',
    {
      processId,
      lockId: WORLD_FACTS_LOCK_ID,
      lockDurationMs: WORLD_FACTS_LOCK_DURATION_MS,
    },
    'GameTick'
  );

  // Set up periodic lock renewal to prevent expiry during long-running generation
  let lockRenewalInterval: ReturnType<typeof setInterval> | null = null;
  const startLockRenewal = () => {
    lockRenewalInterval = setInterval(async () => {
      try {
        const renewed = await DistributedLockService.acquireLock({
          lockId: WORLD_FACTS_LOCK_ID,
          durationMs: WORLD_FACTS_LOCK_DURATION_MS,
          operation: 'world-facts-generation-renewal',
          processId,
        });
        if (renewed) {
          logger.debug('World facts lock renewed', undefined, 'GameTick');
        } else {
          logger.warn(
            'Failed to renew world facts lock - another process may have acquired it',
            undefined,
            'GameTick'
          );
        }
      } catch (error) {
        logger.warn('Error renewing world facts lock', { error }, 'GameTick');
      }
    }, WORLD_FACTS_LOCK_RENEWAL_INTERVAL_MS);
  };

  try {
    startLockRenewal();

    // Re-check after acquiring lock to handle race condition where another process
    // completed the update between our initial check and lock acquisition
    const stillNeedsUpdate = await shouldUpdateWorldFacts();
    if (!stillNeedsUpdate) {
      logger.debug(
        'World facts update no longer needed (another process completed it)',
        undefined,
        'GameTick'
      );
      return { updated: false };
    }

    logger.info(
      '🌍 Starting world facts update from game tick',
      undefined,
      'GameTick'
    );

    const startTime = Date.now();

    // Steps 1-3: RSS/parody pipeline - wrapped in try/catch so failures don't abort the whole tick
    let feedResult = { fetched: 0, stored: 0, errors: 0 };
    let parodies: Awaited<
      ReturnType<
        ReturnType<typeof createParodyHeadlineGenerator>['processHeadlines']
      >
    > = [];
    let cleaned = 0;

    try {
      // Step 1: Fetch all RSS feeds
      logger.info('Fetching RSS feeds...', undefined, 'GameTick');
      feedResult = await rssFeedService.fetchAllFeeds();
      logger.info(
        `RSS feeds fetched: ${feedResult.fetched} sources, ${feedResult.stored} new headlines, ${feedResult.errors} errors`,
        feedResult,
        'GameTick'
      );

      // Step 2: Transform untransformed headlines into parodies
      logger.info('Generating parody headlines...', undefined, 'GameTick');
      const untransformedHeadlines =
        await rssFeedService.getUntransformedHeadlines(20); // Process 20 at a time

      const generator = createParodyHeadlineGenerator();
      parodies = await generator.processHeadlines(untransformedHeadlines);
      logger.info(
        `Generated ${parodies.length} parody headlines`,
        { count: parodies.length },
        'GameTick'
      );

      // Step 3: Clean up old headlines (older than 7 days)
      logger.info('Cleaning up old headlines...', undefined, 'GameTick');
      cleaned = await rssFeedService.cleanupOldHeadlines();
      logger.info(
        `Cleaned up ${cleaned} old headlines`,
        { count: cleaned },
        'GameTick'
      );
    } catch (error) {
      logger.error(
        'Error in RSS/parody pipeline, aborting world facts update',
        { error },
        'GameTick'
      );
      return { updated: false };
    }

    // Step 4: Generate new world facts from game activity (events, markets, questions, actors)
    // This is critical for keeping the world narrative fresh and dynamic
    logger.info(
      'Generating new world facts from game activity...',
      undefined,
      'GameTick'
    );
    let factsResult = {
      generated: 0,
      archived: 0,
      sources: { events: 0, markets: 0, questions: 0, actors: 0 },
    };
    let factsGenerationSucceeded = false;
    try {
      factsResult = await worldFactsGenerator.generateNewWorldFacts();
      factsGenerationSucceeded = true;
      logger.info(
        `Generated ${factsResult.generated} new world facts, archived ${factsResult.archived}`,
        factsResult,
        'GameTick'
      );
    } catch (error) {
      logger.error(
        'Error generating world facts from game activity',
        { error },
        'GameTick'
      );
      // Don't set factsGenerationSucceeded - marker will be skipped so retries aren't delayed
    }

    // Step 5: Insert last-run marker to prevent re-triggers when generation produces 0 facts
    // Only insert marker on successful runs - failed runs should allow immediate retry
    if (factsGenerationSucceeded) {
      let markerId: string | undefined;
      try {
        const now = new Date();
        markerId = await generateSnowflakeId();
        await db.insert(worldFacts).values({
          id: markerId,
          category: 'system',
          key: 'generation-marker',
          label: 'World Facts Generation Marker',
          value: `Generation run at ${now.toISOString()} - ${factsResult.generated} facts created`,
          source: 'auto-generated',
          lastUpdated: now,
          isActive: false, // Marker, not shown in prompts
          priority: -1,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        logger.error(
          'Error inserting generation-marker world fact',
          { error, markerId, factsGenerated: factsResult.generated },
          'GameTick'
        );
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      '✅ World facts update completed',
      {
        duration: `${duration}ms`,
        feedsFetched: feedResult.fetched,
        newHeadlines: feedResult.stored,
        parodiesGenerated: parodies.length,
        headlinesCleaned: cleaned,
        worldFactsGenerated: factsResult.generated,
        worldFactsArchived: factsResult.archived,
      },
      'GameTick'
    );

    return {
      updated: true,
      stats: {
        feedsFetched: feedResult.fetched,
        newHeadlines: feedResult.stored,
        parodiesGenerated: parodies.length,
        headlinesCleaned: cleaned,
        worldFactsGenerated: factsResult.generated,
        worldFactsArchived: factsResult.archived,
      },
    };
  } finally {
    // Stop lock renewal
    if (lockRenewalInterval) {
      clearInterval(lockRenewalInterval);
    }
    // Always release lock, even on error
    await DistributedLockService.releaseLock(WORLD_FACTS_LOCK_ID, processId);
  }
}

// ============================================================================
// MARKET VOLATILITY SIMULATION
// ============================================================================

/**
 * Market volatility state for realistic price movements.
 * Tracks recent volatility and momentum per market for clustering effects.
 */
const marketVolatilityState = new Map<
  string,
  {
    recentVolatility: number;
    momentum: number;
    lastMove: number;
  }
>();

/**
 * Simulates natural market volatility for all perp markets.
 *
 * This creates realistic price movements independent of user/NPC trades:
 * - Volatility clustering (volatile periods follow volatile periods)
 * - Fat tails (occasional large moves)
 * - Random jumps (sudden price gaps)
 * - Momentum (trends persist slightly)
 * - Asymmetry (crashes faster than rallies)
 *
 * Called every game tick (~1 minute) to keep markets "alive".
 */
export async function simulateMarketVolatility(): Promise<number> {
  try {
    // Get all active perp market snapshots
    const markets = await db
      .select({
        ticker: perpMarketSnapshots.ticker,
        organizationId: perpMarketSnapshots.organizationId,
        currentPrice: perpMarketSnapshots.currentPrice,
      })
      .from(perpMarketSnapshots);

    if (markets.length === 0) {
      return 0;
    }

    // Get organization base prices for bounds (do not depend on the legacy Organization table)
    const orgIds = [...new Set(markets.map((m) => m.organizationId))];
    const orgStates = await db
      .select({
        id: organizationState.id,
        basePrice: organizationState.basePrice,
      })
      .from(organizationState)
      .where(inArray(organizationState.id, orgIds));

    const basePriceByOrgId = new Map(
      orgStates.map((o) => [o.id, Number(o.basePrice ?? 100)])
    );

    let updatedCount = 0;
    const priceUpdates: Array<{
      organizationId: string;
      ticker: string;
      newPrice: number;
    }> = [];

    for (const market of markets) {
      const currentPrice = Number(market.currentPrice);
      const basePrice = basePriceByOrgId.get(market.organizationId);
      const initialPrice =
        typeof basePrice === 'number' &&
        Number.isFinite(basePrice) &&
        basePrice > 0
          ? basePrice
          : currentPrice;

      // Get or initialize volatility state for this market
      let state = marketVolatilityState.get(market.ticker);
      if (!state) {
        state = {
          recentVolatility: 0.003, // Start with 0.3% base volatility
          momentum: 0,
          lastMove: 0,
        };
        marketVolatilityState.set(market.ticker, state);
      }

      // Calculate price move
      const move = generateVolatilityMove(state, initialPrice, currentPrice);

      // Apply move
      const newPrice = currentPrice * (1 + move);

      // Apply absolute bounds (25% - 400% of initial)
      const minPrice = initialPrice * PERP_MARKET_CONFIG.PRICE_FLOOR_RATIO;
      const maxPrice = initialPrice * PERP_MARKET_CONFIG.PRICE_CEILING_RATIO;
      const clampedPrice = Math.max(minPrice, Math.min(newPrice, maxPrice));

      // Update state for next tick
      state.lastMove = move;
      state.momentum = move * 0.3; // 30% momentum carries forward
      // Volatility clustering: if big move, stay volatile
      state.recentVolatility =
        state.recentVolatility * 0.8 + Math.abs(move) * 0.2;

      // Only update if price changed meaningfully (> 0.01%)
      if (Math.abs(clampedPrice - currentPrice) / currentPrice > 0.0001) {
        priceUpdates.push({
          organizationId: market.organizationId,
          ticker: market.ticker,
          newPrice: clampedPrice,
        });
        updatedCount++;
      }
    }

    // Apply all price updates
    if (priceUpdates.length > 0) {
      // Update perpMarketSnapshots
      // Note: Don't update change24h/changePercent24h here - those should reflect
      // true 24h deltas calculated elsewhere using price24hAgo reference
      for (const update of priceUpdates) {
        await db
          .update(perpMarketSnapshots)
          .set({
            currentPrice: update.newPrice,
            updatedAt: new Date(),
          })
          .where(eq(perpMarketSnapshots.ticker, update.ticker));
      }

      // Update organizations and broadcast via PriceUpdateService
      await PriceUpdateService.applyUpdates(
        priceUpdates.map((u) => ({
          organizationId: u.organizationId,
          newPrice: u.newPrice,
          source: 'volatility_simulation',
          reason: 'Simulated market volatility',
          metadata: { ticker: u.ticker },
        }))
      );

      logger.info(
        `Simulated volatility for ${updatedCount} markets`,
        {
          updatedCount,
          samples: priceUpdates.slice(0, 3).map((u) => ({
            ticker: u.ticker,
            newPrice: u.newPrice.toFixed(2),
          })),
        },
        'MarketVolatility'
      );
    }

    return updatedCount;
  } catch (error) {
    logger.error(
      'Failed to simulate market volatility',
      { error: error instanceof Error ? error.message : String(error) },
      'MarketVolatility'
    );
    return 0;
  }
}

/**
 * Generates a realistic price movement with fat tails and volatility clustering.
 */
function generateVolatilityMove(
  state: { recentVolatility: number; momentum: number; lastMove: number },
  initialPrice: number,
  currentPrice: number
): number {
  // Base volatility with clustering effect
  const baseVolatility = state.recentVolatility;
  const volatilityMultiplier = 0.5 + Math.random(); // 0.5x to 1.5x
  const currentVolatility = baseVolatility * volatilityMultiplier;

  // Generate move with fat tails
  let move: number;
  const fatTailChance = Math.random();

  if (fatTailChance < 0.01) {
    // 1% chance: LARGE jump (3-6x normal volatility)
    const direction = Math.random() > 0.5 ? 1 : -1;
    move = direction * currentVolatility * (3 + Math.random() * 3);
  } else if (fatTailChance < 0.05) {
    // 4% chance: Notable move (2-3x normal)
    move = (Math.random() - 0.5) * 2 * currentVolatility * (2 + Math.random());
  } else if (fatTailChance < 0.15) {
    // 10% chance: Above average move (1.5-2x normal)
    move =
      (Math.random() - 0.5) *
      2 *
      currentVolatility *
      (1.5 + Math.random() * 0.5);
  } else {
    // 85% chance: Normal move
    move = (Math.random() - 0.5) * 2 * currentVolatility;
  }

  // Add momentum (trend continuation)
  move += state.momentum * (0.5 + Math.random() * 0.5);

  // Mean reversion - slight pull toward initial price
  const priceRatio = currentPrice / initialPrice;
  if (priceRatio > 1.5) {
    // If price is >150% of initial, slight downward pressure
    move -= 0.001 * (priceRatio - 1);
  } else if (priceRatio < 0.7) {
    // If price is <70% of initial, slight upward pressure
    move += 0.001 * (1 - priceRatio);
  }

  // Asymmetry: crashes are 20% faster than rallies
  if (move < 0) {
    move *= 1.2;
  }

  // Cap individual tick move at 5% (but still allow through fat tail distribution)
  const maxMove = 0.05;
  return Math.max(-maxMove, Math.min(move, maxMove));
}

/**
 * Process narrative arcs for active questions.
 * Each question can have an arc that progresses through phases based on game day.
 * Arc events now create world events and can trigger article generation.
 *
 * @param activeQuestions - Questions with active arcs to process
 * @param dayNumber - Current game day number
 * @param llmClient - LLM client for generating articles on significant events
 */
async function processNarrativeArcs(
  activeQuestions: Array<{ id: string }>,
  dayNumber: number,
  llmClient: BabylonLLMClient
): Promise<{
  arcsProcessed: number;
  transitioned: number;
  eventsGenerated: number;
}> {
  // arcStates is now statically imported at the top of the file

  let arcsProcessed = 0;
  let transitioned = 0;
  let eventsGenerated = 0;

  // Batch fetch all existing arc states in one query to reduce DB round-trips
  const questionIds = activeQuestions.map((q) => q.id);
  const existingArcsList =
    questionIds.length > 0
      ? await db
          .select({ id: arcStates.id, questionId: arcStates.questionId })
          .from(arcStates)
          .where(inArray(arcStates.questionId, questionIds))
      : [];

  // Build a map of questionId -> arcState for O(1) lookup
  const arcStateByQuestionId = new Map<string, { id: string }>();
  for (const arc of existingArcsList) {
    arcStateByQuestionId.set(arc.questionId, { id: arc.id });
  }

  for (const question of activeQuestions) {
    try {
      // Look up existing arc from preloaded map
      const existingArc = arcStateByQuestionId.get(question.id);

      let arcId: string;
      if (!existingArc) {
        // Create arc state for this question
        arcId = await createArcState(question.id);
      } else {
        arcId = existingArc.id;
      }

      // Process the arc tick, passing LLM client for article generation
      const result = await processArcTick(arcId, dayNumber, llmClient);
      arcsProcessed++;

      if (result.transitioned) {
        transitioned++;
      }
      if (result.eventGenerated) {
        eventsGenerated++;
      }
    } catch (error) {
      logger.error(
        `Failed to process narrative arc for question ${question.id}`,
        { error: error instanceof Error ? error.message : String(error) },
        'GameTick'
      );
    }
  }

  return {
    arcsProcessed,
    transitioned,
    eventsGenerated,
  };
}

/**
 * Game tick - executes one canonical unit of game progression.
 * Used for both realtime (cron) and simulation modes.
 * Handles content generation, market decisions, question resolution, and system updates.
 */

import {
  actorRelationships,
  actors,
  and,
  asc,
  count,
  Decimal,
  db,
  getDbInstance as dbService,
  desc,
  eq,
  games,
  gte,
  inArray,
  isNotNull,
  isNull,
  type JsonValue,
  lte,
  markets as marketsSchema,
  ne,
  organizations,
  poolPositions,
  pools,
  positions,
  posts,
  postTags,
  questions as questionsSchema,
  rssHeadlines,
  tags,
  trendingTags,
  widgetCaches,
  worldEvents,
} from '@babylon/db';
import {
  DIAMOND_ADDRESS,
  generateSnowflakeId,
  getCurrentRpcUrl,
  logger,
  PREDICTION_MARKET_ABI,
  REPUTATION_SYSTEM_BASE_SEPOLIA,
} from '@babylon/shared';
import { ArticleGenerator } from './ArticleGenerator';
import { loadActorsData } from './actors-loader';
import { BabylonLLMClient } from './llm/openai-client';
import { MarketDecisionEngine } from './MarketDecisionEngine';
import { NPCInvestmentManager } from './npc/npc-investment-manager';
import { PredictionPricing } from './prediction-pricing';
import { generateWorldContext } from './prompts';
import { QuestionManager } from './QuestionManager';
import { RelationshipEvolutionEngine } from './RelationshipEvolutionEngine';
import { AlphaGroupInviteService } from './services/alpha-group-invite-service';
import { characterMappingService } from './services/character-mapping-service';
// Content generation helpers
import { generateEvents } from './services/event-generation-helpers';
import { MarketContextService } from './services/market-context-service';
import { NPCGroupDynamicsService } from './services/npc-group-dynamics-service';
import { getOracleService } from './services/oracle/oracle-service';
import { createParodyHeadlineGenerator } from './services/parody-headline-generator';
import {
  type DiscourseActor,
  generateNPCPost,
  generateNPCRepliesFromPreviousTicks,
  generateOrgArticle,
  generateOrgPost,
} from './services/post-generation-helpers';
import { PredictionMarketService } from './services/prediction-market-service';
import { PriceUpdateService } from './services/price-update-service';
import {
  ReputationService,
  syncReputationIfAvailable,
} from './services/reputation-service';
import { rssFeedService } from './services/rss-feed-service';
// Migrated services - local imports
import { invalidateAfterPredictionTrade } from './services/trade-cache-invalidation';
import { TradeExecutionService } from './services/trade-execution-service';
import {
  calculateTrendingIfNeeded,
  calculateTrendingTags,
} from './services/trending-calculation-service';
import { WalletService } from './services/wallet-service';
import type { TradingExecutionResult } from './types/market-decisions';
import type {
  ActorTier,
  DayTimeline,
  Organization,
  Question,
  SelectedActor,
  WorldEvent,
} from './types/shared';
import { worldFactsService } from './world-facts-service';

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
  };
  relationshipsUpdated?: number;
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

  logger.info(
    'Executing game tick',
    { timestamp: timestamp.toISOString() },
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

    // Load required data for proof generation
    const actorsData = loadActorsData();
    // Map ActorData to SelectedActor, ensuring required fields are present
    const allActors: SelectedActor[] = actorsData.actors
      .filter((actor) => actor.tier !== undefined)
      .map((actor) => ({
        ...actor,
        tier: actor.tier!,
        role: actor.role ?? 'unknown',
        initialLuck: actor.initialLuck ?? 'medium',
        initialMood: actor.initialMood ?? 0,
      }));
    const organizations = actorsData.organizations;

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

    // Resolve payouts
    // Question status is updated atomically within resolveQuestionPayouts
    for (const question of questionsToResolve) {
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

      const { description, proof } =
        await questionManager.generateResolutionWithProof(
          questionForManager,
          allActors,
          organizations,
          recentTimelines
        );

      // Save proof article if exists
      if (proof && proof.type === 'article') {
        // Create article in database
        await db.insert(posts).values({
          id: proof.article.id,
          type: 'article',
          content: proof.article.summary, // Use summary for content preview
          fullContent: proof.article.content,
          articleTitle: proof.article.title,
          authorId: proof.article.authorOrgId,
          gameId: 'continuous',
          timestamp: new Date(),
          category: proof.article.category,
          sentiment: proof.article.sentiment,
          slant: proof.article.slant,
          biasScore: proof.article.biasScore,
        });

        // Update question with proof URL
        await db
          .update(questionsSchema)
          .set({
            resolutionDescription: description,
            resolutionProofUrl: proof.url,
            updatedAt: new Date(),
          })
          .where(eq(questionsSchema.id, question.id));

        logger.info(
          `Generated resolution proof for Q${question.questionNumber}`,
          {
            proofUrl: proof.url,
            articleId: proof.article.id,
          },
          'GameTick'
        );
      }

      await resolveQuestionPayouts(question.questionNumber);
      result.questionsResolved++;
    }

    // Publish reveals to blockchain oracle
    const oracleResult = await publishOracleReveals(questionsToResolve);
    result.oracleReveals += oracleResult.revealed;
    result.oracleErrors += oracleResult.errors;
  }

  // Combined post and article generation to mix NPCs and orgs
  // Skip if buffer is sufficient (content generation handled by lookahead service)
  if (!skipContentGeneration) {
    if (Date.now() < criticalOpsDeadline) {
      const { posts, articles } = await generateMixedPosts(
        currentActiveQuestions.slice(0, 3),
        timestamp,
        llmClient,
        criticalOpsDeadline
      );
      result.postsCreated = posts;
      result.articlesCreated = articles;
    } else {
      logger.warn(
        'Skipping post generation – tick budget exceeded',
        { budgetMs },
        'GameTick'
      );
    }

    const eventsGenerated = await generateEvents(
      currentActiveQuestions.slice(0, 3),
      timestamp
    );
    result.eventsCreated = eventsGenerated;

    // Generate NPC-to-NPC public discourse (replies to previous tick posts)
    // This runs in parallel since replies don't depend on posts from this tick
    if (Date.now() < criticalOpsDeadline) {
      const discourseActorsData = loadActorsData();
      const discourseWorldFacts =
        await worldFactsService.generatePromptContext();

      if (discourseActorsData.actors.length >= 2) {
        // Map to DiscourseActor type (only fields needed for reply generation)
        const allActorsForDiscourse: DiscourseActor[] =
          discourseActorsData.actors.map((actor) => ({
            id: actor.id,
            name: actor.name,
            description: actor.description,
            personality: actor.personality,
            postStyle: actor.postStyle,
            postExample: actor.postExample || [],
          }));

        const npcRepliesCreated = await generateNPCRepliesFromPreviousTicks(
          llmClient,
          allActorsForDiscourse,
          discourseWorldFacts,
          timestamp,
          4 // Generate up to 4 NPC replies per tick
        );

        result.discourseReplies = npcRepliesCreated;

        if (npcRepliesCreated > 0) {
          logger.info(
            `NPC discourse: ${npcRepliesCreated} replies to previous tick posts`,
            { npcRepliesCreated },
            'GameTick'
          );
        }
      }
    }
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

  // Generate articles AFTER market decisions (lower priority, but parallelized)
  // Skip if buffer is sufficient (content generation handled by lookahead service)
  if (!skipContentGeneration) {
    if (Date.now() < deadline) {
      const articlesGenerated = await generateArticles(
        timestamp,
        llmClient,
        deadline
      );
      result.articlesCreated += articlesGenerated; // Add to existing count from mixed posts
    } else {
      logger.warn(
        'Skipping article generation – tick budget exceeded',
        { budgetMs },
        'GameTick'
      );
    }
  }

  const currentActiveCount =
    currentActiveQuestions.length - result.questionsResolved;
  if (currentActiveCount < 10) {
    if (Date.now() < deadline) {
      const questionsGenerated = await generateNewQuestions(
        Math.min(3, 15 - currentActiveCount),
        llmClient,
        deadline
      );
      result.questionsCreated = questionsGenerated;
    } else {
      logger.warn(
        'Skipping question generation – tick budget exceeded',
        { budgetMs },
        'GameTick'
      );
    }
  }

  await db
    .update(games)
    .set({
      lastTickAt: timestamp,
      updatedAt: timestamp,
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
  }

  // Process NPC group dynamics (form, join, leave, post, invite, kick)
  const dynamics = await NPCGroupDynamicsService.processTickDynamics();
  result.npcGroupDynamics = {
    groupsCreated: dynamics.groupsCreated,
    membersAdded: dynamics.membersAdded,
    membersRemoved: dynamics.membersRemoved,
    usersInvited: dynamics.usersInvited,
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

  // Get all actors and organizations
  const [actorsResult, orgsResult] = await Promise.all([
    db.select().from(actors),
    db.select().from(organizations),
  ]);

  // Convert to Actor type
  const actorData = actorsResult.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description || undefined,
    domain: a.domain,
    personality: a.personality || undefined,
    affiliations: a.affiliations,
  }));

  const orgData = orgsResult.map((o) => ({
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

    // Create trending entry
    const score = (sampleTags.length - i) * 10 + Math.random() * 5;

    await db.insert(trendingTags).values({
      id: await generateSnowflakeId(),
      tagId: tag.id,
      score,
      postCount: Math.floor(Math.random() * 10) + 5,
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
 * Generate mixed posts from both NPCs and organizations (parallelized version)
 * This ensures posts are interleaved rather than chunked by type
 * Generates all posts in parallel for maximum throughput
 */
async function generateMixedPosts(
  questions: Array<{ id: string; text: string; questionNumber: number }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<{ posts: number; articles: number }> {
  const postsToGenerate = 8; // Mix of NPC posts and org articles

  if (questions.length === 0) {
    logger.warn('No questions available for post generation', {}, 'GameTick');
    return { posts: 0, articles: 0 };
  }

  // Get actors (NPCs), organizations, and world facts in parallel
  const [actorsList, orgsList, worldFactsContext] = await Promise.all([
    db.select().from(actors).orderBy(desc(actors.reputationPoints)).limit(15),
    db
      .select()
      .from(organizations)
      .where(eq(organizations.type, 'media'))
      .limit(5),
    worldFactsService.generatePromptContext(),
  ]);

  if (actorsList.length === 0 && orgsList.length === 0) {
    logger.warn(
      'No actors or organizations found for post generation',
      {},
      'GameTick'
    );
    return { posts: 0, articles: 0 };
  }

  // Create a mixed pool of content creators
  interface ContentCreator {
    id: string;
    name: string;
    type: 'actor' | 'organization';
    data: (typeof actorsList)[number] | (typeof orgsList)[number];
  }

  const creators: ContentCreator[] = [
    ...actorsList.map((actor: (typeof actorsList)[number]) => ({
      id: actor.id,
      name: actor.name,
      type: 'actor' as const,
      data: actor,
    })),
    ...orgsList.map((org: (typeof orgsList)[number]) => ({
      id: org.id,
      name: org.name || 'Unknown Org',
      type: 'organization' as const,
      data: org,
    })),
  ];

  // Shuffle to mix actors and orgs
  for (let i = creators.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [creators[i], creators[j]] = [creators[j]!, creators[i]!];
  }

  logger.info(
    `Generating ${postsToGenerate} mixed posts in parallel`,
    {
      actorsAvailable: actorsList.length,
      orgsAvailable: orgsList.length,
      creatorsPoolSize: creators.length,
    },
    'GameTick'
  );

  // Generate posts with timestamps spread across the tick interval (60 seconds)
  const tickDurationMs = 60000; // 1 minute
  const timeSlotMs = tickDurationMs / postsToGenerate;

  // Generate all posts in parallel
  const postPromises = Array.from(
    { length: Math.min(postsToGenerate, creators.length) },
    async (_, i) => {
      // Check deadline before starting
      if (Date.now() > deadlineMs) {
        logger.debug('Skipping post due to deadline', { index: i }, 'GameTick');
        return { posts: 0, articles: 0 };
      }

      const question = questions[i % questions.length];

      if (!question || !question.text) {
        logger.warn('Missing question data', { questionIndex: i }, 'GameTick');
        return { posts: 0, articles: 0 };
      }

      const creator = creators[i];
      if (!creator) {
        logger.warn('Missing creator data', { creatorIndex: i }, 'GameTick');
        return { posts: 0, articles: 0 };
      }

      // Calculate timestamp for this post (spread throughout the minute)
      const slotOffset = i * timeSlotMs;
      const randomJitter = Math.random() * timeSlotMs * 0.8;
      const timestampWithOffset = new Date(
        timestamp.getTime() + slotOffset + randomJitter
      );

      if (creator.type === 'actor') {
        const actor = creator.data as (typeof actorsList)[number];
        const success = await generateNPCPost(
          llm,
          actor,
          question,
          worldFactsContext,
          timestampWithOffset
        );
        return { posts: success ? 1 : 0, articles: 0 };
      }
      const org = creator.data as (typeof orgsList)[number];
      const shouldCreateArticle = Math.random() < 0.1;

      if (shouldCreateArticle) {
        const success = await generateOrgArticle(
          llm,
          org,
          question,
          worldFactsContext,
          timestampWithOffset
        );
        return { posts: success ? 1 : 0, articles: success ? 1 : 0 };
      }
      const success = await generateOrgPost(
        llm,
        org,
        question,
        worldFactsContext,
        timestampWithOffset
      );
      return { posts: success ? 1 : 0, articles: 0 };
    }
  );

  // Wait for all posts to complete
  const results = await Promise.allSettled(postPromises);

  // Aggregate results
  let postsCreated = 0;
  let articlesCreated = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      postsCreated += result.value.posts;
      articlesCreated += result.value.articles;
    }
  }

  logger.info(
    'Mixed post generation complete',
    {
      postsCreated,
      articlesCreated,
      actorsAvailable: actorsList.length,
      orgsAvailable: orgsList.length,
      attempted: postPromises.length,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    },
    'GameTick'
  );

  return { posts: postsCreated, articles: articlesCreated };
}

/**
 * Generates multiple articles concurrently to maximize throughput
 */
async function generateArticles(
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  // Get recent events (from last 2 hours, up to current time)
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const recentEvents = await db
    .select()
    .from(worldEvents)
    .where(
      and(
        gte(worldEvents.timestamp, twoHoursAgo),
        lte(worldEvents.timestamp, now), // ✅ No future events
        eq(worldEvents.visibility, 'public')
      )
    )
    .orderBy(desc(worldEvents.timestamp))
    .limit(10);

  // CRITICAL: Ensure each active question has 1-3 articles
  const questionArticlesCreated = await generateArticlesForActiveQuestions(
    llm,
    deadlineMs
  );

  // If no recent events, generate baseline articles about general topics
  if (recentEvents.length === 0) {
    logger.info(
      'No recent events - generating baseline articles in parallel',
      {},
      'GameTick'
    );
    const newsOrgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.type, 'media'))
      .limit(5);

    if (newsOrgs.length === 0) {
      logger.warn(
        'No news organizations found for baseline articles',
        {},
        'GameTick'
      );
      return questionArticlesCreated;
    }

    const baselineArticlesCreated = await generateBaselineArticlesParallel(
      newsOrgs,
      timestamp,
      llm,
      deadlineMs
    );
    return questionArticlesCreated + baselineArticlesCreated;
  }

  // Get news organizations and actors in parallel
  const [newsOrgs, actorsList] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.type, 'media')),
    db.select().from(actors).orderBy(asc(actors.tier)).limit(50),
  ]);

  if (newsOrgs.length === 0) {
    logger.warn(
      'No news organizations found for article generation',
      {},
      'GameTick'
    );
    return 0;
  }

  if (actorsList.length === 0) {
    logger.warn('No actors found for article generation', {}, 'GameTick');
    return 0;
  }

  // Initialize article generator
  const articleGen = new ArticleGenerator(llm);

  // Generate up to 10 articles in parallel (increased from 3)
  const articlesToGenerate = Math.min(10, recentEvents.length);
  const eventsTocover = recentEvents.slice(0, articlesToGenerate);

  logger.info(
    `Generating ${articlesToGenerate} articles in parallel`,
    {
      eventCount: recentEvents.length,
    },
    'GameTick'
  );

  // Map organization data for article generation
  const organizationsList: Organization[] = newsOrgs.map(
    (org: (typeof newsOrgs)[number]) => ({
      id: org.id,
      name: org.name || 'Unknown Organization',
      description: org.description || '',
      type: (org.type as 'company' | 'media' | 'government') || 'media',
      canBeInvolved: org.canBeInvolved,
      initialPrice: org.initialPrice ?? undefined,
      currentPrice: org.currentPrice ?? undefined,
    })
  );

  const actorList = actorsList
    .filter((a: (typeof actorsList)[number]) => a && a.id && a.name)
    .map((a: (typeof actorsList)[number]) => ({
      id: a.id,
      name: a.name,
      description: a.description || '',
      domain: a.domain || '',
      personality: a.personality || undefined,
      tier: (a.tier as ActorTier) || undefined,
      affiliations: a.affiliations || [],
      postStyle: a.postStyle || undefined,
      postExample: a.postExample || '',
      role: (a.role as 'main' | 'supporting' | 'extra') || undefined,
      initialLuck: (a.initialLuck as 'low' | 'medium' | 'high') || 'medium',
      initialMood: a.initialMood || 0,
    }));

  // Check for existing articles to avoid duplicates
  // Get articles from the last 4 hours to check for duplicates
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const recentArticles = await db
    .select({
      articleTitle: posts.articleTitle,
      content: posts.content,
      timestamp: posts.timestamp,
    })
    .from(posts)
    .where(
      and(
        eq(posts.type, 'article'),
        gte(posts.timestamp, fourHoursAgo),
        isNull(posts.deletedAt)
      )
    );

  // Filter out events that already have articles
  const eventsToCover = eventsTocover.filter((event) => {
    // Check if articles already exist for this event
    // Match by checking if recent articles mention similar topics
    const eventKeywords = event.description
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 5);
    const hasExistingArticle = recentArticles.some((article) => {
      const articleText =
        `${article.articleTitle || ''} ${article.content || ''}`.toLowerCase();
      // Check if article contains at least 2 keywords from the event
      const matchingKeywords = eventKeywords.filter(
        (keyword) => keyword.length > 3 && articleText.includes(keyword)
      );
      return matchingKeywords.length >= 2;
    });

    if (hasExistingArticle) {
      logger.debug(
        'Skipping event - articles already exist',
        { eventId: event.id },
        'GameTick'
      );
      return false;
    }
    return true;
  });

  logger.info(
    `Filtered events: ${eventsToCover.length}/${eventsTocover.length} events need articles`,
    {
      filtered: eventsToCover.length,
      total: eventsTocover.length,
    },
    'GameTick'
  );

  // Generate articles in parallel with Promise.allSettled to handle failures gracefully
  const articlePromises = eventsToCover.map(
    async (event: {
      id: string;
      eventType: string;
      description: string;
      actors: string[] | null;
      relatedQuestion: number | null;
      visibility: string;
      dayNumber: number | null;
    }) => {
      // Check deadline before starting each article
      if (Date.now() > deadlineMs) {
        logger.debug(
          'Skipping article due to deadline',
          { eventId: event.id },
          'GameTick'
        );
        return 0;
      }

      const worldEvent: WorldEvent = {
        id: event.id,
        type: event.eventType as WorldEvent['type'],
        description: event.description,
        actors: (event.actors as string[]) || [],
        relatedQuestion: event.relatedQuestion || undefined,
        visibility: event.visibility as WorldEvent['visibility'],
        day: event.dayNumber || 0,
      };

      const articles = await articleGen.generateArticlesForEvent(
        worldEvent,
        organizationsList,
        actorList,
        []
      );

      let created = 0;
      for (const article of articles) {
        if (!article || !article.authorOrgId) {
          logger.warn(
            'Invalid article generated',
            { eventId: event.id },
            'GameTick'
          );
          continue;
        }

        // Transform content to replace real names with parody names
        const transformedSummary = await characterMappingService.transformText(
          article.summary || ''
        );
        const transformedContent = await characterMappingService.transformText(
          article.content || ''
        );
        const transformedTitle = await characterMappingService.transformText(
          article.title || 'Untitled'
        );
        if (
          transformedSummary.replacementCount > 0 ||
          transformedContent.replacementCount > 0 ||
          transformedTitle.replacementCount > 0
        ) {
          logger.warn(
            `Fixed ${transformedSummary.replacementCount + transformedContent.replacementCount + transformedTitle.replacementCount} real name(s) in event article`,
            {
              eventId: event.id,
              title: article.title,
            },
            'GameTick'
          );
        }

        await dbService().createPostWithAllFields({
          id: await generateSnowflakeId(),
          type: 'article',
          content: transformedSummary.transformedText,
          fullContent: transformedContent.transformedText,
          articleTitle: transformedTitle.transformedText,
          byline: article.byline || undefined,
          biasScore: article.biasScore || undefined,
          sentiment: article.sentiment || undefined,
          slant: article.slant || undefined,
          category: article.category || undefined,
          authorId: article.authorOrgId,
          gameId: 'continuous',
          dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
          timestamp: article.publishedAt || new Date(),
        });
        created++;
      }

      return created;
    }
  );

  // Wait for all article generation to complete
  const results = await Promise.allSettled(articlePromises);

  // Count successful articles and log failures
  const articlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    }
    logger.error(
      'Failed to generate article from event',
      { error: result.reason },
      'GameTick'
    );
    return sum;
  }, 0);

  logger.info(
    'Parallel article generation complete',
    {
      articlesCreated,
      attempted: articlesToGenerate,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    },
    'GameTick'
  );

  return questionArticlesCreated + articlesCreated;
}

/**
 * Generate articles for active questions - ensures each question has 1-3 articles
 */
async function generateArticlesForActiveQuestions(
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  // Get all active questions
  const activeQuestions = await db
    .select()
    .from(questionsSchema)
    .where(eq(questionsSchema.status, 'active'))
    .orderBy(desc(questionsSchema.createdAt));

  if (activeQuestions.length === 0) {
    return 0;
  }

  // Get news organizations and actors
  const [newsOrgs, actorsList] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.type, 'media')),
    db.select().from(actors).orderBy(asc(actors.tier)).limit(50),
  ]);

  if (newsOrgs.length === 0 || actorsList.length === 0) {
    logger.warn(
      'Missing news orgs or actors for question articles',
      {
        newsOrgs: newsOrgs.length,
        actors: actorsList.length,
      },
      'GameTick'
    );
    return 0;
  }

  // Get existing articles from last 24 hours to check coverage
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentArticles = await db
    .select({
      content: posts.content,
      articleTitle: posts.articleTitle,
    })
    .from(posts)
    .where(
      and(
        eq(posts.type, 'article'),
        gte(posts.timestamp, oneDayAgo),
        isNull(posts.deletedAt)
      )
    );

  const actorList = actorsList
    .filter((a: (typeof actorsList)[number]) => a && a.id && a.name)
    .map((a: (typeof actorsList)[number]) => ({
      id: a.id,
      name: a.name,
      description: a.description || '',
      domain: Array.isArray(a.domain) ? a.domain : [a.domain || 'tech'],
      personality: a.personality || undefined,
      tier: (a.tier as ActorTier) || undefined,
      affiliations: a.affiliations || [],
      postStyle: a.postStyle || undefined,
      postExample: a.postExample || '',
      role: (a.role as 'main' | 'supporting' | 'extra') || undefined,
      initialLuck: (a.initialLuck as 'low' | 'medium' | 'high') || 'medium',
      initialMood: a.initialMood || 0,
    }));

  // Initialize article generator
  const articleGen = new ArticleGenerator(llm);

  // Check each question and generate articles if needed (1-3 per question)
  let totalArticlesCreated = 0;
  const articlePromises: Array<Promise<number>> = [];

  for (const question of activeQuestions) {
    if (Date.now() > deadlineMs) {
      logger.warn(
        'Article generation for questions aborted due to deadline',
        {
          questionsProcessed: totalArticlesCreated,
        },
        'GameTick'
      );
      break;
    }

    // Count existing articles about this question
    const questionKeywords = question.text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const existingArticleCount = recentArticles.filter((article) => {
      const articleText =
        `${article.articleTitle || ''} ${article.content || ''}`.toLowerCase();
      // Check if article mentions at least 2 keywords from the question
      const matchingKeywords = questionKeywords.filter((keyword) =>
        articleText.includes(keyword)
      );
      return matchingKeywords.length >= 2;
    }).length;

    // Generate 1-3 articles per question
    // If none exist, generate 1-3. If 1-2 exist, fill up to 3. If 3+ exist, skip.
    let targetArticleCount: number;
    if (existingArticleCount === 0) {
      // No articles yet - generate 1-3 articles
      targetArticleCount = Math.min(
        1 + Math.floor(Math.random() * 3),
        newsOrgs.length
      ); // Random 1-3, capped by available orgs
    } else if (existingArticleCount < 3) {
      // Some articles exist - fill up to 3 total
      targetArticleCount = Math.min(3 - existingArticleCount, newsOrgs.length);
    } else {
      // Already has 3+ articles - skip
      targetArticleCount = 0;
    }

    if (targetArticleCount <= 0) {
      logger.debug(
        `Question Q${question.questionNumber} already has ${existingArticleCount} articles, skipping`,
        {
          questionId: question.id,
          questionText: question.text,
        },
        'GameTick'
      );
      continue;
    }

    logger.info(
      `Generating ${targetArticleCount} articles for question Q${question.questionNumber}`,
      {
        questionId: question.id,
        questionText: question.text,
        existingArticles: existingArticleCount,
        targetArticles: targetArticleCount,
      },
      'GameTick'
    );

    // Select random news organizations for this question
    const shuffledOrgs = [...newsOrgs].sort(() => Math.random() - 0.5);
    const orgsForQuestion = shuffledOrgs.slice(0, targetArticleCount);

    // Generate articles for this question in parallel
    for (const orgData of orgsForQuestion) {
      const articlePromise = (async () => {
        // Transform org to Organization type
        const org: Organization = {
          id: orgData.id,
          name: orgData.name || 'Unknown Organization',
          description: orgData.description || '',
          type: (orgData.type as 'company' | 'media' | 'government') || 'media',
          canBeInvolved: orgData.canBeInvolved,
          initialPrice: orgData.initialPrice ?? undefined,
          currentPrice: orgData.currentPrice ?? undefined,
        };

        // Use 'commentary' stage for ongoing questions
        const article = await articleGen.generateArticleForQuestion(
          {
            id: question.id,
            text: question.text,
            scenario: question.scenarioId || 1,
            outcome: question.outcome ?? false,
            rank: question.rank || 1,
            createdDate: question.createdAt.toISOString().split('T')[0]!,
            resolutionDate:
              question.resolutionDate?.toISOString().split('T')[0] || '',
            status: question.status as 'active' | 'resolved' | 'cancelled',
          },
          org,
          'commentary', // Use commentary stage for active questions
          actorList,
          [] // No recent events needed for question articles
        );

        // Transform content to replace real names with parody names
        const transformedSummary = await characterMappingService.transformText(
          article.summary || ''
        );
        const transformedContent = await characterMappingService.transformText(
          article.content || ''
        );
        const transformedTitle = await characterMappingService.transformText(
          article.title || 'Untitled'
        );

        if (
          transformedSummary.replacementCount > 0 ||
          transformedContent.replacementCount > 0 ||
          transformedTitle.replacementCount > 0
        ) {
          logger.warn(
            `Fixed ${transformedSummary.replacementCount + transformedContent.replacementCount + transformedTitle.replacementCount} real name(s) in question article`,
            {
              questionId: question.id,
              title: article.title,
            },
            'GameTick'
          );
        }

        await dbService().createPostWithAllFields({
          id: await generateSnowflakeId(),
          type: 'article',
          content: transformedSummary.transformedText,
          fullContent: transformedContent.transformedText,
          articleTitle: transformedTitle.transformedText,
          byline: article.byline || undefined,
          biasScore: article.biasScore || undefined,
          sentiment: article.sentiment || undefined,
          slant: article.slant || undefined,
          category: article.category || undefined,
          authorId: article.authorOrgId,
          gameId: 'continuous',
          dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
          timestamp: article.publishedAt || new Date(),
        });

        logger.debug(
          'Created article for question',
          {
            questionId: question.id,
            questionNumber: question.questionNumber,
            org: org.name,
            title: article.title,
          },
          'GameTick'
        );

        return 1;
      })();

      articlePromises.push(articlePromise);
    }
  }

  // Wait for all article generation to complete
  const results = await Promise.allSettled(articlePromises);

  totalArticlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    }
    logger.warn(
      'Failed to generate question article',
      { error: result.reason },
      'GameTick'
    );
    return sum;
  }, 0);

  logger.info(
    'Question article generation complete',
    {
      articlesCreated: totalArticlesCreated,
      questionsProcessed: activeQuestions.length,
      attempted: articlePromises.length,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    },
    'GameTick'
  );

  return totalArticlesCreated;
}

/**
 * Generate baseline articles in parallel with game context
 * Generates articles about active questions, actors, or companies instead of generic topics
 */
async function generateBaselineArticlesParallel(
  newsOrgs: Array<{
    id: string;
    name: string | null;
    description: string | null;
  }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  // Gather game context for relevant articles
  // NOTE: Question articles are handled by generateArticlesForActiveQuestions()
  const [actorsList, companiesList, worldFactsContext, worldContext] =
    await Promise.all([
      db
        .select({
          id: actors.id,
          name: actors.name,
          description: actors.description,
          domain: actors.domain,
          tier: actors.tier,
        })
        .from(actors)
        .where(inArray(actors.role, ['main', 'supporting']))
        .limit(10),
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          description: organizations.description,
          currentPrice: organizations.currentPrice,
          initialPrice: organizations.initialPrice,
        })
        .from(organizations)
        .where(eq(organizations.type, 'company'))
        .limit(10),
      worldFactsService.generatePromptContext(),
      (async () => {
        return generateWorldContext({
          maxActors: 30,
          realityGroundingLevel: 'concise',
        });
      })(),
    ]);

  // Build article topics from game context
  // NOTE: Questions are already covered by generateArticlesForActiveQuestions()
  // This function focuses on actors and companies for variety
  const articleTopics: Array<{
    topic: string;
    category: string;
    context: string;
  }> = [];

  // Add topics about high-tier actors
  for (const actor of actorsList
    .filter((a) => a.tier === 'S_TIER' || a.tier === 'A_TIER')
    .slice(0, 2)) {
    const domainStr = Array.isArray(actor.domain)
      ? actor.domain[0]
      : actor.domain;
    const domain = domainStr || 'tech';
    articleTopics.push({
      topic: `${actor.name} and their recent activities`,
      category: domain === 'tech' ? 'tech' : 'business',
      context: `${actor.name} (${actor.description || 'prominent figure'}) in ${domain}`,
    });
  }

  // Add topics about companies with price movements
  for (const company of companiesList.slice(0, 2)) {
    const currentPrice = company.currentPrice || company.initialPrice || 100;
    const initialPrice = company.initialPrice || 100;
    const changePercent = ((currentPrice - initialPrice) / initialPrice) * 100;
    articleTopics.push({
      topic: `${company.name} and market performance`,
      category: 'finance',
      context: `${company.name} (${company.description || 'company'}) - ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(1)}% from initial price`,
    });
  }

  // If we don't have enough topics, add some game-relevant generic ones
  if (articleTopics.length < 5) {
    articleTopics.push(
      {
        topic: 'recent developments in prediction markets',
        category: 'finance',
        context: 'prediction markets and trading activity',
      },
      {
        topic: 'tech industry trends and major players',
        category: 'tech',
        context: 'technology sector developments',
      }
    );
  }

  const articlesToGenerate = Math.min(5, newsOrgs.length, articleTopics.length);

  logger.info(
    `Generating ${articlesToGenerate} baseline articles with game context`,
    {
      topicsFromActors: actorsList.length,
      topicsFromCompanies: companiesList.length,
    },
    'GameTick'
  );

  // Generate all articles in parallel
  const articlePromises = Array.from(
    { length: articlesToGenerate },
    async (_, i) => {
      if (Date.now() > deadlineMs) {
        logger.debug(
          'Skipping baseline article due to deadline',
          { index: i },
          'GameTick'
        );
        return 0;
      }

      const org = newsOrgs[i];
      if (!org || !org.name) return 0;

      const topicData = articleTopics[i];
      if (!topicData) return 0;

      const prompt = `You are ${org.name}, a news organization. Write a detailed news article about ${topicData.topic}.

CONTEXT:
${topicData.context}

${worldFactsContext}

${worldContext.realityGrounding || ''}

CRITICAL RULES:
- Use ONLY parody names (AIlon Musk, Sam AIltman, Mark Zuckerborg, etc.) - NEVER real names
- Reference specific actors, companies, or questions from the game context above
- Make the article relevant to the current game state and active questions
- Include specific details about actors, companies, or prediction markets when relevant

Your article should include:
- A compelling headline (max 100 chars) that references specific game elements
- A 2-3 sentence summary for the article listing (max 400 chars)
- A full article body of at least 4 paragraphs with clear context, quotes or sourced details where appropriate, and a professional newsroom tone
- Reference specific actors, companies, or questions from the context above
- Be professional and informative
- Match the tone of a ${org.description || 'news organization'}
- Separate paragraphs with \\n\\n (two newlines)

Return your response as XML in this exact format:
<response>
  <title>compelling headline here</title>
  <summary>2-3 sentence summary here</summary>
  <article>full article body here with \\n\\n between paragraphs</article>
</response>`;

      const response = await llm.generateJSON<
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
          maxTokens: 8000,
          format: 'xml',
          promptType: 'generate_baseline_article',
        }
      );

      // Handle XML structure
      const baselineArticle =
        'response' in response && response.response
          ? (response.response as {
              title: string;
              summary: string;
              article: string;
            })
          : (response as { title: string; summary: string; article: string });

      if (
        !baselineArticle.title ||
        !baselineArticle.summary ||
        !baselineArticle.article
      )
        return 0;

      const summary = baselineArticle.summary.trim();
      const articleTitle = baselineArticle.title.trim();
      const articleBody = baselineArticle.article.trim();

      if (articleBody.length < 400) {
        logger.warn(
          'Baseline article body too short',
          { orgId: org.id, length: articleBody.length },
          'GameTick'
        );
        return 0;
      }

      // Calculate timestamp with jitter
      const timeSlotMs = 60000 / articlesToGenerate;
      const slotOffset = i * timeSlotMs;
      const randomJitter = Math.random() * timeSlotMs * 0.8;
      const timestampWithOffset = new Date(
        timestamp.getTime() + slotOffset + randomJitter
      );

      // Transform content to replace real names with parody names
      const transformedSummary =
        await characterMappingService.transformText(summary);
      const transformedBody =
        await characterMappingService.transformText(articleBody);
      const transformedTitle =
        await characterMappingService.transformText(articleTitle);
      if (
        transformedSummary.replacementCount > 0 ||
        transformedBody.replacementCount > 0 ||
        transformedTitle.replacementCount > 0
      ) {
        logger.warn(
          `Fixed ${transformedSummary.replacementCount + transformedBody.replacementCount + transformedTitle.replacementCount} real name(s) in baseline article`,
          {
            org: org.name,
            topic: topicData.topic,
          },
          'GameTick'
        );
      }

      await dbService().createPostWithAllFields({
        id: await generateSnowflakeId(),
        type: 'article',
        content: transformedSummary.transformedText,
        fullContent: transformedBody.transformedText,
        articleTitle: transformedTitle.transformedText,
        category: topicData.category,
        authorId: org.id,
        gameId: 'continuous',
        dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
        timestamp: timestampWithOffset,
      });

      logger.debug(
        'Created baseline article with game context',
        {
          org: org.name,
          topic: topicData.topic,
          category: topicData.category,
        },
        'GameTick'
      );
      return 1;
    }
  );

  // Wait for all baseline articles to complete
  const results = await Promise.allSettled(articlePromises);

  const articlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    }
    logger.warn(
      'Failed to generate baseline article',
      { error: result.reason },
      'GameTick'
    );
    return sum;
  }, 0);

  logger.info(
    'Parallel baseline article generation complete',
    {
      articlesCreated,
      attempted: articlesToGenerate,
      topicsUsed: articleTopics.length,
    },
    'GameTick'
  );

  return articlesCreated;
}

// generateEvents moved to services/event-generation-helpers.ts

/** Update market prices based on NPC trading activity (investment-based pricing). */
async function updateMarketPricesFromTrades(
  _timestamp: Date,
  executionResult: TradingExecutionResult
): Promise<number> {
  if (!executionResult.executedTrades.length) {
    return 0;
  }

  // Get all companies with current holdings
  const companiesList = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      currentPrice: organizations.currentPrice,
      initialPrice: organizations.initialPrice,
    })
    .from(organizations)
    .where(eq(organizations.type, 'company'));

  type CompanyData = (typeof companiesList)[0];
  // Use raw org IDs as keys since positions now store raw IDs
  const companyMap = new Map<string, CompanyData>(
    companiesList.map((c: CompanyData) => [c.id, c])
  );

  // Calculate total holdings for each company from ALL positions
  const holdingsByTicker = new Map<string, number>();

  const allPositions = await db
    .select({
      ticker: poolPositions.ticker,
      side: poolPositions.side,
      size: poolPositions.size,
    })
    .from(poolPositions)
    .where(
      and(
        eq(poolPositions.marketType, 'perp'),
        isNull(poolPositions.closedAt),
        isNotNull(poolPositions.ticker)
      )
    );

  for (const pos of allPositions) {
    if (!pos.ticker) continue;

    const current = holdingsByTicker.get(pos.ticker) || 0;
    // Long positions add to holdings, short positions subtract
    const delta = pos.side === 'long' ? pos.size : -pos.size;
    holdingsByTicker.set(pos.ticker, current + delta);
  }

  let updates = 0;
  const priceUpdatesForChain: Array<{
    organizationId: string;
    newPrice: number;
  }> = [];

  // Update prices based on total capital deployed
  // Market cap = initialPrice × syntheticSupply + totalDeployed
  // ticker is now a raw org ID, not a transformed ticker
  for (const [ticker, netHoldings] of holdingsByTicker) {
    const company = companyMap.get(ticker);
    if (!company) continue;

    const initialPrice = company.initialPrice ?? 100;
    const currentPrice = company.currentPrice ?? initialPrice;

    // Fixed synthetic supply per company
    const syntheticSupply = 10000;
    const baseMarketCap = initialPrice * syntheticSupply; // e.g. $100 × 10k = $1M

    // Market cap increases with net long holdings
    const newMarketCap = baseMarketCap + netHoldings;

    // Price = marketCap / supply, with floor and ceiling
    const rawPrice = newMarketCap / syntheticSupply;
    const minPrice = initialPrice * 0.1; // Floor: 90% max drop
    const maxPrice = currentPrice * 2.0; // Cap: 100% max gain per tick
    const newPrice = Math.max(minPrice, Math.min(rawPrice, maxPrice));

    const change = newPrice - currentPrice;
    const changePercent = currentPrice > 0 ? (change / currentPrice) * 100 : 0;

    // Only update if price actually changed
    if (Math.abs(change) < 0.01) continue;

    await db
      .update(organizations)
      .set({ currentPrice: newPrice, updatedAt: new Date() })
      .where(eq(organizations.id, company.id));

    await dbService().recordPriceUpdate(
      company.id,
      newPrice,
      change,
      changePercent
    );

    logger.info(
      `Price update for ${ticker}: ${currentPrice.toFixed(2)} -> ${newPrice.toFixed(2)} (${changePercent.toFixed(2)}%) [holdings: $${netHoldings.toFixed(0)}]`,
      { ticker, currentPrice, newPrice, netHoldings, marketCap: newMarketCap },
      'GameTick'
    );

    // Add to on-chain publish queue
    priceUpdatesForChain.push({
      organizationId: company.id,
      newPrice,
    });

    updates++;
  }

  // Publish all price updates to blockchain in batch
  if (priceUpdatesForChain.length > 0) {
    await PriceUpdateService.applyUpdates(
      priceUpdatesForChain.map((u) => ({
        ...u,
        source: 'npc_trade',
        reason: 'NPC trading price impact',
      }))
    ).catch((error: Error) => {
      logger.error(
        'Failed to publish prices to blockchain',
        { error, count: priceUpdatesForChain.length },
        'GameTick'
      );
    });
  }

  return updates;
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
  const marketQuestion = market.question;
  const marketLiquidity = market.liquidity;
  const marketOnChainMarketId = market.onChainMarketId;
  const marketOnChainResolved = market.onChainResolved;
  const marketYesShares = market.yesShares;
  const marketNoShares = market.noShares;

  const { positionUpdates, totalPayout } = await db.transaction(async (tx) => {
    const positionsList = await tx
      .select()
      .from(positions)
      .where(
        and(eq(positions.marketId, marketId), ne(positions.status, 'resolved'))
      );

    const updates: Array<{
      userId: string;
      pnl: number;
      positionId: string;
    }> = [];

    let payoutAccumulator = 0;

    for (const position of positionsList) {
      const shares = Number(position.shares ?? 0);
      const avgPrice = Number(position.avgPrice ?? 0);
      const costBasis = avgPrice * shares;
      const didWin = position.side === winningSide;
      // In prediction markets, each winning share pays exactly 1 unit
      // The market "odds" are reflected in purchase price, not payout
      const payout = didWin ? shares : 0;
      const pnl = payout - costBasis;

      if (didWin && payout > 0) {
        await WalletService.credit(
          position.userId,
          payout,
          'pred_resolve_win',
          `Prediction market payout: ${marketQuestion}`,
          marketId,
          tx
        );
        payoutAccumulator += payout;
      }

      await tx
        .update(positions)
        .set({
          shares: new Decimal(0).toString(),
          amount: new Decimal(costBasis).toString(),
          pnl: new Decimal(pnl).toString(),
          status: 'resolved',
          outcome: didWin,
          resolvedAt: resolutionTimestamp,
          questionId: question.questionNumber,
          updatedAt: resolutionTimestamp,
        })
        .where(eq(positions.id, position.id));

      updates.push({
        userId: position.userId,
        pnl,
        positionId: position.id,
      });
    }

    const liquidityReduction = Math.min(
      payoutAccumulator,
      Number(marketLiquidity ?? 0)
    );

    const newLiquidity =
      liquidityReduction > 0
        ? Decimal.sub(marketLiquidity ?? 0, liquidityReduction).toString()
        : marketLiquidity;

    await tx
      .update(marketsSchema)
      .set({
        resolved: true,
        resolution: winningSide,
        updatedAt: resolutionTimestamp,
        liquidity: newLiquidity,
      })
      .where(eq(marketsSchema.id, marketId));

    await tx
      .update(questionsSchema)
      .set({
        status: 'resolved',
        resolvedOutcome: winningSide,
        updatedAt: resolutionTimestamp,
      })
      .where(eq(questionsSchema.id, question.id));

    return {
      positionUpdates: updates,
      totalPayout: liquidityReduction,
    };
  });

  for (const update of positionUpdates) {
    if (update.pnl === 0) continue;
    await WalletService.recordPnL(
      update.userId,
      update.pnl,
      'prediction_resolve',
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

  const [resolvedMarket] = await db
    .select()
    .from(marketsSchema)
    .where(eq(marketsSchema.id, marketId))
    .limit(1);

  const resolvedYesShares = Number(
    resolvedMarket?.yesShares ?? marketYesShares ?? 0
  );
  const resolvedNoShares = Number(
    resolvedMarket?.noShares ?? marketNoShares ?? 0
  );
  let yesPrice = 0.5;
  let noPrice = 0.5;
  if (resolvedYesShares + resolvedNoShares > 0) {
    yesPrice = PredictionPricing.getCurrentPrice(
      resolvedYesShares,
      resolvedNoShares,
      'yes'
    );
    noPrice = PredictionPricing.getCurrentPrice(
      resolvedYesShares,
      resolvedNoShares,
      'no'
    );
  } else {
    yesPrice = winningSide ? 1 : 0;
    noPrice = winningSide ? 0 : 1;
  }

  await PredictionMarketService.recordSnapshot({
    marketId: marketId,
    yesPrice,
    noPrice,
    yesShares: resolvedYesShares,
    noShares: resolvedNoShares,
    liquidity: Number(resolvedMarket?.liquidity ?? 0),
    eventType: 'resolution',
    source: 'system',
  }).catch((error) => {
    logger.warn(
      'Failed to record price history for resolution',
      { error, marketId: marketId },
      'GameTick'
    );
  });

  await invalidateAfterPredictionTrade(marketId).catch((error) => {
    logger.warn(
      'Failed to invalidate prediction cache after resolution',
      { error, marketId: marketId },
      'GameTick'
    );
  });

  PredictionMarketService.emitResolution({
    marketId: marketId,
    winningSide: winningSide ? 'yes' : 'no',
    yesShares: Number(resolvedMarket?.yesShares ?? marketYesShares ?? 0),
    noShares: Number(resolvedMarket?.noShares ?? marketNoShares ?? 0),
    liquidity: Number(resolvedMarket?.liquidity ?? 0),
    totalPayout,
    timestamp: resolutionTimestamp.toISOString(),
    resolutionProofUrl: question.resolutionProofUrl ?? undefined,
    resolutionDescription: question.resolutionDescription ?? undefined,
  });

  logger.info(
    'Resolved prediction market payouts',
    {
      marketId: market.id,
      questionNumber,
      winningSide: winningSide ? 'YES' : 'NO',
      totalPayout,
      positionsSettled: positionUpdates.length,
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
async function publishOracleCommitments(
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
async function publishOracleReveals(
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

  const companies = await dbService().getCompanies();

  if (!companies || companies.length === 0) {
    logger.warn('No companies found for widget cache update', {}, 'GameTick');
    return 0;
  }

  const perpMarketsWithStats = await Promise.all(
    companies
      .filter(
        (company: (typeof companies)[number]) =>
          company && company.id && company.name
      ) // Filter out invalid companies
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

  // Get actor names for pools
  const poolActorIds = poolsList.map((p) => p.npcActorId).filter(Boolean);
  const poolActors =
    poolActorIds.length > 0
      ? await db
          .select({ id: actors.id, name: actors.name })
          .from(actors)
          .where(inArray(actors.id, poolActorIds))
      : [];
  const poolActorMap = new Map(poolActors.map((a) => [a.id, a.name]));

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

// World facts update interval (24 hours in milliseconds)
const WORLD_FACTS_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Check if we should update world facts
 * Uses the most recent RSSHeadline's fetchedAt timestamp
 */
async function shouldUpdateWorldFacts(): Promise<boolean> {
  const [lastHeadline] = await db
    .select({ fetchedAt: rssHeadlines.fetchedAt })
    .from(rssHeadlines)
    .orderBy(desc(rssHeadlines.fetchedAt))
    .limit(1);

  if (!lastHeadline || !lastHeadline.fetchedAt) {
    return true; // Never updated before
  }

  const timeSinceLastUpdate = Date.now() - lastHeadline.fetchedAt.getTime();
  return timeSinceLastUpdate >= WORLD_FACTS_UPDATE_INTERVAL_MS;
}

/** Updates world facts if 24+ hours since last update. */
async function updateWorldFactsIfNeeded(): Promise<{
  updated: boolean;
  stats?: {
    feedsFetched: number;
    newHeadlines: number;
    parodiesGenerated: number;
    headlinesCleaned: number;
  };
}> {
  const shouldUpdate = await shouldUpdateWorldFacts();

  if (!shouldUpdate) {
    logger.debug('World facts update not needed yet', undefined, 'GameTick');
    return { updated: false };
  }

  logger.info(
    '🌍 Starting world facts update from game tick',
    undefined,
    'GameTick'
  );

  const startTime = Date.now();

  // Step 1: Fetch all RSS feeds
  logger.info('Fetching RSS feeds...', undefined, 'GameTick');
  const feedResult = await rssFeedService.fetchAllFeeds();
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
  const parodies = await generator.processHeadlines(untransformedHeadlines);
  logger.info(
    `Generated ${parodies.length} parody headlines`,
    { count: parodies.length },
    'GameTick'
  );

  // Step 3: Clean up old headlines (older than 7 days)
  logger.info('Cleaning up old headlines...', undefined, 'GameTick');
  const cleaned = await rssFeedService.cleanupOldHeadlines();
  logger.info(
    `Cleaned up ${cleaned} old headlines`,
    { count: cleaned },
    'GameTick'
  );

  const duration = Date.now() - startTime;
  logger.info(
    '✅ World facts update completed',
    {
      duration: `${duration}ms`,
      feedsFetched: feedResult.fetched,
      newHeadlines: feedResult.stored,
      parodiesGenerated: parodies.length,
      headlinesCleaned: cleaned,
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
    },
  };
}

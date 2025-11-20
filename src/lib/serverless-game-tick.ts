/**
 * Serverless Game Tick Logic
 * 
 * @description Lightweight game content generation for Vercel Cron Jobs.
 * Executes a single "tick" of game logic without persistent processes.
 * This replaces the continuous daemon with stateless, scheduled execution.
 * 
 * Features:
 * - Content generation (posts, articles, events)
 * - Market decisions and trading execution
 * - Question generation and resolution
 * - Widget cache updates
 * - Trending calculation
 * - Reputation synchronization
 * - World facts updates
 * - NPC group dynamics
 * 
 * ✅ Vercel-compatible: No filesystem access, completes in <180s
 */

import { Prisma } from '@prisma/client';
import { ArticleGenerator } from '@/engine/ArticleGenerator';
import { QuestionManager } from '@/engine/QuestionManager';
import { invalidateAfterPredictionTrade } from '@/lib/cache/trade-cache-invalidation';
import { MarketDecisionEngine } from '@/engine/MarketDecisionEngine';
import { BabylonLLMClient } from '@/generator/llm/openai-client';
import type { ActorTier, WorldEvent } from '@/shared/types';
import db from './database-service';
import { logger } from './logger';
import { NPCInvestmentManager } from './npc/npc-investment-manager';
import { prisma } from './prisma';
import { MarketContextService } from './services/market-context-service';
import { ReputationService } from './services/reputation-service';
import { TradeExecutionService } from './services/trade-execution-service';
import { PredictionMarketEventService } from './services/prediction-market-event-service';
import { PredictionPriceHistoryService } from './services/prediction-price-history-service';
import { PredictionPricing } from '@/lib/prediction-pricing';
import { calculateTrendingIfNeeded, calculateTrendingTags } from './services/trending-calculation-service';
import { WalletService } from './services/wallet-service';
import { generateSnowflakeId } from './snowflake';
import type { TradingExecutionResult } from '@/types/market-decisions';
import { getOracleService } from './oracle';
import { worldFactsService } from './services/world-facts-service';
import { rssFeedService } from './services/rss-feed-service';
import { createParodyHeadlineGenerator } from './services/parody-headline-generator';
import { RelationshipEvolutionEngine } from '@/engine/RelationshipEvolutionEngine';
import { characterMappingService } from './services/character-mapping-service';

/**
 * Game tick execution result
 * 
 * @description Contains statistics about what was accomplished during a game tick,
 * including content generation counts, market updates, and system operations.
 */
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

/**
 * Execute a single game tick
 * 
 * @description Executes a complete game tick including content generation, market
 * decisions, question resolution, and system updates. Designed to complete within
 * 3 minutes (180 seconds). Uses parallelization for posts, articles, and other
 * operations to maximize throughput. Guarantees critical operations (market decisions)
 * always execute via budget reserve.
 * 
 * @param {boolean} [skipContentGeneration=false] - If true, skips post/event/article
 * generation (for buffer management when content buffer is sufficient)
 * @returns {Promise<GameTickResult>} Result statistics for the tick
 * 
 * @example
 * ```typescript
 * const result = await executeGameTick();
 * console.log(`Created ${result.postsCreated} posts, ${result.articlesCreated} articles`);
 * ```
 */
export async function executeGameTick(skipContentGeneration: boolean = false): Promise<GameTickResult> {
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

  try {
    // Bootstrap initial content if this is a fresh setup
    await bootstrapContentIfNeeded(timestamp);

    // Note: Wandb model configuration is loaded but not used in game tick
    // Wandb models should ONLY be used for agent operations, not game tick operations
    // This is kept for logging/debugging purposes only
    const { getWandbModel } = await import('./ai-model-config');
    const wandbModel = await getWandbModel();
    if (wandbModel) {
      logger.debug('Wandb model configured (not used in game tick - reserved for agents)', { model: wandbModel }, 'GameTick');
    }

    // Initialize LLM client for game tick operations (excludes Wandb)
    // Wandb models should ONLY be used for agent operations, not game tick
    const llmClient = BabylonLLMClient.forGameTick();
    const stats = llmClient.getStats();
    logger.info('LLM client initialized for game tick operations', { 
      provider: stats.provider, 
      model: stats.model 
    }, 'GameTick');

    // Get active questions from database
    const activeQuestions = await prisma.question.findMany({
      where: {
        status: 'active',
      },
    });

    logger.info(
      `Found ${activeQuestions.length} active questions`,
      { count: activeQuestions.length },
      'GameTick'
    );

    // Generate initial questions FIRST if this is the first tick
    let currentActiveQuestions = activeQuestions;
    if (activeQuestions.length === 0 && Date.now() < deadline) {
      logger.info('First tick detected - generating initial questions', {}, 'GameTick');
      const questionsGenerated = await generateNewQuestions(
        5, // Generate 5 initial questions
        llmClient,
        deadline
      );
      result.questionsCreated = questionsGenerated;
      
      // Reload active questions after generation (use new variable to avoid mutation)
      currentActiveQuestions = await prisma.question.findMany({
        where: { status: 'active' },
      });
      
      logger.info(`Initial questions created: ${questionsGenerated}`, { count: questionsGenerated }, 'GameTick');
      
      // Publish commitments to blockchain oracle
      if (questionsGenerated > 0 && currentActiveQuestions.length > 0) {
        const oracleResult = await publishOracleCommitments(currentActiveQuestions);
        result.oracleCommits += oracleResult.committed;
        result.oracleErrors += oracleResult.errors;
      }
    }

    const questionsToResolve = currentActiveQuestions.filter((q: { resolutionDate: Date | null }) => {
      if (!q.resolutionDate) return false;
      const resolutionDate = new Date(q.resolutionDate);
      return resolutionDate <= timestamp;
    });

    if (questionsToResolve.length > 0) {
      logger.info(
        `Resolving ${questionsToResolve.length} questions`,
        { count: questionsToResolve.length },
        'GameTick'
      );

      // Resolve payouts with error handling to continue processing remaining questions
      // Question status is updated atomically within resolveQuestionPayouts
      for (const question of questionsToResolve) {
        try {
          await resolveQuestionPayouts(question.questionNumber);
          result.questionsResolved++;
        } catch (error) {
          logger.error('Failed to resolve question payout', {
            questionNumber: question.questionNumber,
            questionId: question.id,
            error: error instanceof Error ? error.message : String(error),
          }, 'GameTick');
          // Continue with next question instead of failing entire batch
        }
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
    } else {
      logger.info('Skipping content generation (buffer sufficient)', undefined, 'GameTick');
    }

    // CRITICAL PRIORITY: Generate and execute NPC trading decisions
    // This ALWAYS runs - uses the full deadline, not the critical ops deadline
    // Market decisions are essential for game economy and must always execute
    logger.info('Starting critical market decision operations', { 
      timeRemaining: deadline - Date.now() 
    }, 'GameTick');

    const baselineResult = await NPCInvestmentManager.executeBaselineInvestments(timestamp);

    if (baselineResult) {
      const baselineUpdates = await updateMarketPricesFromTrades(
        timestamp,
        baselineResult
      );
      result.marketsUpdated += baselineUpdates;
    }

    const contextService = new MarketContextService();
    
    // Create a separate LLM client for market decisions that skips Wandb
    // Wandb models should ONLY be used for agent ticks, not for game tick market decisions
    // Priority: Groq > Claude > OpenAI (skip Wandb)
    let marketDecisionLLM: BabylonLLMClient;
    if (process.env.GROQ_API_KEY) {
      marketDecisionLLM = BabylonLLMClient.forGroq();
      logger.info('Using Groq for market decisions', {}, 'GameTick');
    } else if (process.env.ANTHROPIC_API_KEY) {
      marketDecisionLLM = BabylonLLMClient.forClaude();
      logger.info('Using Claude for market decisions', {}, 'GameTick');
    } else if (process.env.OPENAI_API_KEY) {
      marketDecisionLLM = BabylonLLMClient.forOpenAI();
      logger.info('Using OpenAI for market decisions', {}, 'GameTick');
    } else {
      // CRITICAL: Market decisions cannot use Wandb - throw error instead of falling back
      throw new Error(
        '❌ No API key found for market decisions!\n' +
        '   Market decisions cannot use Wandb (Wandb is reserved for agents only).\n' +
        '   Set one of these environment variables:\n' +
        '   - GROQ_API_KEY (recommended for market decisions)\n' +
        '   - ANTHROPIC_API_KEY\n' +
        '   - OPENAI_API_KEY\n' +
        '   Example: export GROQ_API_KEY=your_key_here'
      );
    }
    
    // Configure decision engine with model and token limits from environment
    // Use qwen/qwen3-32b on Groq for background trading operations
    const modelName = process.env.MARKET_DECISION_MODEL || 'qwen/qwen3-32b';
    
    // Model-aware output token limits:
    // Note: Input and output are SEPARATE limits on modern models
    // - Kimi models: 260k INPUT + 16k OUTPUT (separate)
    // - qwen3-32b: 130k INPUT + 32k OUTPUT (separate)
    const isKimiModel = modelName.toLowerCase().includes('kimi');
    const defaultMaxOutput = isKimiModel ? 16000 : 32000;
    const maxOutputTokens = parseInt(
      process.env.MARKET_DECISION_MAX_OUTPUT_TOKENS || defaultMaxOutput.toString(), 
      10
    );
    
    const decisionEngine = new MarketDecisionEngine(marketDecisionLLM, contextService, {
      model: modelName,
      maxOutputTokens,
    });
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

    await prisma.game.updateMany({
      where: { isContinuous: true },
      data: {
        lastTickAt: timestamp,
        updatedAt: timestamp,
      },
    });

    const cachesUpdated = await updateWidgetCaches();
    result.widgetCachesUpdated = cachesUpdated;

    // Calculate trending tags if needed (checks 30-minute interval internally)
    // Force calculation on first tick if we just generated baseline posts
    const forceCalculation = result.postsCreated > 0 && result.articlesCreated > 0;
    const trendingCalculated = forceCalculation 
      ? await forceTrendingCalculation()
      : await calculateTrendingIfNeeded();
    result.trendingCalculated = trendingCalculated;
    if (trendingCalculated) {
      logger.info('Trending tags recalculated', {}, 'GameTick');
    }

    // Sync reputation to ERC-8004 if needed (checks sync interval internally)
    // This runs during game ticks for local development, and also via Vercel cron
    const { batchSyncReputationsToERC8004 } = await import('./reputation/erc8004-reputation-sync');
    try {
      // Process a small batch during game tick (don't block the tick)
      const syncResult = await batchSyncReputationsToERC8004({
        limit: 10, // Small batch during game tick
        offset: 0,
        forceRecalculate: false,
        prioritizeNew: true, // Prioritize new accounts
      });
      result.reputationSynced = syncResult.synced > 0;
      if (syncResult.synced > 0) {
        result.reputationSyncStats = {
          total: syncResult.total,
          successful: syncResult.synced,
          failed: syncResult.failed,
        };
        logger.info('Reputation sync completed during game tick', result.reputationSyncStats, 'GameTick');
      }
    } catch (error) {
      logger.warn('Reputation sync failed during game tick (non-blocking)', { error }, 'GameTick');
      // Don't fail the game tick if reputation sync fails
    }

    // Update world facts if needed (checks 24-hour interval internally)
    const worldFactsResult = await updateWorldFactsIfNeeded();
    result.worldFactsUpdated = worldFactsResult.updated;
    if (worldFactsResult.updated && worldFactsResult.stats) {
      result.worldFactsStats = worldFactsResult.stats;
      logger.info('World facts update completed', worldFactsResult.stats, 'GameTick');
    }

    // Process alpha group invites (small chance for highly engaged users)
    const { AlphaGroupInviteService } = await import('./services/alpha-group-invite-service');
    const invites = await AlphaGroupInviteService.processTickInvites();
    result.alphaInvitesSent = invites.length;
    if (invites.length > 0) {
      logger.info('Alpha group invites sent', { count: invites.length, invites }, 'GameTick');
    }

    // Evolve NPC relationships based on recent interactions (every 10 ticks to save compute)
    const shouldEvolveRelationships = Math.floor(timestamp.getTime() / 60000) % 10 === 0;
    if (shouldEvolveRelationships && Date.now() < deadline) {
      logger.info('Evolving NPC relationships...', undefined, 'GameTick');
      const relationshipEngine = new RelationshipEvolutionEngine(llmClient);
      const relationshipsUpdated = await relationshipEngine.analyzeAndUpdateRelationships();
      result.relationshipsUpdated = relationshipsUpdated;
      if (relationshipsUpdated > 0) {
        logger.info(`✅ Updated ${relationshipsUpdated} relationships`, { count: relationshipsUpdated }, 'GameTick');
      }
    }

    // Process NPC group dynamics (form, join, leave, post, invite, kick)
    const { NPCGroupDynamicsService } = await import('./services/npc-group-dynamics-service');
    const dynamics = await NPCGroupDynamicsService.processTickDynamics();
    result.npcGroupDynamics = {
      groupsCreated: dynamics.groupsCreated,
      membersAdded: dynamics.membersAdded,
      membersRemoved: dynamics.membersRemoved,
      usersInvited: dynamics.usersInvited,
      usersKicked: dynamics.usersKicked,
      messagesPosted: dynamics.messagesPosted,
    };
    if (dynamics.groupsCreated > 0 || dynamics.membersAdded > 0 || dynamics.membersRemoved > 0 || 
        dynamics.usersInvited > 0 || dynamics.usersKicked > 0 || dynamics.messagesPosted > 0) {
      logger.info('NPC group dynamics processed', dynamics, 'GameTick');
    }

    const durationMs = Date.now() - startedAt;
    
    // Validation: Quality checks after game tick
    const validationWarnings: string[] = []
    
    // Verify markets were updated if NPC trading ran
    // Check both baseline investments and market decisions
    const hadNPCTrading = baselineResult || (marketDecisions && marketDecisions.length > 0)
    if (result.marketsUpdated === 0 && hadNPCTrading) {
      validationWarnings.push('NPC trading executed but no markets were updated')
    }
    
    // Verify content was generated if buffer was low and not skipped
    if (!skipContentGeneration && result.postsCreated === 0 && result.articlesCreated === 0 && result.eventsCreated === 0) {
      validationWarnings.push('Content generation ran but no content was created')
    }
    
    // Verify questions resolved correctly
    if (result.questionsResolved > 0) {
      // Check that resolved questions have correct status
      const resolvedQuestions = await prisma.question.findMany({
        where: {
          status: 'resolved',
          updatedAt: {
            gte: new Date(timestamp.getTime() - 60000) // Updated in last minute
          }
        },
        take: result.questionsResolved
      })
      
      if (resolvedQuestions.length !== result.questionsResolved) {
        validationWarnings.push(`Expected ${result.questionsResolved} resolved questions but found ${resolvedQuestions.length}`)
      }
    }
    
    // Validate market prices are reasonable (0-100% for predictions)
    const activeMarkets = await prisma.market.findMany({
      where: {
        resolved: false,
        endDate: { gte: timestamp }
      },
      take: 10
    })
    
    for (const market of activeMarkets) {
      const yesShares = Number(market.yesShares)
      const noShares = Number(market.noShares)
      const totalShares = yesShares + noShares
      
      if (totalShares > 0) {
        const yesOdds = (yesShares / totalShares) * 100
        const noOdds = (noShares / totalShares) * 100
        
        // Odds should be between 0 and 100%
        if (yesOdds < 0 || yesOdds > 100 || noOdds < 0 || noOdds > 100) {
          validationWarnings.push(`Market ${market.id} has invalid odds: YES=${yesOdds.toFixed(2)}%, NO=${noOdds.toFixed(2)}%`)
        }
        
        // Odds should sum to approximately 100% (allowing for rounding)
        const sum = yesOdds + noOdds
        if (sum < 99.9 || sum > 100.1) {
          validationWarnings.push(`Market ${market.id} odds don't sum to 100%: ${sum.toFixed(2)}%`)
        }
      }
    }
    
    // Log validation warnings if any
    if (validationWarnings.length > 0) {
      logger.warn('Game tick validation warnings', {
        warnings: validationWarnings,
        result
      }, 'GameTick')
    }
    
    logger.info('Game tick completed', { 
      ...result, 
      durationMs,
      validationWarnings: validationWarnings.length > 0 ? validationWarnings.length : undefined
    }, 'GameTick');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error('Critical error in game tick', { 
      error: errorMessage,
      stack: errorStack 
    }, 'GameTick');
    throw error;
  }

  return result;
}

/**
 * Bootstrap content on first game tick
 * Ensures trending and news are initialized automatically
 */
async function bootstrapContentIfNeeded(timestamp: Date): Promise<void> {
  // Check if we need to bootstrap
  const [trendingCount, newsCount, relationshipCount] = await Promise.all([
    prisma.trendingTag.count(),
    prisma.post.count({ where: { type: 'article' } }),
    prisma.actorRelationship.count(),
  ]);
  
  const MIN_TRENDING = 5;
  const MIN_NEWS = 5;
  
  // If we have enough of everything, nothing to do
  if (trendingCount >= MIN_TRENDING && newsCount >= MIN_NEWS && relationshipCount > 0) {
    return;
  }
  
  logger.info('Bootstrapping initial content...', {
    currentTrending: trendingCount,
    currentNews: newsCount,
    currentRelationships: relationshipCount,
    needTrending: trendingCount < MIN_TRENDING,
    needNews: newsCount < MIN_NEWS,
    needRelationships: relationshipCount === 0,
  }, 'GameTick');
  
  // Bootstrap relationships FIRST (needed for social dynamics)
  if (relationshipCount === 0) {
    await bootstrapInitialRelationships();
  }
  
  // Bootstrap news articles if needed
  if (newsCount < MIN_NEWS) {
    await bootstrapNewsArticles(timestamp, MIN_NEWS - newsCount);
  }
  
  // Bootstrap trending if needed (requires posts and tags)
  if (trendingCount < MIN_TRENDING) {
    await bootstrapTrending();
  }
  
  logger.info('Bootstrap complete', {
    trendingCount: await prisma.trendingTag.count(),
    newsCount: await prisma.post.count({ where: { type: 'article' } }),
    relationshipCount: await prisma.actorRelationship.count(),
  }, 'GameTick');
}

/**
 * Generate initial NPC relationships on first tick
 */
async function bootstrapInitialRelationships(): Promise<void> {
  logger.info('Generating initial NPC relationships...', undefined, 'GameTick');
  
  // Get all actors and organizations
  const [actors, organizations] = await Promise.all([
    prisma.actor.findMany(),
    prisma.organization.findMany(),
  ]);
  
  // Convert to Actor type
  const actorData = actors.map(a => ({
    id: a.id,
    name: a.name,
    description: a.description || undefined,
    domain: a.domain,
    personality: a.personality || undefined,
    affiliations: a.affiliations,
  }));
  
  const orgData = organizations.map(o => ({
    id: o.id,
    name: o.name,
    description: o.description,
    type: o.type as 'company' | 'media' | 'government',
    canBeInvolved: true,
  }));
  
  // Generate relationships
  const engine = new RelationshipEvolutionEngine();
  const created = await engine.generateInitialRelationships(actorData, orgData);
  
  logger.info(`✅ Generated ${created} initial relationships`, { count: created }, 'GameTick');
}

/**
 * Create initial news articles
 */
async function bootstrapNewsArticles(timestamp: Date, count: number): Promise<void> {
  logger.info(`Creating ${count} initial news articles...`, undefined, 'GameTick');
  
  // Get media organizations
  const newsOrgs = await prisma.organization.findMany({
    where: { type: 'media' },
    take: 5,
  });
  
  if (newsOrgs.length === 0) {
    logger.warn('No media organizations found, skipping news bootstrap', undefined, 'GameTick');
    return;
  }
  
  // Sample news topics (realistic, varied)
  const sampleArticles = [
    {
      title: 'Markets Show Mixed Signals Amid Economic Uncertainty',
      summary: 'Investors navigate volatile conditions as key indicators point to divergent trends across major sectors and asset classes.',
      category: 'Finance',
      sentiment: 'neutral',
      biasScore: 0.0,
    },
    {
      title: 'Tech Industry Faces New Regulatory Scrutiny',
      summary: 'Government agencies announce enhanced oversight measures targeting major technology companies and their market practices.',
      category: 'Tech',
      sentiment: 'negative',
      biasScore: -0.3,
    },
    {
      title: 'Innovation in Clean Energy Accelerates',
      summary: 'Breakthrough developments in renewable energy technology promise significant advances toward sustainability goals.',
      category: 'Tech',
      sentiment: 'positive',
      biasScore: 0.5,
    },
    {
      title: 'Global Markets Digest Policy Changes',
      summary: 'Financial markets adjust to new policy frameworks as central banks signal potential shifts in monetary strategy.',
      category: 'Finance',
      sentiment: 'neutral',
      biasScore: 0.1,
    },
    {
      title: 'Corporate Investment Trends Shift',
      summary: 'Major corporations redirect capital allocation strategies in response to evolving market dynamics and opportunities.',
      category: 'Finance',
      sentiment: 'neutral',
      biasScore: 0.0,
    },
    {
      title: 'Technology Adoption Reaches New Milestone',
      summary: 'Enterprise software and cloud services see record adoption rates as digital transformation accelerates across industries.',
      category: 'Tech',
      sentiment: 'positive',
      biasScore: 0.4,
    },
    {
      title: 'Economic Indicators Point to Continued Growth',
      summary: 'Latest data releases suggest sustained expansion despite headwinds from global trade tensions and policy uncertainty.',
      category: 'Finance',
      sentiment: 'positive',
      biasScore: 0.3,
    },
    {
      title: 'Industry Leaders Navigate Changing Landscape',
      summary: 'Executives across sectors adapt strategies to address emerging challenges and capitalize on new market opportunities.',
      category: 'Business',
      sentiment: 'neutral',
      biasScore: 0.0,
    },
  ];
  
  // Create articles spread over last 24 hours
  for (let i = 0; i < count && i < sampleArticles.length; i++) {
    const article = sampleArticles[i];
    if (!article) continue;
    
    const org = newsOrgs[i % newsOrgs.length];
    if (!org) continue;
    
    const hoursAgo = Math.floor((i / count) * 24);
    const articleTimestamp = new Date(timestamp.getTime() - hoursAgo * 60 * 60 * 1000);

    // Transform content to replace real names with parody names
    const transformedSummary = await characterMappingService.transformText(article.summary);
    if (transformedSummary.replacementCount > 0) {
      logger.warn(`Fixed ${transformedSummary.replacementCount} real name(s) in bootstrap article`, {
        org: org.name,
        title: article.title,
      }, 'GameTick');
    }

    await db().createPostWithAllFields({
      id: await generateSnowflakeId(),
      type: 'article',
      content: transformedSummary.transformedText,
      fullContent: transformedSummary.transformedText, // Bootstrap articles use summary as full content
      articleTitle: article.title,
      category: article.category,
      sentiment: article.sentiment,
      biasScore: article.biasScore,
      authorId: org.id,
      gameId: 'continuous',
      dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
      timestamp: articleTimestamp,
    });
  }
  
  logger.info(`Created ${count} initial news articles`, undefined, 'GameTick');
}

/**
 * Bootstrap trending tags
 */
async function bootstrapTrending(): Promise<void> {
  logger.info('Bootstrapping trending tags...', undefined, 'GameTick');
  
  // Check if we have enough posts and tags
  const postCount = await prisma.post.count();
  const taggedPostCount = await prisma.post.count({
    where: { PostTag: { some: {} } },
  });
  
  logger.info('Post/tag status for trending', {
    totalPosts: postCount,
    taggedPosts: taggedPostCount,
    taggedPercentage: postCount > 0 ? Math.round((taggedPostCount / postCount) * 100) : 0,
  }, 'GameTick');
  
  // If we have tagged posts, calculate trending
  if (taggedPostCount >= 10) {
    await calculateTrendingTags();
    logger.info('Calculated trending from existing posts', undefined, 'GameTick');
    return;
  }
  
  // If we have posts but they're not tagged, tag them first
  if (postCount >= 10 && taggedPostCount < 10) {
    logger.info('Posts exist but not tagged, waiting for auto-tagging...', undefined, 'GameTick');
    logger.info('Trending will be calculated once posts are tagged', undefined, 'GameTick');
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
    
    // Create tag
    const tag = await prisma.tag.upsert({
      where: { name: tagData.name },
      update: {},
      create: {
        id: await generateSnowflakeId(),
        ...tagData,
        updatedAt: now,
      },
    });
    
    // Create trending entry
    const score = (sampleTags.length - i) * 10 + Math.random() * 5;
    
    await prisma.trendingTag.create({
      data: {
        id: await generateSnowflakeId(),
        tagId: tag.id,
        score,
        postCount: Math.floor(Math.random() * 10) + 5,
        rank: i + 1,
        windowStart: weekAgo,
        windowEnd: now,
        relatedContext: null,
      },
    });
  }
  
  logger.info(`Created ${sampleTags.length} sample trending tags`, undefined, 'GameTick');
}

import { generateEvents } from './services/event-generation-helpers';
import { generateNPCPost, generateOrgPost, generateOrgArticle } from './services/post-generation-helpers';

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
  const [actors, organizations, worldFactsContext] = await Promise.all([
    prisma.actor.findMany({
      take: 15,
      orderBy: { reputationPoints: 'desc' },
    }),
    prisma.organization.findMany({
      where: { type: 'media' },
      take: 5,
    }),
    worldFactsService.generatePromptContext(),
  ]);

  if (actors.length === 0 && organizations.length === 0) {
    logger.warn('No actors or organizations found for post generation', {}, 'GameTick');
    return { posts: 0, articles: 0 };
  }

  // Create a mixed pool of content creators
  interface ContentCreator {
    id: string;
    name: string;
    type: 'actor' | 'organization';
    data: typeof actors[number] | typeof organizations[number];
  }

  const creators: ContentCreator[] = [
    ...actors.map((actor: typeof actors[number]) => ({ 
      id: actor.id, 
      name: actor.name, 
      type: 'actor' as const,
      data: actor 
    })),
    ...organizations.map((org: typeof organizations[number]) => ({ 
      id: org.id, 
      name: org.name || 'Unknown Org', 
      type: 'organization' as const,
      data: org 
    })),
  ];

  // Shuffle to mix actors and orgs
  for (let i = creators.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [creators[i], creators[j]] = [creators[j]!, creators[i]!];
  }

  logger.info(`Generating ${postsToGenerate} mixed posts in parallel`, { 
    actorsAvailable: actors.length, 
    orgsAvailable: organizations.length,
    creatorsPoolSize: creators.length
  }, 'GameTick');

  // Generate posts with timestamps spread across the tick interval (60 seconds)
  const tickDurationMs = 60000; // 1 minute
  const timeSlotMs = tickDurationMs / postsToGenerate;

  // Generate all posts in parallel
  const postPromises = Array.from({ length: Math.min(postsToGenerate, creators.length) }, async (_, i) => {
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
    const timestampWithOffset = new Date(timestamp.getTime() + slotOffset + randomJitter);
    
    try {
      if (creator.type === 'actor') {
        const actor = creator.data as typeof actors[number];
        const success = await generateNPCPost(
          llm,
          actor,
          question,
          worldFactsContext,
          timestampWithOffset
        );
        return { posts: success ? 1 : 0, articles: 0 };
      } else {
        const org = creator.data as typeof organizations[number];
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
        } else {
          const success = await generateOrgPost(
            llm,
            org,
            question,
            worldFactsContext,
            timestampWithOffset
          );
          return { posts: success ? 1 : 0, articles: 0 };
        }
      }
    } catch (error) {
      logger.warn('Failed to generate mixed post', { 
        error: error instanceof Error ? error.message : String(error),
        creatorName: creator.name 
      }, 'GameTick');
      return { posts: 0, articles: 0 };
    }
  });

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

  logger.info('Mixed post generation complete', { 
    postsCreated, 
    articlesCreated,
    actorsAvailable: actors.length, 
    orgsAvailable: organizations.length,
    attempted: postPromises.length,
    successful: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }, 'GameTick');

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
  const recentEvents = await prisma.worldEvent.findMany({
    where: {
      timestamp: { 
        gte: twoHoursAgo,
        lte: now, // ✅ No future events
      },
      visibility: 'public',
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  // If no recent events, generate baseline articles about general topics
  if (recentEvents.length === 0) {
    logger.info('No recent events - generating baseline articles in parallel', {}, 'GameTick');
    const newsOrgs = await prisma.organization.findMany({
      where: { type: 'media' },
      take: 5,
    });
    
    if (newsOrgs.length === 0) {
      logger.warn('No news organizations found for baseline articles', {}, 'GameTick');
      return 0;
    }
    
    return await generateBaselineArticlesParallel(newsOrgs, timestamp, llm, deadlineMs);
  }

  // Get news organizations and actors in parallel
  const [newsOrgs, actors] = await Promise.all([
    prisma.organization.findMany({
      where: { type: 'media' },
    }),
    prisma.actor.findMany({
      take: 50,
      orderBy: { tier: 'asc' }, // Higher tier actors first
    }),
  ]);

  if (newsOrgs.length === 0) {
    logger.warn('No news organizations found for article generation', {}, 'GameTick');
    return 0;
  }

  if (actors.length === 0) {
    logger.warn('No actors found for article generation', {}, 'GameTick');
    return 0;
  }

  // Initialize article generator
  const articleGen = new ArticleGenerator(llm);

  // Generate up to 10 articles in parallel (increased from 3)
  const articlesToGenerate = Math.min(10, recentEvents.length);
  const eventsTocover = recentEvents.slice(0, articlesToGenerate);

  logger.info(`Generating ${articlesToGenerate} articles in parallel`, { 
    eventCount: recentEvents.length 
  }, 'GameTick');

  // Map organization and actor data once
  const organizations = newsOrgs.map((org: typeof newsOrgs[number]) => ({
    id: org.id,
    name: org.name || 'Unknown Organization',
    description: org.description || '',
    type: (org.type as 'company' | 'media' | 'government') || 'media',
    canBeInvolved: org.canBeInvolved,
    initialPrice: org.initialPrice || undefined,
    currentPrice: org.currentPrice || undefined,
  }));

  const actorList = actors
    .filter((a: typeof actors[number]) => a && a.id && a.name)
    .map((a: typeof actors[number]) => ({
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
  const recentArticles = await prisma.post.findMany({
    where: {
      type: 'article',
      timestamp: { gte: fourHoursAgo },
      deletedAt: null,
    },
    select: {
      articleTitle: true,
      content: true,
      timestamp: true,
    },
  });

  // Filter out events that already have articles
  const eventsToCover = eventsTocover.filter((event) => {
    // Check if articles already exist for this event
    // Match by checking if recent articles mention similar topics
    const eventKeywords = event.description.toLowerCase().split(/\s+/).slice(0, 5);
    const hasExistingArticle = recentArticles.some((article) => {
      const articleText = `${article.articleTitle || ''} ${article.content || ''}`.toLowerCase();
      // Check if article contains at least 2 keywords from the event
      const matchingKeywords = eventKeywords.filter((keyword) => 
        keyword.length > 3 && articleText.includes(keyword)
      );
      return matchingKeywords.length >= 2;
    });

    if (hasExistingArticle) {
      logger.debug('Skipping event - articles already exist', { eventId: event.id }, 'GameTick');
      return false;
    }
    return true;
  });

  logger.info(`Filtered events: ${eventsToCover.length}/${eventsTocover.length} events need articles`, {
    filtered: eventsToCover.length,
    total: eventsTocover.length,
  }, 'GameTick');

  // Generate articles in parallel with Promise.allSettled to handle failures gracefully
  const articlePromises = eventsToCover.map(async (event: {
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
      logger.debug('Skipping article due to deadline', { eventId: event.id }, 'GameTick');
      return 0;
    }

    const worldEvent: WorldEvent = {
        id: event.id,
        type: event.eventType as WorldEvent['type'],
        description: event.description,
        actors: event.actors as string[] || [],
        relatedQuestion: event.relatedQuestion || undefined,
        visibility: event.visibility as WorldEvent['visibility'],
        day: event.dayNumber || 0,
      };

      const articles = await articleGen.generateArticlesForEvent(
        worldEvent,
        organizations,
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
        const transformedSummary = await characterMappingService.transformText(article.summary || '');
        const transformedContent = await characterMappingService.transformText(article.content || '');
        const transformedTitle = await characterMappingService.transformText(article.title || 'Untitled');
        if (transformedSummary.replacementCount > 0 || transformedContent.replacementCount > 0 || transformedTitle.replacementCount > 0) {
          logger.warn(`Fixed ${transformedSummary.replacementCount + transformedContent.replacementCount + transformedTitle.replacementCount} real name(s) in event article`, {
            eventId: event.id,
            title: article.title,
          }, 'GameTick');
        }

        await db().createPostWithAllFields({
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
  });

  // Wait for all article generation to complete
  const results = await Promise.allSettled(articlePromises);
  
  // Count successful articles and log failures
  const articlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    } else {
      logger.error(
        'Failed to generate article from event',
        { error: result.reason },
        'GameTick'
      );
      return sum;
    }
  }, 0);

  logger.info(`Parallel article generation complete`, { 
    articlesCreated,
    attempted: articlesToGenerate,
    successful: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }, 'GameTick');

  return articlesCreated;
}

/**
 * Generate baseline articles in parallel with game context
 * Generates articles about active questions, actors, or companies instead of generic topics
 */
async function generateBaselineArticlesParallel(
  newsOrgs: Array<{ id: string; name: string | null; description: string | null }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  // Gather game context for relevant articles
  const [activeQuestions, actors, companies, worldFactsContext, worldContext] = await Promise.all([
    prisma.question.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.actor.findMany({
      where: {
        role: { in: ['main', 'supporting'] },
      },
      take: 10,
      select: {
        id: true,
        name: true,
        description: true,
        domain: true,
        tier: true,
      },
    }),
    prisma.organization.findMany({
      where: { type: 'company' },
      take: 10,
      select: {
        id: true,
        name: true,
        description: true,
        currentPrice: true,
        initialPrice: true,
      },
    }),
    worldFactsService.generatePromptContext(),
    (async () => {
      const { generateWorldContext } = await import('@/prompts');
      return generateWorldContext({ maxActors: 30, realityGroundingLevel: 'concise' });
    })(),
  ]);

  // Build article topics from game context
  const articleTopics: Array<{ topic: string; category: string; context: string }> = [];

  // Add topics about active questions
  for (const question of activeQuestions.slice(0, 3)) {
    articleTopics.push({
      topic: question.text,
      category: 'finance',
      context: `prediction market question: "${question.text}"`,
    });
  }

  // Add topics about high-tier actors
  for (const actor of actors.filter(a => a.tier === 'S_TIER' || a.tier === 'A_TIER').slice(0, 2)) {
    const domainStr = Array.isArray(actor.domain) ? actor.domain[0] : actor.domain;
    const domain = domainStr || 'tech';
    articleTopics.push({
      topic: `${actor.name} and their recent activities`,
      category: domain === 'tech' ? 'tech' : 'business',
      context: `${actor.name} (${actor.description || 'prominent figure'}) in ${domain}`,
    });
  }

  // Add topics about companies with price movements
  for (const company of companies.slice(0, 2)) {
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
      { topic: 'recent developments in prediction markets', category: 'finance', context: 'prediction markets and trading activity' },
      { topic: 'tech industry trends and major players', category: 'tech', context: 'technology sector developments' }
    );
  }

  const articlesToGenerate = Math.min(5, newsOrgs.length, articleTopics.length);
  
  logger.info(`Generating ${articlesToGenerate} baseline articles with game context`, { 
    topicsFromQuestions: activeQuestions.length,
    topicsFromActors: actors.length,
    topicsFromCompanies: companies.length,
  }, 'GameTick');

  // Generate all articles in parallel
  const articlePromises = Array.from({ length: articlesToGenerate }, async (_, i) => {
    if (Date.now() > deadlineMs) {
      logger.debug('Skipping baseline article due to deadline', { index: i }, 'GameTick');
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
      
      // Only use Wandb-specific model if provider is Wandb, otherwise use default
      const baselineModel = llm.getProvider() === 'wandb' ? 'moonshotai/kimi-k2-instruct-0905' : undefined;
      const response = await llm.generateJSON<{ title: string; summary: string; article: string } | { response: { title: string; summary: string; article: string } }>(
        prompt,
        { properties: { title: { type: 'string' }, summary: { type: 'string' }, article: { type: 'string' } }, required: ['title', 'summary', 'article'] },
        { temperature: 0.7, maxTokens: 8000, ...(baselineModel ? { model: baselineModel } : {}), format: 'xml' }
      );
      
      // Handle XML structure
      const baselineArticle = 'response' in response && response.response 
        ? response.response as { title: string; summary: string; article: string }
        : response as { title: string; summary: string; article: string };
      
      if (!baselineArticle.title || !baselineArticle.summary || !baselineArticle.article) return 0;

      const summary = baselineArticle.summary.trim();
      const articleTitle = baselineArticle.title.trim();
      const articleBody = baselineArticle.article.trim();

      if (articleBody.length < 400) {
        logger.warn('Baseline article body too short', { orgId: org.id, length: articleBody.length }, 'GameTick');
        return 0;
      }
      
      // Calculate timestamp with jitter
      const timeSlotMs = 60000 / articlesToGenerate;
      const slotOffset = i * timeSlotMs;
      const randomJitter = Math.random() * timeSlotMs * 0.8;
      const timestampWithOffset = new Date(timestamp.getTime() + slotOffset + randomJitter);

      // Transform content to replace real names with parody names
      const transformedSummary = await characterMappingService.transformText(summary);
      const transformedBody = await characterMappingService.transformText(articleBody);
      const transformedTitle = await characterMappingService.transformText(articleTitle);
      if (transformedSummary.replacementCount > 0 || transformedBody.replacementCount > 0 || transformedTitle.replacementCount > 0) {
        logger.warn(`Fixed ${transformedSummary.replacementCount + transformedBody.replacementCount + transformedTitle.replacementCount} real name(s) in baseline article`, {
          org: org.name,
          topic: topicData.topic,
        }, 'GameTick');
      }

      await db().createPostWithAllFields({
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
      
      logger.debug('Created baseline article with game context', { 
        org: org.name, 
        topic: topicData.topic,
        category: topicData.category,
      }, 'GameTick');
      return 1;
  });
  
  // Wait for all baseline articles to complete
  const results = await Promise.allSettled(articlePromises);
  
  const articlesCreated = results.reduce((sum, result) => {
    if (result.status === 'fulfilled') {
      return sum + result.value;
    } else {
      logger.warn('Failed to generate baseline article', { error: result.reason }, 'GameTick');
      return sum;
    }
  }, 0);
  
  logger.info('Parallel baseline article generation complete', { 
    articlesCreated,
    attempted: articlesToGenerate,
    topicsUsed: articleTopics.length,
  }, 'GameTick');
  
  return articlesCreated;
}

// generateEvents moved to services/event-generation-helpers.ts


/**
 * Update market prices based on NPC trading activity
 * 
 * Prices are derived from total NPC holdings (investment-based pricing):
 * - More NPCs buying/holding = higher price
 * - NPCs selling = lower price
 * - Price reflects actual capital deployed, not just sentiment
 */
async function updateMarketPricesFromTrades(
  _timestamp: Date,
  executionResult: TradingExecutionResult
): Promise<number> {
  if (!executionResult.executedTrades.length) {
    return 0;
  }

  // Get all companies with current holdings
  const companies = await prisma.organization.findMany({
    where: { type: 'company' },
    select: {
      id: true,
      name: true,
      currentPrice: true,
      initialPrice: true,
    },
  });

  type CompanyData = typeof companies[0];
  // Use raw org IDs as keys since positions now store raw IDs
  const companyMap = new Map<string, CompanyData>(
    companies.map((c: CompanyData) => [c.id, c])
  );

  // Calculate total holdings for each company from ALL positions
  const holdingsByTicker = new Map<string, number>();
  
  const allPositions = await prisma.poolPosition.findMany({
    where: {
      marketType: 'perp',
      closedAt: null,
      ticker: { not: null },
    },
    select: {
      ticker: true,
      side: true,
      size: true,
    },
  });

  for (const pos of allPositions) {
    if (!pos.ticker) continue;
    
    const current = holdingsByTicker.get(pos.ticker) || 0;
    // Long positions add to holdings, short positions subtract
    const delta = pos.side === 'long' ? pos.size : -pos.size;
    holdingsByTicker.set(pos.ticker, current + delta);
  }

  let updates = 0;
  const priceUpdatesForChain: Array<{ organizationId: string; newPrice: number }> = [];

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

    await prisma.organization.update({
      where: { id: company.id },
      data: { currentPrice: newPrice },
    });

    await db().recordPriceUpdate(company.id, newPrice, change, changePercent);

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
    const { PriceUpdateService } = await import('@/lib/services/price-update-service');
    await PriceUpdateService.applyUpdates(
      priceUpdatesForChain.map(u => ({
        ...u,
        source: 'npc_trade',
        reason: 'NPC trading price impact',
      }))
    ).catch((error) => {
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
  return await questionManager.generateQuestionsForContinuousGame(count, deadlineMs);
}

/**
 * Resolve question payouts
 */
export async function resolveQuestionPayouts(questionNumber: number): Promise<void> {
  const question = await prisma.question.findFirst({
    where: { questionNumber },
  });

  if (!question) return;

  const market =
    (await prisma.market.findUnique({ where: { id: question.id } })) ||
    (await prisma.market.findFirst({
      where: { question: question.text },
    }));

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

  const { positionUpdates, totalPayout } = await prisma.$transaction(async (tx) => {
    const positions = await tx.position.findMany({
      where: {
        marketId: market.id,
        status: { not: 'resolved' },
      },
    });

    const updates: Array<{
      userId: string;
      pnl: number;
      positionId: string;
    }> = [];

    let payoutAccumulator = 0;

    for (const position of positions) {
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
          `Prediction market payout: ${market.question}`,
          market.id,
          tx
        );
        payoutAccumulator += payout;
      }

      await tx.position.update({
        where: { id: position.id },
        data: {
          shares: new Prisma.Decimal(0),
          amount: new Prisma.Decimal(costBasis),
          pnl: new Prisma.Decimal(pnl),
          status: 'resolved',
          outcome: didWin,
          resolvedAt: resolutionTimestamp,
          questionId: question.questionNumber,
        },
      });

      updates.push({
        userId: position.userId,
        pnl,
        positionId: position.id,
      });
    }

    const liquidityReduction = Math.min(
      payoutAccumulator,
      Number(market.liquidity ?? 0)
    );

    await tx.market.update({
      where: { id: market.id },
      data: {
        resolved: true,
        resolution: winningSide,
        updatedAt: resolutionTimestamp,
        liquidity:
          liquidityReduction > 0
            ? {
                decrement: new Prisma.Decimal(liquidityReduction),
              }
            : undefined,
      },
    });

    await tx.question.update({
      where: { id: question.id },
      data: {
        status: 'resolved',
        resolvedOutcome: winningSide,
        updatedAt: resolutionTimestamp,
      },
    });

    return {
      positionUpdates: updates,
      totalPayout: liquidityReduction,
    };
  });

  for (const update of positionUpdates) {
    if (update.pnl === 0) continue;
    try {
      await WalletService.recordPnL(
        update.userId,
        update.pnl,
        'prediction_resolve',
        market.id
      );
    } catch (error) {
      logger.error(
        'Failed to record PnL for resolved prediction position',
        {
          error: error instanceof Error ? error.message : String(error),
          userId: update.userId,
          positionId: update.positionId,
        },
        'GameTick'
      );
    }
  }

  try {
    if (
      process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA &&
      process.env.DEPLOYER_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_RPC_URL
    ) {
      await ReputationService.updateReputationForResolvedMarket({
        marketId: market.id,
        outcome: winningSide,
      });
    } else {
      logger.debug(
        'Skipping reputation update due to missing configuration',
        { marketId: market.id },
        'GameTick'
      );
    }
  } catch (error) {
    logger.error(
      'Failed to push reputation update on-chain',
      {
        error: error instanceof Error ? error.message : String(error),
        marketId: market.id,
      },
      'GameTick'
    );
  }

  // Resolve market on-chain if onChainMarketId exists
  let onChainResolutionTxHash: string | null = null;
  if (market.onChainMarketId && !market.onChainResolved) {
    try {
      onChainResolutionTxHash = await resolveMarketOnChain(
        market.onChainMarketId,
        winningSide ? 1 : 0 // Binary market: true = 1, false = 0
      );
    } catch (error) {
      logger.error(
        'Failed to resolve market on-chain',
        {
          error: error instanceof Error ? error.message : String(error),
          marketId: market.id,
          onChainMarketId: market.onChainMarketId,
          questionNumber,
        },
        'GameTick'
      );
    }
  }

  if (onChainResolutionTxHash) {
    await prisma.market.update({
      where: { id: market.id },
      data: {
        onChainResolved: true,
        onChainResolutionTxHash,
      },
    });
  }

  const resolvedMarket = await prisma.market.findUnique({
    where: { id: market.id },
  });

  const resolvedYesShares = Number(resolvedMarket?.yesShares ?? market.yesShares ?? 0);
  const resolvedNoShares = Number(resolvedMarket?.noShares ?? market.noShares ?? 0);
  let yesPrice = 0.5;
  let noPrice = 0.5;
  if (resolvedYesShares + resolvedNoShares > 0) {
    yesPrice = PredictionPricing.getCurrentPrice(resolvedYesShares, resolvedNoShares, 'yes');
    noPrice = PredictionPricing.getCurrentPrice(resolvedYesShares, resolvedNoShares, 'no');
  } else {
    yesPrice = winningSide ? 1 : 0;
    noPrice = winningSide ? 0 : 1;
  }

  await PredictionPriceHistoryService.recordSnapshot({
    marketId: market.id,
    yesPrice,
    noPrice,
    yesShares: resolvedYesShares,
    noShares: resolvedNoShares,
    liquidity: Number(resolvedMarket?.liquidity ?? 0),
    eventType: 'resolution',
    source: 'system',
  }).catch((error) => {
    logger.warn('Failed to record price history for resolution', { error, marketId: market.id }, 'GameTick');
  });

  await invalidateAfterPredictionTrade(market.id).catch((error) => {
    logger.warn('Failed to invalidate prediction cache after resolution', { error, marketId: market.id }, 'GameTick');
  });

  PredictionMarketEventService.emitResolution({
    marketId: market.id,
    winningSide: winningSide ? 'yes' : 'no',
    yesShares: Number(resolvedMarket?.yesShares ?? market.yesShares ?? 0),
    noShares: Number(resolvedMarket?.noShares ?? market.noShares ?? 0),
    liquidity: Number(resolvedMarket?.liquidity ?? 0),
    totalPayout,
    timestamp: resolutionTimestamp.toISOString(),
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
  const diamondAddress = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS;
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

  if (!diamondAddress || !deployerPrivateKey || !rpcUrl) {
    throw new Error('Missing blockchain configuration');
  }

  const { createPublicClient, createWalletClient, http, parseAbi } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { baseSepolia } = await import('viem/chains');
  const { PREDICTION_MARKET_ABI } = await import('@/lib/web3/abis');

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
  // Note: winningOutcome must be uint8 (0 or 1 for binary markets)
  const txHash = await walletClient.writeContract({
    address: diamondAddress as `0x${string}`,
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
  questions: Array<{ id: string; questionNumber: number; text: string; outcome: boolean }>
): Promise<{ committed: number; errors: number }> {
  let committed = 0;
  let errors = 0;

  // Check if oracle is configured
  if (!process.env.NEXT_PUBLIC_BABYLON_ORACLE || !process.env.ORACLE_PRIVATE_KEY) {
    logger.info('Oracle not configured, skipping commitments', undefined, 'GameTick');
    return { committed: 0, errors: 0 };
  }

  try {
    const oracleService = getOracleService();

    // Health check
    const health = await oracleService.healthCheck();
    if (!health.healthy) {
      logger.error(`Oracle health check failed: ${health.error}`, undefined, 'GameTick');
      return { committed: 0, errors: questions.length };
    }

    // Batch commit games
    const batch = questions.map(q => ({
      questionId: q.id,
      questionNumber: q.questionNumber,
      question: q.text,
      category: 'general', // Could extract from question text
      outcome: q.outcome
    }));

    const result = await oracleService.batchCommitGames(batch);

    // Update questions with oracle data
    for (const success of result.successful) {
      await prisma.question.update({
        where: { id: success.questionId },
        data: {
          oracleSessionId: success.sessionId,
          oracleCommitment: success.commitment,
          oracleCommitTxHash: success.txHash,
          oracleCommitBlock: success.blockNumber || null
        }
      });
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
  } catch (error) {
    logger.error('Oracle batch commit failed', { error }, 'GameTick');
    errors = questions.length;
  }

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
  if (!process.env.NEXT_PUBLIC_BABYLON_ORACLE || !process.env.ORACLE_PRIVATE_KEY) {
    logger.info('Oracle not configured, skipping reveals', undefined, 'GameTick');
    return { revealed: 0, errors: 0 };
  }

  try {
    const oracleService = getOracleService();

    // Health check
    const health = await oracleService.healthCheck();
    if (!health.healthy) {
      logger.error(`Oracle health check failed: ${health.error}`, undefined, 'GameTick');
      return { revealed: 0, errors: questions.length };
    }

    // Batch reveal games
    const batch = questions.map(q => ({
      questionId: q.id,
      outcome: q.outcome,
      winners: [], // Could get from positions
      totalPayout: BigInt(0) // Could calculate from positions
    }));

    const result = await oracleService.batchRevealGames(batch);

    // Update questions with oracle data
    for (const success of result.successful) {
      await prisma.question.update({
        where: { id: success.questionId },
        data: {
          oracleRevealTxHash: success.txHash,
          oracleRevealBlock: success.blockNumber || null,
          oraclePublishedAt: new Date()
        }
      });
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
  } catch (error) {
    logger.error('Oracle batch reveal failed', { error }, 'GameTick');
    errors = questions.length;
  }

  return { revealed, errors };
}
/**
 * Update widget caches
 * This pre-generates and caches widget data to improve performance
 */
async function updateWidgetCaches(): Promise<number> {
  let cachesUpdated = 0;

  const companies = await db().getCompanies();

  if (!companies || companies.length === 0) {
    logger.warn('No companies found for widget cache update', {}, 'GameTick');
    return 0;
  }

  const perpMarketsWithStats = await Promise.all(
    companies
      .filter((company: typeof companies[number]) => company && company.id && company.name) // Filter out invalid companies
      .map(async (company: typeof companies[number]) => {
        const currentPrice =
          company.currentPrice || company.initialPrice || 100;

        const priceHistory = await db().getPriceHistory(company.id, 1440);

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
        (a: typeof perpMarketsWithStats[number], b: typeof perpMarketsWithStats[number]) => 
          Math.abs(b.changePercent24h) - Math.abs(a.changePercent24h)
      )
      .slice(0, 3);

    // 2. Get top 3 pool gainers
    const pools = await prisma.pool.findMany({
      where: { isActive: true },
      include: {
        Actor: {
          select: { name: true },
        },
      },
      orderBy: { totalValue: 'desc' },
    });

    const poolsWithReturn = pools
      .filter((pool: typeof pools[number]) => pool && pool.id && pool.name) // Filter out invalid pools
      .map((pool: typeof pools[number]) => {
        const totalDeposits = parseFloat(pool.totalDeposits.toString());
        const totalValue = parseFloat(pool.totalValue.toString());
        const totalReturn =
          totalDeposits > 0
            ? ((totalValue - totalDeposits) / totalDeposits) * 100
            : 0;

        // Extract Actor name
        const npcActorName = pool.Actor?.name || 'Unknown';

        return {
          id: pool.id,
          name: pool.name,
          npcActorName,
          totalReturn,
          totalValue,
        };
      });

    const topPoolGainers = poolsWithReturn
      .sort((a: typeof poolsWithReturn[number], b: typeof poolsWithReturn[number]) => 
        b.totalReturn - a.totalReturn
      )
      .slice(0, 3);

    // 3. Get top 3 questions by time-weighted volume
    const activeMarkets = await prisma.market.findMany({
      where: {
        resolved: false,
        endDate: { gte: new Date() },
      },
      select: {
        id: true,
        question: true,
        yesShares: true,
        noShares: true,
        createdAt: true,
      },
    });

    const marketsWithTimeWeightedVolume = activeMarkets.map((market: typeof activeMarkets[number]) => {
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
    });

    const topVolumeQuestions = marketsWithTimeWeightedVolume
      .sort((a: typeof marketsWithTimeWeightedVolume[number], b: typeof marketsWithTimeWeightedVolume[number]) => 
        b.timeWeightedScore - a.timeWeightedScore
      )
      .slice(0, 3);

    // Update cache
    const cacheData = {
      topPerpGainers,
      topPoolGainers,
      topVolumeQuestions,
      lastUpdated: new Date().toISOString(),
    };

  await prisma.widgetCache.upsert({
    where: { widget: 'markets' },
    create: {
      widget: 'markets',
      data: cacheData as object,
    },
    update: {
      data: cacheData as object,
      updatedAt: new Date(),
    },
  });

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
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Import and call trending calculation directly
  const { calculateTrendingTags } = await import('./services/trending-calculation-service');
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
  const lastHeadline = await prisma.rSSHeadline.findFirst({
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true },
  });

  if (!lastHeadline || !lastHeadline.fetchedAt) {
    return true; // Never updated before
  }

  const timeSinceLastUpdate = Date.now() - lastHeadline.fetchedAt.getTime();
  return timeSinceLastUpdate >= WORLD_FACTS_UPDATE_INTERVAL_MS;
}

/**
 * Update world facts if needed (called from game tick)
 * Only updates if it's been 24+ hours since the last update
 * 
 * @returns Object with updated status and optional stats
 */
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

  logger.info('🌍 Starting world facts update from game tick', undefined, 'GameTick');

  try {
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
    const untransformedHeadlines = await rssFeedService.getUntransformedHeadlines(20); // Process 20 at a time
    
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
    logger.info(`Cleaned up ${cleaned} old headlines`, { count: cleaned }, 'GameTick');

    const duration = Date.now() - startTime;
    logger.info('✅ World facts update completed', {
      duration: `${duration}ms`,
      feedsFetched: feedResult.fetched,
      newHeadlines: feedResult.stored,
      parodiesGenerated: parodies.length,
      headlinesCleaned: cleaned,
    }, 'GameTick');

    return {
      updated: true,
      stats: {
        feedsFetched: feedResult.fetched,
        newHeadlines: feedResult.stored,
        parodiesGenerated: parodies.length,
        headlinesCleaned: cleaned,
      },
    };
  } catch (error) {
    logger.error('World facts update failed', { error }, 'GameTick');
    return { updated: false };
  }
}

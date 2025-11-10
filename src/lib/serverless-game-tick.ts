/**
 * Serverless Game Tick Logic
 * 
 * Lightweight game content generation for Vercel Cron Jobs.
 * Executes a single "tick" of game logic without persistent processes.
 * 
 * This replaces the continuous daemon with stateless, scheduled execution.
 * 
 * ✅ Vercel-compatible: No filesystem access, completes in <60s
 */

import { prisma } from './prisma';
import { logger } from './logger';
import { BabylonLLMClient } from '@/generator/llm/openai-client';
import { db } from './database-service';
import { calculateTrendingIfNeeded } from './services/trending-calculation-service';
import { MarketContextService } from './services/market-context-service';
import { MarketDecisionEngine } from '@/engine/MarketDecisionEngine';
import { TradeExecutionService } from './services/trade-execution-service';
import { generateSnowflakeId } from './snowflake';
import type { Prisma } from '@prisma/client';
import type { ExecutionResult } from '@/types/market-decisions';

export interface GameTickResult {
  postsCreated: number;
  eventsCreated: number;
  articlesCreated: number;
  marketsUpdated: number;
  questionsResolved: number;
  questionsCreated: number;
  widgetCachesUpdated: number;
  trendingCalculated: boolean;
}

/**
 * Execute a single game tick
 * Designed to complete within Vercel's 60-second limit
 */
export async function executeGameTick(): Promise<GameTickResult> {
  const timestamp = new Date();
  const startedAt = Date.now();
  const budgetMs = Number(process.env.GAME_TICK_BUDGET_MS || 45000);
  const deadline = startedAt + budgetMs;

  logger.info('Executing game tick', { timestamp: timestamp.toISOString() }, 'GameTick');

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
  };

  try {
    // Initialize LLM client with error handling
    const llmClient = (() => {
      try {
        return new BabylonLLMClient();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        logger.error('Failed to initialize LLM client', { 
          error: errorMessage,
          stack: errorStack 
        }, 'GameTick');
        return null;
      }
    })();

    // Get active questions from database
    const activeQuestions = await prisma.question.findMany({
      where: {
        status: 'active',
      },
    });

    logger.info(`Found ${activeQuestions.length} active questions`, { count: activeQuestions.length }, 'GameTick');

    const questionsToResolve = activeQuestions.filter(q => {
      if (!q.resolutionDate) return false;
      const resolutionDate = new Date(q.resolutionDate);
      return resolutionDate <= timestamp;
    });

    if (questionsToResolve.length > 0) {
      try {
        logger.info(`Resolving ${questionsToResolve.length} questions`, { count: questionsToResolve.length }, 'GameTick');
        
        await prisma.question.updateMany({
          where: {
            id: { in: questionsToResolve.map(q => q.id) },
          },
          data: { status: 'resolved' },
        });
        
        for (const question of questionsToResolve) {
        try {
          await resolveQuestionPayouts(question.questionNumber);
          result.questionsResolved++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error('Failed to resolve question payout', { 
            error: errorMessage, 
            questionNumber: question.questionNumber 
          }, 'GameTick');
        }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Failed to resolve questions', { error: errorMessage }, 'GameTick');
      }
    }

    // Each generation function is isolated with its own error handling
    // Combined post and article generation to mix NPCs and orgs
    if (llmClient) {
      if (Date.now() < deadline) {
        try {
          const { posts, articles } = await generateMixedPosts(activeQuestions.slice(0, 3), timestamp, llmClient, deadline);
          result.postsCreated = posts;
          result.articlesCreated = articles;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error('Failed to generate posts', { error: errorMessage }, 'GameTick');
        }
      } else {
        logger.warn('Skipping post generation – tick budget exceeded', { budgetMs }, 'GameTick');
      }
    } else {
      logger.warn('Skipping post generation – LLM unavailable', undefined, 'GameTick');
    }

    try {
      const eventsGenerated = await generateEvents(activeQuestions.slice(0, 3), timestamp);
      result.eventsCreated = eventsGenerated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to generate events', { error: errorMessage }, 'GameTick');
    }

    // Generate and execute NPC trading decisions
    if (llmClient && Date.now() < deadline) {
      try {
        const contextService = new MarketContextService();
        const decisionEngine = new MarketDecisionEngine(llmClient, contextService);
        const executionService = new TradeExecutionService();
        
        const marketDecisions = await decisionEngine.generateBatchDecisions();
        const executionResult = await executionService.executeDecisionBatch(marketDecisions);
        
        logger.info(`NPC Trading: ${executionResult.successfulTrades} trades executed`, {
          successful: executionResult.successfulTrades,
          failed: executionResult.failedTrades,
          holds: executionResult.holdDecisions,
        }, 'GameTick');
        
        // Update prices based on NPC trades
        const marketsUpdated = await updateMarketPricesFromTrades(executionResult, timestamp);
        result.marketsUpdated = marketsUpdated;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Failed to generate/execute market decisions', { error: errorMessage }, 'GameTick');
      }
    } else if (!llmClient) {
      logger.warn('Skipping market decisions – LLM unavailable', undefined, 'GameTick');
    } else {
      logger.warn('Skipping market decisions – tick budget exceeded', { budgetMs }, 'GameTick');
    }

    try {
      const currentActiveCount = activeQuestions.length - result.questionsResolved;
      if (currentActiveCount < 10) {
        if (llmClient && Date.now() < deadline) {
          const questionsGenerated = await generateNewQuestions(Math.min(3, 15 - currentActiveCount), llmClient, deadline);
          result.questionsCreated = questionsGenerated;
        } else if (!llmClient) {
          logger.warn('Skipping question generation – LLM unavailable', undefined, 'GameTick');
        } else {
          logger.warn('Skipping question generation – tick budget exceeded', { budgetMs }, 'GameTick');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to generate new questions', { error: errorMessage }, 'GameTick');
    }

    try {
      await prisma.game.updateMany({
        where: { isContinuous: true },
        data: {
          lastTickAt: timestamp,
          updatedAt: timestamp,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to update game state', { error: errorMessage }, 'GameTick');
    }

    try {
      const cachesUpdated = await updateWidgetCaches();
      result.widgetCachesUpdated = cachesUpdated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to update widget caches', { error: errorMessage }, 'GameTick');
    }

    // Calculate trending tags if needed (checks 30-minute interval internally)
    try {
      const trendingCalculated = await calculateTrendingIfNeeded();
      result.trendingCalculated = trendingCalculated;
      if (trendingCalculated) {
        logger.info('Trending tags recalculated', {}, 'GameTick');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to calculate trending tags', { error: errorMessage }, 'GameTick');
      // Don't fail the entire tick if trending calculation fails
    }

    const durationMs = Date.now() - startedAt;
    logger.info('Game tick completed', { ...result, durationMs }, 'GameTick');

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
 * Generate mixed posts from both NPCs and organizations
 * This ensures posts are interleaved rather than chunked by type
 */
async function generateMixedPosts(
  questions: Array<{ id: string; text: string; questionNumber: number }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<{ posts: number; articles: number }> {
  if (questions.length === 0) return { posts: 0, articles: 0 };

  const postsToGenerate = 8; // Mix of NPC posts and org articles
  let postsCreated = 0;
  let articlesCreated = 0;

  // Get actors (NPCs) and organizations in parallel
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
    ...actors.map(actor => ({ 
      id: actor.id, 
      name: actor.name, 
      type: 'actor' as const,
      data: actor 
    })),
    ...organizations.map(org => ({ 
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

  // Generate posts with timestamps spread across the tick interval (60 seconds)
  const tickDurationMs = 60000; // 1 minute
  const timeSlotMs = tickDurationMs / postsToGenerate;

  for (let i = 0; i < postsToGenerate && i < creators.length; i++) {
    // Check deadline before each post generation
    if (Date.now() > deadlineMs) {
      logger.warn('Post generation aborted due to tick budget limit', { generated: postsCreated }, 'GameTick');
      break;
    }

    const creator = creators[i];
    const question = questions[i % questions.length];
    
    // Defensive checks
    if (!creator || !question || !question.text) {
      logger.warn('Missing creator or question data', { creatorIndex: i }, 'GameTick');
      continue;
    }

    try {
      // Calculate timestamp for this post (spread throughout the minute)
      const slotOffset = i * timeSlotMs;
      const randomJitter = Math.random() * timeSlotMs * 0.8; // 80% of slot for randomness
      const timestampWithOffset = new Date(timestamp.getTime() + slotOffset + randomJitter);

      if (creator.type === 'actor') {
        // Generate NPC post
        const prompt = `You are ${creator.name}. Write a brief social media post (max 200 chars) about this prediction market question: "${question.text}". Be opinionated and entertaining.

Return your response as JSON in this exact format:
{
  "post": "your post content here"
}`;

        const response = await llm.generateJSON<{ post: string }>(
          prompt,
          { 
            properties: {
              post: { type: 'string' }
            },
            required: ['post'] 
          },
          { temperature: 0.9, maxTokens: 200 }
        );

        if (!response.post) {
          logger.warn('Empty post generated', { creatorIndex: i, creatorName: creator.name }, 'GameTick');
          continue;
        }

        await prisma.post.create({
          data: {
            id: generateSnowflakeId(),
            content: response.post,
            authorId: creator.id,
            gameId: 'continuous',
            dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
            timestamp: timestampWithOffset,
          },
        });
        postsCreated++;
        logger.debug('Created NPC post', { actor: creator.name, timestamp: timestampWithOffset }, 'GameTick');

      } else {
        // Generate organization article
        const prompt = `You are ${creator.name}, a news organization. Write a brief news headline and summary (max 300 chars total) about this prediction market: "${question.text}". Be professional and informative.

Return your response as JSON in this exact format:
{
  "title": "news headline here",
  "summary": "brief summary here"
}`;

        const response = await llm.generateJSON<{ title: string; summary: string }>(
          prompt,
          { 
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['title', 'summary'] 
          },
          { temperature: 0.7, maxTokens: 300 }
        );

        if (!response.title || !response.summary) {
          logger.warn('Empty article generated', { creatorIndex: i, creatorName: creator.name }, 'GameTick');
          continue;
        }

        await prisma.post.create({
          data: {
            id: generateSnowflakeId(),
            type: 'article',
            content: response.summary,
            articleTitle: response.title,
            authorId: creator.id,
            gameId: 'continuous',
            dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
            timestamp: timestampWithOffset,
          },
        });
        postsCreated++;
        articlesCreated++;
        logger.debug('Created org article', { org: creator.name, timestamp: timestampWithOffset }, 'GameTick');
      }
    } catch (error) {
      logger.error('Failed to generate post', { 
        error, 
        creatorIndex: i, 
        creatorId: creator.id, 
        creatorType: creator.type,
        questionId: question.id 
      }, 'GameTick');
      // Continue with next post instead of failing entire batch
    }
  }

  logger.info('Mixed post generation complete', { 
    postsCreated, 
    articlesCreated,
    actorsAvailable: actors.length, 
    orgsAvailable: organizations.length 
  }, 'GameTick');

  return { posts: postsCreated, articles: articlesCreated };
}

/**
 * Generate events
 */
async function generateEvents(questions: Array<{ id: string; text: string; questionNumber: number }>, timestamp: Date): Promise<number> {
  if (questions.length === 0) return 0;

  let eventsCreated = 0;
  const eventsToGenerate = Math.min(2, questions.length);

  for (let i = 0; i < eventsToGenerate; i++) {
    try {
      const question = questions[i];
      
      if (!question || !question.text) {
        logger.warn('Missing question data for event', { questionIndex: i }, 'GameTick');
        continue;
      }

      await prisma.worldEvent.create({
        data: {
          eventType: 'announcement',
          description: `Development regarding: ${question.text}`,
          actors: [],
          relatedQuestion: question.questionNumber,
          visibility: 'public',
          gameId: 'continuous',
          dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
          timestamp: timestamp,
        },
      });
      eventsCreated++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to generate event', { 
        error: errorMessage, 
        questionIndex: i 
      }, 'GameTick');
      // Continue with next event
    }
  }

  return eventsCreated;
}


/**
 * Update market prices based on NPC trading activity
 * Prices move based on net sentiment from trades
 */
async function updateMarketPricesFromTrades(
  executionResult: ExecutionResult,
  timestamp: Date
): Promise<number> {
  const executionService = new TradeExecutionService();
  const impacts = await executionService.getTradeImpacts(executionResult.executedTrades);
  
  const updates: Array<{ id: string; newPrice: number; oldPrice: number; change: number }> = [];
  
  for (const [key, impact] of impacts) {
    // Handle perpetual price updates (ticker-based)
    if (key.match(/^[A-Z]+$/)) {
      const ticker = key;
      const org = await prisma.organization.findFirst({
        where: {
          id: { contains: ticker.toLowerCase() },
          type: 'company',
        },
      });
      
      if (!org?.currentPrice) continue;
      
      const totalVolume = impact.longVolume + impact.shortVolume;
      if (totalVolume === 0) continue;
      
      // Calculate price impact
      // Net long sentiment = price goes up
      // Net short sentiment = price goes down
      const volumeImpact = Math.min(totalVolume / 10000, 0.05); // Cap at 5%
      const priceChange = impact.netSentiment * volumeImpact;
      
      const oldPrice = org.currentPrice;
      const newPrice = oldPrice * (1 + priceChange);
      
      updates.push({
        id: org.id,
        newPrice,
        oldPrice,
        change: priceChange,
      });
    }
  }
  
  if (updates.length === 0) return 0;
  
  await prisma.$transaction([
    // Update all organization prices
    ...updates.map(u =>
      prisma.organization.update({
        where: { id: u.id },
        data: { currentPrice: u.newPrice },
      })
    ),
    // Create all stock price records
    prisma.stockPrice.createMany({
      data: updates.map(u => ({
        organizationId: u.id,
        price: u.newPrice,
        change: u.newPrice - u.oldPrice,
        changePercent: u.change * 100,
        timestamp: timestamp,
      })),
    }),
  ]);

  logger.info(`Updated ${updates.length} prices based on NPC trading`, {
    count: updates.length,
  }, 'GameTick');

  return updates.length;
}

/**
 * Generate new questions
 */
async function generateNewQuestions(
  count: number,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  let questionsCreated = 0;

  for (let i = 0; i < count; i++) {
    if (Date.now() > deadlineMs) {
      logger.warn('Question generation aborted due to tick budget limit', { questionsCreated }, 'GameTick');
      break;
    }

    const prompt = `Generate a single yes/no prediction market question about current events in tech, crypto, or politics. Make it specific and resolvable within 7 days. 

Return your response as JSON in this exact format:
{
  "question": "Will X happen?",
  "resolutionCriteria": "Clear criteria for resolution"
}`;

    let response: { question: string; resolutionCriteria: string } | null = null;
    try {
      response = await llm.generateJSON<{ question: string; resolutionCriteria: string }>(
        prompt,
        { 
          properties: {
            question: { type: 'string' },
            resolutionCriteria: { type: 'string' }
          },
          required: ['question', 'resolutionCriteria'] 
        },
        { temperature: 0.8, maxTokens: 300 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('Failed to generate new question via LLM', { error: errorMessage }, 'GameTick');
      continue;
    }

    if (!response?.question) {
      continue;
    }

    const resolutionDate = new Date();
    resolutionDate.setDate(resolutionDate.getDate() + 3);

    let nextQuestionNumber = 1;
    try {
      const lastQuestion = await prisma.question.findFirst({
        orderBy: { questionNumber: 'desc' },
      });
      nextQuestionNumber = (lastQuestion?.questionNumber || 0) + 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to calculate next question number', { error: errorMessage }, 'GameTick');
      continue;
    }

    const scenarioId = 1; // TODO: replace with dynamic scenario selection when schema supports it

    try {
      const question = await prisma.question.create({
        data: {
          questionNumber: nextQuestionNumber,
          text: response.question,
          scenarioId,
          outcome: Math.random() > 0.5,
          rank: 1,
          resolutionDate,
          status: 'active',
        },
      });

      await prisma.market.create({
        data: {
          id: question.id,
          question: response.question,
          description: response.resolutionCriteria,
          liquidity: 1000,
          endDate: resolutionDate,
          gameId: 'continuous',
        },
      });

      questionsCreated++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to persist generated question', { error: errorMessage }, 'GameTick');
    }
  }

  return questionsCreated;
}

/**
 * Resolve question payouts
 */
async function resolveQuestionPayouts(questionNumber: number): Promise<void> {
  const question = await prisma.question.findFirst({
    where: { questionNumber },
  });

  if (!question) return;

  // Find the market for this question (by matching question text)
  const market = await prisma.market.findFirst({
    where: { question: question.text },
  });

  if (!market) return;

  // Get all positions for this market
  const positions = await prisma.position.findMany({
    where: {
      marketId: market.id,
    },
  });

  // Pay out winners
  for (const position of positions) {
    const isWinner = (position.side === true && question.outcome) || 
                     (position.side === false && !question.outcome);

    if (isWinner) {
      const payout = Number(position.shares) * 2; // Simplified: 2x payout for winners
      
      await prisma.user.update({
        where: { id: position.userId },
        data: {
          virtualBalance: {
            increment: payout,
          },
        },
      });
    }
  }
  
  // Mark market as resolved
  await prisma.market.update({
    where: { id: market.id },
    data: {
      resolved: true,
      resolution: question.outcome,
    },
  });
}

/**
 * Update widget caches
 * This pre-generates and caches widget data to improve performance
 */
async function updateWidgetCaches(): Promise<number> {
  let cachesUpdated = 0;

  try {
    const companies = await db.getCompanies();

    if (!companies || companies.length === 0) {
      logger.warn('No companies found for widget cache update', {}, 'GameTick');
      return 0;
    }

    const perpMarketsWithStats = await Promise.all(
      companies
        .filter(company => company && company.id && company.name) // Filter out invalid companies
        .map(async (company) => {
          try {
            const currentPrice = company.currentPrice || company.initialPrice || 100;
            
            const priceHistory = await db.getPriceHistory(company.id, 1440);
            
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
          } catch (error) {
            logger.warn('Failed to get price stats for company', { companyId: company.id, error }, 'GameTick');
            // Return a safe default
            return {
              ticker: company.id.toUpperCase().replace(/-/g, ''),
              organizationId: company.id,
              name: company.name || 'Unknown Company',
              currentPrice: company.currentPrice || company.initialPrice || 100,
              changePercent24h: 0,
              volume24h: 0,
            };
          }
        })
    );

    const topPerpGainers = perpMarketsWithStats
      .sort((a, b) => Math.abs(b.changePercent24h) - Math.abs(a.changePercent24h))
      .slice(0, 3);

    // 2. Get top 3 pool gainers
    const pools = await prisma.pool.findMany({
      where: { isActive: true },
      include: {
        npcActor: {
          select: { name: true },
        },
      },
      orderBy: { totalValue: 'desc' },
    });

    const poolsWithReturn = pools
      .filter(pool => pool && pool.id && pool.name) // Filter out invalid pools
      .map((pool) => {
        const totalDeposits = parseFloat(pool.totalDeposits.toString());
        const totalValue = parseFloat(pool.totalValue.toString());
        const totalReturn = totalDeposits > 0 
          ? ((totalValue - totalDeposits) / totalDeposits) * 100 
          : 0;

        // Safely extract npcActor name with multiple fallbacks
        let npcActorName = 'Unknown';
        try {
          if (pool.npcActor && typeof pool.npcActor === 'object' && 'name' in pool.npcActor) {
            npcActorName = pool.npcActor.name || 'Unknown';
          }
        } catch (e) {
          logger.warn('Failed to extract npcActor name', { poolId: pool.id, error: e }, 'GameTick');
        }

        return {
          id: pool.id,
          name: pool.name,
          npcActorName,
          totalReturn,
          totalValue,
        };
      });

    const topPoolGainers = poolsWithReturn
      .sort((a, b) => b.totalReturn - a.totalReturn)
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

    const marketsWithTimeWeightedVolume = activeMarkets.map((market) => {
      const yesShares = market.yesShares ? Number(market.yesShares) : 0;
      const noShares = market.noShares ? Number(market.noShares) : 0;
      const totalShares = yesShares + noShares;
      const totalVolume = totalShares * 0.5;
      
      const ageInHours = (Date.now() - market.createdAt.getTime()) / (1000 * 60 * 60);
      const timeWeight = ageInHours < 24 
        ? 2.0 
        : Math.max(1.0, 2.0 - (ageInHours - 24) / (6 * 24));
      
      const timeWeightedScore = totalVolume * timeWeight;
      
      const yesPrice = totalShares > 0 
        ? yesShares / totalShares 
        : 0.5;

      return {
        id: parseInt(market.id) || 0,
        text: market.question || 'Unknown Question',
        totalVolume,
        yesPrice,
        timeWeightedScore,
      };
    });

    const topVolumeQuestions = marketsWithTimeWeightedVolume
      .sort((a, b) => b.timeWeightedScore - a.timeWeightedScore)
      .slice(0, 3);

    // Update cache
    await prisma.widgetCache.upsert({
      where: { widget: 'markets' },
      create: {
        widget: 'markets',
        data: {
          topPerpGainers,
          topPoolGainers,
          topVolumeQuestions,
          lastUpdated: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
      update: {
        data: {
          topPerpGainers,
          topPoolGainers,
          topVolumeQuestions,
          lastUpdated: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    cachesUpdated++;
    logger.info('Updated markets widget cache', {}, 'GameTick');

    return cachesUpdated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Failed to update widget caches', { error: errorMessage }, 'GameTick');
    return 0;
  }
}

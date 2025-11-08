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
import { ArticleGenerator } from '@/engine/ArticleGenerator';
import { db } from './database-service';
import type { Prisma } from '@prisma/client';
import type { WorldEvent, ActorTier } from '@/shared/types';

export interface GameTickResult {
  postsCreated: number;
  eventsCreated: number;
  articlesCreated: number;
  marketsUpdated: number;
  questionsResolved: number;
  questionsCreated: number;
  widgetCachesUpdated: number;
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
  };

  try {
    // Initialize LLM client with error handling
    const llmClient = (() => {
      try {
        return new BabylonLLMClient();
      } catch (error) {
        logger.error('Failed to initialize LLM client', { error }, 'GameTick');
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
            logger.error('Failed to resolve question payout', { error, questionNumber: question.questionNumber }, 'GameTick');
          }
        }
      } catch (error) {
        logger.error('Failed to resolve questions', { error }, 'GameTick');
      }
    }

    // Each generation function is isolated with its own error handling
    if (llmClient) {
      if (Date.now() < deadline) {
        try {
          const postsGenerated = await generatePosts(activeQuestions.slice(0, 3), timestamp, llmClient, deadline);
          result.postsCreated = postsGenerated;
        } catch (error) {
          logger.error('Failed to generate posts', { error }, 'GameTick');
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
      logger.error('Failed to generate events', { error }, 'GameTick');
    }

    if (llmClient) {
      if (Date.now() < deadline) {
        try {
          const articlesGenerated = await generateArticles(timestamp, llmClient, deadline);
          result.articlesCreated = articlesGenerated;
        } catch (error) {
          logger.error('Failed to generate articles', { error }, 'GameTick');
        }
      } else {
        logger.warn('Skipping article generation – tick budget exceeded', { budgetMs }, 'GameTick');
      }
    } else {
      logger.warn('Skipping article generation – LLM unavailable', undefined, 'GameTick');
    }

    try {
      const marketsUpdated = await updateMarketPrices(timestamp);
      result.marketsUpdated = marketsUpdated;
    } catch (error) {
      logger.error('Failed to update market prices', { error }, 'GameTick');
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
      logger.error('Failed to generate new questions', { error }, 'GameTick');
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
      logger.error('Failed to update game state', { error }, 'GameTick');
    }

    try {
      const cachesUpdated = await updateWidgetCaches();
      result.widgetCachesUpdated = cachesUpdated;
    } catch (error) {
      logger.error('Failed to update widget caches', { error }, 'GameTick');
    }

    const durationMs = Date.now() - startedAt;
    logger.info('Game tick completed', { ...result, durationMs }, 'GameTick');

  } catch (error) {
    logger.error('Critical error in game tick', { error }, 'GameTick');
    throw error;
  }

  return result;
}

/**
 * Generate posts using LLM
 */
async function generatePosts(
  questions: Array<{ id: string; text: string; questionNumber: number }>,
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  if (questions.length === 0) return 0;

  const postsToGenerate = 5;
  let postsCreated = 0;

  const actors = await prisma.actor.findMany({
    take: 10,
    orderBy: { reputationPoints: 'desc' },
  });

  if (actors.length === 0) {
    logger.warn('No actors found for post generation', {}, 'GameTick');
    return 0;
  }

  for (let i = 0; i < postsToGenerate && i < questions.length; i++) {
    // Check deadline before each post generation
    if (Date.now() > deadlineMs) {
      logger.warn('Post generation aborted due to tick budget limit', { generated: postsCreated }, 'GameTick');
      break;
    }

    const question = questions[i];
    const actor = actors[i % actors.length];
    
    // Defensive checks for question and actor validity
    if (!question || !actor || !actor.name) {
      logger.warn('Missing question or actor data', { questionIndex: i }, 'GameTick');
      continue;
    }

    const prompt = `You are ${actor.name}. Write a brief social media post (max 200 chars) about this prediction market question: "${question.text}". Be opinionated and entertaining.`;

    try {
      const response = await llm.generateJSON<{ post: string }>(
        prompt,
        { required: ['post'] },
        { temperature: 0.9, maxTokens: 200 }
      );

      if (!response.post) {
        logger.warn('Empty post generated', { questionIndex: i }, 'GameTick');
        continue;
      }

      await prisma.post.create({
        data: {
          content: response.post,
          authorId: actor.id,
          gameId: 'continuous',
          dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
          timestamp: timestamp,
        },
      });
      postsCreated++;
    } catch (error) {
      logger.error('Failed to generate post', { error, questionIndex: i, actorId: actor.id, questionId: question.id }, 'GameTick');
      // Continue with next post instead of failing entire batch
    }
  }

  return postsCreated;
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
      logger.error('Failed to generate event', { error, questionIndex: i }, 'GameTick');
      // Continue with next event
    }
  }

  return eventsCreated;
}

/**
 * Generate articles from recent events
 */
async function generateArticles(
  timestamp: Date,
  llm: BabylonLLMClient,
  deadlineMs: number
): Promise<number> {
  // Get recent events (from last 2 hours)
  const twoHoursAgo = new Date(timestamp.getTime() - 2 * 60 * 60 * 1000);
  const recentEvents = await prisma.worldEvent.findMany({
    where: {
      timestamp: { gte: twoHoursAgo },
      visibility: 'public',
    },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  if (recentEvents.length === 0) return 0;

  // Get news organizations (media type)
  const newsOrgs = await prisma.organization.findMany({
    where: { type: 'media' },
  });

  if (newsOrgs.length === 0) return 0;

  // Get actors for journalist bylines and relationship context
  const actors = await prisma.actor.findMany({
    take: 50,
      orderBy: { tier: 'asc' }, // Higher tier actors first
  });

  if (actors.length === 0) {
    logger.warn('No actors found for article generation', {}, 'GameTick');
    return 0;
  }

  // Initialize article generator
  const articleGen = new ArticleGenerator(llm);

  let articlesCreated = 0;

  // Generate 1-3 articles per tick (to avoid overwhelming and stay within time limit)
  const articlesToGenerate = Math.min(3, Math.ceil(recentEvents.length * 0.3));
  const eventsTocover = recentEvents.slice(0, articlesToGenerate);

  for (const event of eventsTocover) {
    // Check deadline before each article generation
    if (Date.now() > deadlineMs) {
      logger.warn('Article generation aborted due to tick budget limit', { articlesCreated }, 'GameTick');
      break;
    }

    try {
      const worldEvent: WorldEvent = {
        id: event.id,
        type: event.eventType as WorldEvent['type'],
        description: event.description,
        actors: event.actors || [],
        relatedQuestion: event.relatedQuestion || undefined,
        visibility: event.visibility as WorldEvent['visibility'],
        day: event.dayNumber || 0,
      };

      const organizations = newsOrgs.map(org => ({
        id: org.id,
        name: org.name || 'Unknown Organization',
        description: org.description || '',
        type: (org.type as 'company' | 'media' | 'government') || 'media',
        canBeInvolved: org.canBeInvolved,
        initialPrice: org.initialPrice || undefined,
        currentPrice: org.currentPrice || undefined,
      }));

      const actorList = actors
        .filter(a => a && a.id && a.name) // Filter out invalid actors
        .map(a => ({
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

      if (actorList.length === 0) {
        logger.warn('No valid actors for article generation', { eventId: event.id }, 'GameTick');
        continue;
      }

      const articles = await articleGen.generateArticlesForEvent(
        worldEvent,
        organizations,
        actorList,
        []
      );

      for (const article of articles) {
        if (!article || !article.authorOrgId) {
          logger.warn('Invalid article generated', { eventId: event.id }, 'GameTick');
          continue;
        }

        await prisma.post.create({
          data: {
            type: 'article',
            content: article.summary || '',
            fullContent: article.content || '',
            articleTitle: article.title || 'Untitled',
            byline: article.byline || null,
            biasScore: article.biasScore || null,
            sentiment: article.sentiment || null,
            slant: article.slant || null,
            category: article.category || null,
            authorId: article.authorOrgId,
            gameId: 'continuous',
            dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
            timestamp: article.publishedAt || new Date(),
          },
        });
        articlesCreated++;
      }
    } catch (error) {
      logger.error('Failed to generate article from event', { error, eventId: event.id }, 'GameTick');
    }
  }

  return articlesCreated;
}

/**
 * Update market prices for organizations
 */
async function updateMarketPrices(timestamp: Date): Promise<number> {
  const organizations = await prisma.organization.findMany({
    where: {
      type: 'company',
      currentPrice: { not: null },
    },
  });

  if (organizations.length === 0) return 0;

  // Prepare batch updates and stock price records
  const updates: Array<{ id: string; newPrice: number; oldPrice: number; change: number }> = [];
  
  for (const org of organizations) {
    if (!org.currentPrice) continue;

    // Small random price movement (-2% to +2%)
    const change = (Math.random() - 0.5) * 0.04;
    const newPrice = Number(org.currentPrice) * (1 + change);
    
    updates.push({
      id: org.id,
      newPrice,
      oldPrice: Number(org.currentPrice),
      change,
    });
  }

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

    const prompt = `Generate a single yes/no prediction market question about current events in tech, crypto, or politics. Make it specific and resolvable within 7 days. Return JSON: {"question": "Will X happen?", "resolutionCriteria": "Clear criteria"}`;

    let response: { question: string; resolutionCriteria: string } | null = null;
    try {
      response = await llm.generateJSON<{ question: string; resolutionCriteria: string }>(
        prompt,
        { required: ['question', 'resolutionCriteria'] },
        { temperature: 0.8, maxTokens: 300 }
      );
    } catch (error) {
      logger.error('Failed to generate new question via LLM', { error }, 'GameTick');
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
      logger.error('Failed to calculate next question number', { error }, 'GameTick');
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
      logger.error('Failed to persist generated question', { error }, 'GameTick');
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

    const poolsWithReturn = pools.map((pool) => {
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
    logger.error('Failed to update widget caches', { error }, 'GameTick');
    return 0;
  }
}

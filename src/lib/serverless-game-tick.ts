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

export interface GameTickResult {
  postsCreated: number;
  eventsCreated: number;
  marketsUpdated: number;
  questionsResolved: number;
  questionsCreated: number;
}

/**
 * Execute a single game tick
 * Designed to complete within Vercel's 60-second limit
 */
export async function executeGameTick(): Promise<GameTickResult> {
  const timestamp = new Date();

  logger.info('Executing game tick', { timestamp: timestamp.toISOString() }, 'GameTick');

  // Initialize result counters
  const result: GameTickResult = {
    postsCreated: 0,
    eventsCreated: 0,
    marketsUpdated: 0,
    questionsResolved: 0,
    questionsCreated: 0,
  };

  // Get active questions from database
  const activeQuestions = await prisma.question.findMany({
    where: {
      status: 'active',
    },
  });

  logger.info(`Found ${activeQuestions.length} active questions`, { count: activeQuestions.length }, 'GameTick');

  // 1. Check for questions to resolve
  const questionsToResolve = activeQuestions.filter(q => {
    if (!q.resolutionDate) return false;
    const resolutionDate = new Date(q.resolutionDate);
    return resolutionDate <= timestamp;
  });

  if (questionsToResolve.length > 0) {
    logger.info(`Resolving ${questionsToResolve.length} questions`, { count: questionsToResolve.length }, 'GameTick');
    
    for (const question of questionsToResolve) {
      try {
        await prisma.question.update({
          where: { id: question.id },
          data: { status: 'resolved' },
        });
        result.questionsResolved++;
        
        // Update user balances for this question
        await resolveQuestionPayouts(question.questionNumber);
        
      } catch (error) {
        logger.error(`Failed to resolve question ${question.id}`, { error }, 'GameTick');
      }
    }
  }

  // 2. Generate new posts using LLM
  try {
    const postsGenerated = await generatePosts(activeQuestions.slice(0, 3), timestamp);
    result.postsCreated = postsGenerated;
  } catch (error) {
    logger.error('Failed to generate posts', { error }, 'GameTick');
  }

  // 3. Generate events
  try {
    const eventsGenerated = await generateEvents(activeQuestions.slice(0, 3), timestamp);
    result.eventsCreated = eventsGenerated;
  } catch (error) {
    logger.error('Failed to generate events', { error }, 'GameTick');
  }

  // 4. Update market prices (perpetuals)
  try {
    const marketsUpdated = await updateMarketPrices(timestamp);
    result.marketsUpdated = marketsUpdated;
  } catch (error) {
    logger.error('Failed to update market prices', { error }, 'GameTick');
  }

  // 5. Create new questions if needed
  const currentActiveCount = activeQuestions.length - result.questionsResolved;
  if (currentActiveCount < 10) {
    try {
      const questionsGenerated = await generateNewQuestions(Math.min(3, 15 - currentActiveCount));
      result.questionsCreated = questionsGenerated;
    } catch (error) {
      logger.error('Failed to generate new questions', { error }, 'GameTick');
    }
  }

  // 6. Update game state
  await prisma.game.updateMany({
    where: { isContinuous: true },
    data: {
      lastTickAt: timestamp,
      updatedAt: timestamp,
    },
  });

  logger.info('Game tick completed', result, 'GameTick');

  return result;
}

/**
 * Generate posts using LLM
 */
async function generatePosts(questions: Array<{ id: string; text: string; questionNumber: number }>, timestamp: Date): Promise<number> {
  if (questions.length === 0) return 0;

  const llm = new BabylonLLMClient();
  const postsToGenerate = 5; // Generate 5 posts per tick
  let postsCreated = 0;

  // Get random actors for post generation
  const actors = await prisma.actor.findMany({
    take: 10,
    orderBy: { reputationPoints: 'desc' },
  });

  for (let i = 0; i < postsToGenerate && i < questions.length; i++) {
    const question = questions[i];
    const actor = actors[i % actors.length];
    if (!question || !actor) continue;

    try {
      const prompt = `You are ${actor.name}. Write a brief social media post (max 200 chars) about this prediction market question: "${question.text}". Be opinionated and entertaining.`;
      
      const response = await llm.generateJSON<{ post: string }>(
        prompt,
        { required: ['post'] },
        { temperature: 0.9, maxTokens: 200 }
      );

      if (response.post) {
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
      }
    } catch (error) {
      logger.warn(`Failed to generate post for ${actor.name}`, { error }, 'GameTick');
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
    const question = questions[i];
    if (!question) continue;

    try {
      await prisma.worldEvent.create({
        data: {
          eventType: 'announcement',
          description: `Development regarding: ${question.text}`,
          actors: [],
          relatedQuestion: question.questionNumber, // Use questionNumber (Int), not id (String)
          visibility: 'public',
          gameId: 'continuous',
          dayNumber: Math.floor(Date.now() / (1000 * 60 * 60 * 24)),
          timestamp: timestamp,
        },
      });
      eventsCreated++;
    } catch (error) {
      logger.warn(`Failed to create event for question ${question.id}`, { error }, 'GameTick');
    }
  }

  return eventsCreated;
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

  let marketsUpdated = 0;

  for (const org of organizations) {
    if (!org.currentPrice) continue;

    // Small random price movement (-2% to +2%)
    const change = (Math.random() - 0.5) * 0.04;
    const newPrice = Number(org.currentPrice) * (1 + change);

    try {
      await prisma.organization.update({
        where: { id: org.id },
        data: { currentPrice: newPrice },
      });

      await prisma.stockPrice.create({
        data: {
          organizationId: org.id,
          price: newPrice,
          change: newPrice - Number(org.currentPrice),
          changePercent: change * 100,
          timestamp: timestamp,
        },
      });

      marketsUpdated++;
    } catch (error) {
      logger.warn(`Failed to update price for ${org.id}`, { error }, 'GameTick');
    }
  }

  return marketsUpdated;
}

/**
 * Generate new questions
 */
async function generateNewQuestions(count: number): Promise<number> {
  const llm = new BabylonLLMClient();
  let questionsCreated = 0;

  for (let i = 0; i < count; i++) {
    try {
      const prompt = `Generate a single yes/no prediction market question about current events in tech, crypto, or politics. Make it specific and resolvable within 7 days. Return JSON: {"question": "Will X happen?", "resolutionCriteria": "Clear criteria"}`;
      
      const response = await llm.generateJSON<{ question: string; resolutionCriteria: string }>(
        prompt,
        { required: ['question', 'resolutionCriteria'] },
        { temperature: 0.8, maxTokens: 300 }
      );

      if (response.question) {
        const resolutionDate = new Date();
        resolutionDate.setDate(resolutionDate.getDate() + 3); // 3 days from now
        
        // Get next question number
        const lastQuestion = await prisma.question.findFirst({
          orderBy: { questionNumber: 'desc' },
        });
        const nextQuestionNumber = (lastQuestion?.questionNumber || 0) + 1;

        // Create Question metadata
        await prisma.question.create({
          data: {
            questionNumber: nextQuestionNumber,
            text: response.question,
            scenarioId: 1, // Default scenario
            outcome: Math.random() > 0.5, // Predetermined outcome
            rank: 1,
            resolutionDate,
            status: 'active',
          },
        });
        
        // Create Market for trading
        await prisma.market.create({
          data: {
            question: response.question,
            description: response.resolutionCriteria,
            liquidity: 1000, // Initial liquidity
            endDate: resolutionDate,
            gameId: 'continuous',
          },
        });

        questionsCreated++;
      }
    } catch (error) {
      logger.warn('Failed to generate question', { error }, 'GameTick');
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
      
      try {
        await prisma.user.update({
          where: { id: position.userId },
          data: {
            virtualBalance: {
              increment: payout,
            },
          },
        });
      } catch (error) {
        logger.warn(`Failed to update balance for user ${position.userId}`, { error }, 'GameTick');
      }
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


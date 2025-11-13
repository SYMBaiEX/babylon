/**
 * World Context Generator
 * 
 * Generates context strings for feed prompts including actor names,
 * markets, predictions, and recent trades.
 */

import actorsData from '../../../public/data/actors.json';
import { prisma } from '@/lib/prisma';

export interface Actor {
  id: string;
  name: string;
  realName: string;
  username: string;
  description: string;
  domain: string[];
}

export interface WorldContextOptions {
  includeActors?: boolean;
  includeMarkets?: boolean;
  includePredictions?: boolean;
  includeTrades?: boolean;
  maxActors?: number;
}

/**
 * Generates the world actors list for prompt context
 * ONLY includes parody names - real names are NEVER mentioned
 */
export function generateWorldActors(maxActors?: number): string {
  const actors = actorsData.actors as Actor[];
  const actorsToShow = maxActors ? actors.slice(0, maxActors) : actors;
  
  const actorsList = actorsToShow
    .map(actor => `${actor.name} (@${actor.username})`)
    .join(', ');
  
  return `World Actors (USE THESE NAMES ONLY): ${actorsList}`;
}

/**
 * Generates current markets context from database
 * Includes both prediction markets and perpetual futures
 */
export async function generateCurrentMarkets(): Promise<string> {
  try {
    // Get active prediction markets
    const predictionMarkets = await prisma.market.findMany({
      where: {
        resolved: false,
        endDate: { gte: new Date() },
      },
      orderBy: [
        { yesShares: 'desc' }, // Most active first
      ],
      take: 5, // Top 5 prediction markets
    });

    // Get top perpetual markets (companies with recent activity)
    const companies = await prisma.organization.findMany({
      where: {
        type: 'company',
        currentPrice: { not: null },
      },
      orderBy: { currentPrice: 'desc' },
      take: 5, // Top 5 companies
    });

    const parts: string[] = [];

    // Add prediction markets
    if (predictionMarkets.length > 0) {
      const predList = predictionMarkets.map(market => {
        const yesShares = parseFloat(market.yesShares.toString());
        const noShares = parseFloat(market.noShares.toString());
        const totalShares = yesShares + noShares;
        const yesPrice = totalShares > 0 ? Math.round((yesShares / totalShares) * 100) : 50;
        
        return `${market.question} (${yesPrice}% Yes)`;
      });
      parts.push(`Predictions: ${predList.join(' | ')}`);
    }

    // Add perp markets
    if (companies.length > 0) {
      const perpList = companies.map(company => {
        const price = company.currentPrice || company.initialPrice || 100;
        return `${company.name} $${price.toFixed(2)}`;
      });
      parts.push(`Stocks: ${perpList.join(' | ')}`);
    }

    if (parts.length === 0) {
      return 'Active Markets: None currently active';
    }

    return `Active Markets: ${parts.join(' / ')}`;
  } catch (error) {
    console.error('Error generating markets context:', error);
    return 'Active Markets: [Error loading markets]';
  }
}

/**
 * Generates active predictions context from database
 */
export async function generateActivePredictions(): Promise<string> {
  try {
    // Get active questions from the Question table
    const questions = await prisma.question.findMany({
      where: {
        status: 'active',
        resolutionDate: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 10, // Top 10 questions
    });

    if (questions.length === 0) {
      return 'Active Questions: None currently active';
    }

    const questionsList = questions.map(q => {
      const daysUntil = Math.ceil(
        (q.resolutionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return `${q.text} (resolves in ${daysUntil}d)`;
    });

    return `Active Questions: ${questionsList.join(' | ')}`;
  } catch (error) {
    console.error('Error generating predictions context:', error);
    return 'Active Questions: [Error loading questions]';
  }
}

/**
 * Generates recent trades context from database
 */
export async function generateRecentTrades(): Promise<string> {
  try {
    // Get recent NPC trades
    const npcTrades = await prisma.nPCTrade.findMany({
      orderBy: { executedAt: 'desc' },
      take: 15,
      include: {
        Actor: {
          select: {
            name: true,
          },
        },
      },
    });

    // Get recent agent trades
    const agentTrades = await prisma.agentTrade.findMany({
      orderBy: { executedAt: 'desc' },
      take: 15,
      include: {
        User: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    });

    // Combine and sort by time
    const allTrades = [
      ...npcTrades.map(t => ({
        name: t.Actor.name,
        action: t.action,
        side: t.side,
        amount: t.amount,
        price: t.price,
        marketType: t.marketType,
        ticker: t.ticker,
        time: t.executedAt,
      })),
      ...agentTrades.map(t => ({
        name: t.User.displayName || t.User.username || 'Agent',
        action: t.action,
        side: t.side,
        amount: t.amount,
        price: t.price,
        marketType: t.marketType,
        ticker: t.ticker,
        time: t.executedAt,
      })),
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 20); // Top 20 most recent

    if (allTrades.length === 0) {
      return 'Recent Trades: No recent activity';
    }

    const tradesList = allTrades.map(t => {
      const actionStr = t.side 
        ? `${t.action} ${t.side}` 
        : t.action;
      const marketStr = t.ticker || t.marketType;
      return `${t.name} ${actionStr} ${marketStr}`;
    });

    return `Recent Trades: ${tradesList.join(' | ')}`;
  } catch (error) {
    console.error('Error generating trades context:', error);
    return 'Recent Trades: [Error loading trades]';
  }
}

/**
 * Generates complete world context for feed prompts
 * Note: This is async because it fetches from database
 */
export async function generateWorldContext(options: WorldContextOptions = {}): Promise<{
  worldActors: string;
  currentMarkets: string;
  activePredictions: string;
  recentTrades: string;
}> {
  const {
    includeActors = true,
    includeMarkets = true,
    includePredictions = true,
    includeTrades = true,
    maxActors = 50, // Limit to top 50 actors to avoid token limits
  } = options;

  // Fetch data in parallel for performance
  const [markets, predictions, trades] = await Promise.all([
    includeMarkets ? generateCurrentMarkets() : Promise.resolve(''),
    includePredictions ? generateActivePredictions() : Promise.resolve(''),
    includeTrades ? generateRecentTrades() : Promise.resolve(''),
  ]);

  return {
    worldActors: includeActors ? generateWorldActors(maxActors) : '',
    currentMarkets: markets,
    activePredictions: predictions,
    recentTrades: trades,
  };
}

/**
 * Get a list of parody actor names (for validation purposes only)
 */
export function getParodyActorNames(): string[] {
  const actors = actorsData.actors as Actor[];
  return actors.map(actor => actor.name);
}

/**
 * Get a list of forbidden real names (for validation - these should NEVER appear in output)
 */
export function getForbiddenRealNames(): string[] {
  const actors = actorsData.actors as Actor[];
  return actors.map(actor => actor.realName);
}

/**
 * Example usage in your feed generation:
 * 
 * import { generateWorldContext } from '@/lib/prompts/world-context';
 * import { renderPrompt, ambientPosts } from '@/prompts';
 * 
 * const worldContext = generateWorldContext();
 * const prompt = renderPrompt(ambientPosts, {
 *   day: 5,
 *   actorCount: 3,
 *   actorsList: "...",
 *   ...worldContext // Spreads: worldActors, currentMarkets, activePredictions, recentTrades
 * });
 */


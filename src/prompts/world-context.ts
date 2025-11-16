/**
 * World Context Generator
 * 
 * Generates context strings for prompts including:
 * - Actor names (parody only)
 * - Current markets and prices
 * - Active predictions
 * - Recent trades
 * - Reality grounding (current date, prices, politics, tech, culture)
 * 
 * This is the single source of truth for world context in prompts.
 */

import { loadActorsData } from '@/lib/data/actors-loader';
import { prisma } from '@/lib/prisma';
import { shuffleArray } from '@/lib/utils/randomization';
import type { ActorData } from '@/shared/types';
import { 
  getCurrentDateContext, 
  getRealityGrounding, 
  getMinimalRealityGrounding,
  checkRealityGrounding as checkReality,
  REALITY_GROUNDING 
} from './reality-grounding';

export interface WorldContextOptions {
  includeActors?: boolean;
  includeMarkets?: boolean;
  includePredictions?: boolean;
  includeTrades?: boolean;
  includeRealityGrounding?: boolean;
  maxActors?: number;
  realityGroundingLevel?: 'full' | 'concise' | 'minimal' | 'none';
}

export interface WorldContext {
  // Actor context
  worldActors: string;
  
  // Market context
  currentMarkets: string;
  activePredictions: string;
  recentTrades: string;
  
  // Date/time context
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
  currentYear: string;
  currentMonth: string;
  currentDay: string;
  
  // Reality grounding
  realityGrounding: string;
}

/**
 * Generates the world actors list for prompt context
 * ONLY includes parody names - real names are NEVER mentioned
 * Shuffles actors to add variety to prompts
 * 
 * **Optimized:** Only loads actors (not orgs or relationships)
 */
export function generateWorldActors(maxActors?: number): string {
  // OPTIMIZATION: Only load actors, not organizations or relationships
  const actorsData = loadActorsData({ 
    includeActors: true, 
    includeOrganizations: false, 
    includeRelationships: false 
  });
  const actors = actorsData.actors as ActorData[];
  
  // Shuffle actors to add randomness/entropy to prompts
  const shuffledActors = shuffleArray(actors);
  const actorsToShow = maxActors ? shuffledActors.slice(0, maxActors) : shuffledActors;
  
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

  // Add prediction markets (shuffled for variety)
  if (predictionMarkets.length > 0) {
    const shuffledPredictions = shuffleArray(predictionMarkets);
    const predList = shuffledPredictions.map(market => {
      const yesShares = parseFloat(market.yesShares.toString());
      const noShares = parseFloat(market.noShares.toString());
      const totalShares = yesShares + noShares;
      const yesPrice = totalShares > 0 ? Math.round((yesShares / totalShares) * 100) : 50;
      
      return `${market.question} (${yesPrice}% Yes)`;
    });
    parts.push(`Predictions: ${predList.join(' | ')}`);
  }

  // Add perp markets (shuffled for variety)
  if (companies.length > 0) {
    const shuffledCompanies = shuffleArray(companies);
    const perpList = shuffledCompanies.map(company => {
      const price = company.currentPrice || company.initialPrice || 100;
      return `${company.name} $${price.toFixed(2)}`;
    });
    parts.push(`Stocks: ${perpList.join(' | ')}`);
  }

  if (parts.length === 0) {
    return 'Active Markets: None currently active';
  }

  return `Active Markets: ${parts.join(' / ')}`;
}

/**
 * Generates active predictions context from database
 */
export async function generateActivePredictions(): Promise<string> {
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

  // Shuffle questions to add variety
  const shuffledQuestions = shuffleArray(questions);
  const questionsList = shuffledQuestions.map(q => {
    const daysUntil = Math.ceil(
      (q.resolutionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return `${q.text} (resolves in ${daysUntil}d)`;
  });

  return `Active Questions: ${questionsList.join(' | ')}`;
}

/**
 * Generates recent trades context from database
 */
export async function generateRecentTrades(): Promise<string> {
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
}

/**
 * Generates complete world context for prompts
 * 
 * This is the main function to use when generating any content.
 * It provides current date, market data, and reality grounding.
 * 
 * @param options - Configuration for what context to include
 * @returns Complete world context object
 */
export async function generateWorldContext(
  options: WorldContextOptions = {}
): Promise<WorldContext> {
  const {
    includeActors = true,
    includeMarkets = true,
    includePredictions = true,
    includeTrades = true,
    includeRealityGrounding = true,
    maxActors = 50, // Limit to top 50 actors to avoid token limits
    realityGroundingLevel = 'concise', // Default to concise for most prompts
  } = options;

  const dateContext = getCurrentDateContext();

  // Fetch data in parallel for performance
  const [markets, predictions, trades] = await Promise.all([
    includeMarkets ? generateCurrentMarkets() : Promise.resolve(''),
    includePredictions ? generateActivePredictions() : Promise.resolve(''),
    includeTrades ? generateRecentTrades() : Promise.resolve(''),
  ]);

  // Determine reality grounding level
  let realityGrounding = '';
  if (includeRealityGrounding) {
    switch (realityGroundingLevel) {
      case 'full':
        realityGrounding = REALITY_GROUNDING;
        break;
      case 'concise':
        realityGrounding = getRealityGrounding();
        break;
      case 'minimal':
        realityGrounding = getMinimalRealityGrounding();
        break;
      case 'none':
        realityGrounding = '';
        break;
    }
  }

  return {
    // Actor context
    worldActors: includeActors ? generateWorldActors(maxActors) : '',
    
    // Market context
    currentMarkets: markets,
    activePredictions: predictions,
    recentTrades: trades,
    
    // Date/time context
    currentDateTime: dateContext.dateISO,
    currentDate: dateContext.dateFull,
    currentTime: dateContext.time,
    currentYear: dateContext.year,
    currentMonth: dateContext.month,
    currentDay: dateContext.day,
    
    // Reality grounding
    realityGrounding,
  };
}

/**
 * Get a list of parody actor names (for validation purposes only)
 */
export function getParodyActorNames(): string[] {
  const actorsData = loadActorsData({
    includeActors: true,
    includeOrganizations: false,
    includeRelationships: false,
  });
  const actors = actorsData.actors as ActorData[];
  return actors.map(actor => actor.name);
}

/**
 * Get a list of forbidden real names (for validation - these should NEVER appear in output)
 */
export function getForbiddenRealNames(): string[] {
  const actorsData = loadActorsData({
    includeActors: true,
    includeOrganizations: false,
    includeRelationships: false,
  });
  const actors = actorsData.actors as ActorData[];
  return actors.map(actor => actor.realName);
}

/**
 * Validate that generated content doesn't use real names
 * @param text - The generated content to check
 * @returns Array of validation errors (empty if valid)
 */
export function validateNoRealNames(text: string): string[] {
  const forbiddenNames = getForbiddenRealNames();
  const violations: string[] = [];

  // Check if text contains any forbidden real names
  forbiddenNames.forEach(realName => {
    if (text.includes(realName)) {
      violations.push(`FORBIDDEN: Found real name "${realName}" - must use parody names only`);
    }
  });

  return violations;
}

/**
 * Check if generated content is grounded in current reality
 * @param text - The generated content to check
 * @returns Array of warnings about outdated references
 */
export function checkRealityGrounding(text: string): string[] {
  return checkReality(text);
}

/**
 * Complete validation of generated content
 * Checks both parody names and reality grounding
 * 
 * @param text - The generated content to validate
 * @returns Object with errors and warnings
 */
export function validateGeneratedContent(text: string): {
  errors: string[];
  warnings: string[];
  isValid: boolean;
} {
  const errors = validateNoRealNames(text);
  const warnings = checkRealityGrounding(text);
  
  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

/**
 * Re-export reality grounding utilities
 */
export {
  getCurrentDateContext,
  getRealityGrounding,
  getMinimalRealityGrounding,
  REALITY_GROUNDING,
} from './reality-grounding';

/**
 * Example usage:
 * 
 * ```typescript
 * import { generateWorldContext, renderPrompt } from '@/prompts';
 * import { ambientPosts } from '@/prompts';
 * 
 * // Generate world context with reality grounding
 * const worldContext = await generateWorldContext({
 *   maxActors: 30,
 *   realityGroundingLevel: 'concise', // 'full' | 'concise' | 'minimal' | 'none'
 * });
 * 
 * // Use in prompt
 * const prompt = renderPrompt(ambientPosts, {
 *   day: 5,
 *   actorCount: 3,
 *   actorsList: "...",
 *   progressContext: "...",
 *   atmosphereContext: "...",
 *   previousPostsContext: "",
 *   trendContext: "",
 *   ...worldContext, // Spreads all context including reality grounding
 * });
 * 
 * // Validate output
 * const validation = validateGeneratedContent(generatedText);
 * if (!validation.isValid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * if (validation.warnings.length > 0) {
 *   console.warn('Reality warnings:', validation.warnings);
 * }
 * ```
 */


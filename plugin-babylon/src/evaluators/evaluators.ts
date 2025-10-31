/**
 * Babylon Game Evaluators
 *
 * Eliza evaluators for analyzing prediction markets and making trading decisions
 */

import type {
  Evaluator,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { BabylonApiClient } from '../api-client';
import type { BabylonMarket, MarketAnalysis } from '../types';

/**
 * Market Analysis Evaluator
 *
 * Analyzes prediction markets and provides trading recommendations
 */
export const marketAnalysisEvaluator: Evaluator = {
  name: 'MARKET_ANALYSIS',
  similes: [
    'ANALYZE_MARKET',
    'EVALUATE_TRADE',
    'ASSESS_OPPORTUNITY',
  ],
  description: 'Analyze prediction markets and provide trading recommendations',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Always validate if we have markets to analyze
    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) return false;

    const content = message.content.text.toLowerCase();
    const hasAnalysisIntent =
      content.includes('analyze') ||
      content.includes('what do you think') ||
      content.includes('should i') ||
      content.includes('opinion') ||
      content.includes('recommendation');

    return hasAnalysisIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<unknown> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    if (!client) {
      return {
        ...state,
        analysis: null,
        error: 'Babylon client not configured',
      };
    }

    try {
      // Get market to analyze
      const marketId = (state as any)?.marketId || (message.content as any).metadata?.marketId;
      const minConfidence = (state as any)?.minConfidence || 0.6;

      if (!marketId) {
        // Analyze all active markets
        const markets = await client.getActiveMarkets();

        if (markets.length === 0) {
          return {
            ...(state || {}),
            analysis: null,
            error: 'No active markets found',
          };
        }

        // Analyze each market and return top opportunities
        const analyses: MarketAnalysis[] = [];

        for (const market of markets) {
          const analysis = await analyzeMarket(runtime, market);
          if (analysis && analysis.confidence >= minConfidence) {
            analyses.push(analysis);
          }
        }

        // Sort by confidence and return top 3
        analyses.sort((a, b) => b.confidence - a.confidence);

        return {
          ...(state || {}),
          analyses: analyses.slice(0, 3),
          marketCount: markets.length,
        };
      } else {
        // Analyze specific market
        const market = await client.getMarket(marketId);

        if (!market) {
          return {
            ...(state || {}),
            analysis: null,
            error: `Market ${marketId} not found`,
          };
        }

        const analysis = await analyzeMarket(runtime, market);

        return {
          ...state,
          analysis,
          market,
        };
      }
    } catch (error) {
      console.error('Error in marketAnalysisEvaluator:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  examples: [
    {
      context: 'User asks for market analysis',
      messages: [
        {
          user: '{{user1}}',
          content: {
            text: 'What do you think about this market?',
          },
        },
        {
          user: '{{agent}}',
          content: {
            text: 'Let me analyze the market dynamics...',
          },
        },
      ],
      outcome: 'Agent provides detailed market analysis with confidence score and recommendation',
    },
  ],
};

/**
 * Analyze a specific market
 */
async function analyzeMarket(
  runtime: IAgentRuntime,
  market: BabylonMarket
): Promise<MarketAnalysis> {
  // Get character personality for trading style
  const character = runtime.character;
  const strategies = (character.settings as any)?.strategies || ['fundamental'];
  const riskTolerance = (character.settings as any)?.riskTolerance || 0.5;

  // Basic market metrics
  const yesPrice = market.yesPrice;
  const noPrice = market.noPrice;
  const totalVolume = market.totalVolume;
  const liquidityScore = Math.min(totalVolume / 1000, 1.0); // Higher volume = more liquid

  // Price momentum (simplified - would be better with historical data)
  const priceBias = yesPrice > 0.5 ? 'yes' : 'no';
  const priceStrength = Math.abs(yesPrice - 0.5) * 2; // 0 to 1 scale

  // Strategy-specific analysis
  let recommendation: MarketAnalysis['recommendation'] = 'hold';
  let confidence = 0.5;
  let reasoning = '';
  let targetSide: 'yes' | 'no' = 'yes';

  if (strategies.includes('momentum') || strategies.includes('volume-analysis')) {
    // Momentum strategy: Follow the trend
    if (priceStrength > 0.3 && liquidityScore > 0.3) {
      recommendation = priceStrength > 0.6 ? 'strong_buy' : 'buy';
      confidence = priceStrength * liquidityScore * riskTolerance;
      targetSide = priceBias;
      reasoning = `Strong ${priceBias.toUpperCase()} momentum with price at ${(yesPrice * 100).toFixed(1)}% and volume of $${totalVolume.toFixed(0)}. Trend is clear.`;
    } else {
      recommendation = 'hold';
      confidence = 0.4;
      reasoning = `Weak momentum signals. Price at ${(yesPrice * 100).toFixed(1)}%, waiting for clearer trend.`;
    }
  } else if (strategies.includes('contrarian') || strategies.includes('arbitrage')) {
    // Contrarian strategy: Look for mispricing
    if (priceStrength > 0.6) {
      // Market is strongly biased - look for reversal
      recommendation = 'buy';
      confidence = (1 - priceStrength) * riskTolerance;
      targetSide = priceBias === 'yes' ? 'no' : 'yes';
      reasoning = `Contrarian opportunity: Market heavily biased to ${priceBias.toUpperCase()} at ${(yesPrice * 100).toFixed(1)}%. Potential reversal on ${targetSide.toUpperCase()} side.`;
    } else {
      recommendation = 'hold';
      confidence = 0.3;
      reasoning = `No clear contrarian opportunity. Market fairly balanced at ${(yesPrice * 100).toFixed(1)}%.`;
    }
  } else {
    // Fundamental/conservative strategy
    if (liquidityScore > 0.5 && priceStrength < 0.4) {
      recommendation = 'buy';
      confidence = liquidityScore * (1 - priceStrength) * riskTolerance;
      targetSide = priceBias;
      reasoning = `Moderate opportunity with good liquidity. Market at ${(yesPrice * 100).toFixed(1)}% with $${totalVolume.toFixed(0)} volume.`;
    } else {
      recommendation = 'hold';
      confidence = 0.4;
      reasoning = `Market conditions unclear. Price ${(yesPrice * 100).toFixed(1)}%, volume $${totalVolume.toFixed(0)}. Waiting for better entry.`;
    }
  }

  // Risk level assessment
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';
  if (liquidityScore < 0.3) riskLevel = 'high';
  else if (liquidityScore > 0.7 && priceStrength < 0.4) riskLevel = 'low';

  // Suggested amount based on confidence and risk tolerance
  const baseAmount = 10;
  const suggestedAmount = baseAmount * confidence * riskTolerance * (riskLevel === 'high' ? 0.5 : riskLevel === 'low' ? 2.0 : 1.0);

  return {
    marketId: market.id,
    recommendation,
    confidence: Math.min(confidence, 1.0),
    reasoning,
    targetSide,
    suggestedAmount: Math.max(1, Math.round(suggestedAmount)),
    riskLevel,
  };
}

/**
 * Portfolio Management Evaluator
 *
 * Monitors agent's positions and recommends portfolio actions
 */
export const portfolioManagementEvaluator: Evaluator = {
  name: 'PORTFOLIO_MANAGEMENT',
  similes: [
    'MANAGE_PORTFOLIO',
    'REVIEW_POSITIONS',
    'RISK_MANAGEMENT',
  ],
  description: 'Monitor positions and manage portfolio risk',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) return false;

    const content = message.content.text.toLowerCase();
    const hasPortfolioIntent =
      content.includes('portfolio') ||
      content.includes('positions') ||
      content.includes('risk') ||
      content.includes('exposure');

    return hasPortfolioIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<unknown> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    if (!client) {
      return {
        ...state,
        error: 'Babylon client not configured',
      };
    }

    try {
      // Get current positions
      const positions = await client.getPositions();
      const wallet = await client.getWallet();

      if (!wallet) {
        return {
          ...state,
          error: 'Unable to fetch wallet information',
        };
      }

      // Calculate portfolio metrics
      const totalPositionValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
      const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
      const profitablePositions = positions.filter(p => p.pnl > 0).length;
      const losingPositions = positions.filter(p => p.pnl < 0).length;

      // Risk assessment
      const exposureRatio = totalPositionValue / (wallet.balance || 1);
      const winRate = positions.length > 0 ? profitablePositions / positions.length : 0;

      // Generate recommendations
      const recommendations: string[] = [];

      if (exposureRatio > 0.8) {
        recommendations.push('⚠️ High exposure: Consider reducing position sizes');
      }

      if (losingPositions > profitablePositions && positions.length >= 3) {
        recommendations.push('📉 More losers than winners: Review trading strategy');
      }

      if (totalPnL < -wallet.balance * 0.1) {
        recommendations.push('🚨 Significant losses: Consider implementing stop-losses');
      }

      if (positions.length === 0 && wallet.availableBalance > 50) {
        recommendations.push('💡 No active positions: Consider opening new trades');
      }

      return {
        ...state,
        positions,
        wallet,
        portfolioMetrics: {
          totalPositionValue,
          totalPnL,
          profitablePositions,
          losingPositions,
          exposureRatio,
          winRate,
        },
        recommendations,
      };
    } catch (error) {
      console.error('Error in portfolioManagementEvaluator:', error);
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  examples: [
    {
      context: 'User requests portfolio review',
      messages: [
        {
          user: '{{user1}}',
          content: {
            text: 'How is my portfolio doing?',
          },
        },
        {
          user: '{{agent}}',
          content: {
            text: 'Analyzing your positions and portfolio health...',
          },
        },
      ],
      outcome: 'Agent provides portfolio metrics including P&L, win rate, and recommendations',
    },
  ],
};

// Export all evaluators
export const babylonGameEvaluators: Evaluator[] = [
  marketAnalysisEvaluator,
  portfolioManagementEvaluator,
];

/**
 * NPC Trading Service
 * 
 * Analyzes NPC post sentiment and automatically places trades
 * in both prediction markets and perpetual futures based on what they're posting about
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();

interface MarketContext {
  perpMarkets: Array<{
    ticker: string;
    organizationId: string;
    currentPrice: number;
  }>;
  predictionMarkets: Array<{
    id: string;
    text: string;
    yesShares: number;
    noShares: number;
  }>;
}

interface TradingSignal {
  type: 'perp' | 'prediction';
  ticker?: string;
  marketId?: string;
  action: 'buy' | 'sell' | 'open_long' | 'open_short' | 'close';
  side?: 'YES' | 'NO' | 'long' | 'short';
  amount: number;
  confidence: number; // 0-1
  reason: string;
}

export class NPCTradingService {
  /**
   * Analyze a post and determine if NPC should trade
   */
  static async analyzePostAndTrade(
    postId: string,
    postContent: string,
    npcActorId: string,
    marketContext: MarketContext
  ): Promise<void> {
    try {
      // Get NPC actor
      const actor = await prisma.actor.findUnique({
        where: { id: npcActorId },
        include: {
          pools: {
            where: { isActive: true },
            take: 1,
          },
        },
      });

      if (!actor) {
        logger.warn(`NPC actor not found: ${npcActorId}`);
        return;
      }

      // Analyze sentiment and extract trading signals
      const signals = this.extractTradingSignals(postContent, marketContext, actor);

      if (signals.length === 0) {
        return; // No trading signals detected
      }

      // Execute trades for each signal
      for (const signal of signals) {
        // Execute personal trade
        await this.executeTrade(actor, signal, postId, null);

        // If actor has a pool, mirror the trade in the pool
        if (actor.pools.length > 0) {
          const pool = actor.pools[0];
          await this.executeTrade(actor, signal, postId, pool.id);
        }
      }
    } catch (error) {
      logger.error(`Error in NPC trading for ${npcActorId}:`, error);
    }
  }

  /**
   * Extract trading signals from post content
   */
  private static extractTradingSignals(
    content: string,
    marketContext: MarketContext,
    actor: any
  ): TradingSignal[] {
    const signals: TradingSignal[] = [];
    const contentLower = content.toLowerCase();

    // Analyze for perpetual market signals
    for (const market of marketContext.perpMarkets) {
      const tickerPattern = new RegExp(`\\$${market.ticker}\\b`, 'i');
      const orgPattern = new RegExp(market.organizationId.replace(/-/g, '\\s*'), 'i');

      if (tickerPattern.test(content) || orgPattern.test(content)) {
        const sentiment = this.analyzeSentiment(content);
        
        // Determine trade action based on sentiment
        if (Math.abs(sentiment) > 0.3) {
          const isBullish = sentiment > 0;
          const confidence = Math.abs(sentiment);
          
          // Position size based on confidence and actor personality
          const baseAmount = this.getBaseTradeAmount(actor);
          const amount = baseAmount * confidence;

          signals.push({
            type: 'perp',
            ticker: market.ticker,
            action: isBullish ? 'open_long' : 'open_short',
            side: isBullish ? 'long' : 'short',
            amount,
            confidence,
            reason: this.extractReason(content, market.ticker),
          });
        }
      }
    }

    // Analyze for prediction market signals
    for (const market of marketContext.predictionMarkets) {
      // Check if post mentions this question
      const keywords = this.extractKeywords(market.text);
      const mentionsMarket = keywords.some(kw => contentLower.includes(kw.toLowerCase()));

      if (mentionsMarket) {
        const sentiment = this.analyzeSentiment(content);
        
        if (Math.abs(sentiment) > 0.2) {
          const isBullishOnYes = sentiment > 0;
          const confidence = Math.abs(sentiment);
          
          const baseAmount = this.getBaseTradeAmount(actor) * 0.5; // Smaller amounts for predictions
          const amount = baseAmount * confidence;

          signals.push({
            type: 'prediction',
            marketId: market.id,
            action: 'buy',
            side: isBullishOnYes ? 'YES' : 'NO',
            amount,
            confidence,
            reason: this.extractReason(content, market.text.slice(0, 50)),
          });
        }
      }
    }

    return signals;
  }

  /**
   * Analyze sentiment of text (-1 to 1)
   */
  private static analyzeSentiment(text: string): number {
    const textLower = text.toLowerCase();
    
    // Bullish indicators
    const bullishWords = [
      'bullish', 'moon', 'pump', 'buy', 'long', 'calls', 'going up', 'rally',
      'yes', 'definitely', 'absolutely', 'confirmed', 'winning', 'success',
      '🚀', '📈', '💎', 'lfg', 'wagmi', 'gm', '100x', 'gem'
    ];
    
    // Bearish indicators
    const bearishWords = [
      'bearish', 'dump', 'sell', 'short', 'puts', 'going down', 'crash',
      'no', 'never', 'impossible', 'disaster', 'fail', 'losing', 'rug',
      '📉', '💩', 'ngmi', 'rekt', 'fud', 'scam'
    ];

    let score = 0;
    
    // Count bullish words
    for (const word of bullishWords) {
      if (textLower.includes(word)) {
        score += 0.2;
      }
    }
    
    // Count bearish words
    for (const word of bearishWords) {
      if (textLower.includes(word)) {
        score -= 0.2;
      }
    }

    // Clamp between -1 and 1
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Get base trade amount based on actor tier and personality
   */
  private static getBaseTradeAmount(actor: any): number {
    const tierMultipliers: Record<string, number> = {
      'S_TIER': 500,
      'A_TIER': 300,
      'B_TIER': 200,
      'C_TIER': 100,
    };

    const baseAmount = tierMultipliers[actor.tier || 'B_TIER'] || 200;

    // Add personality modifiers
    const personalityMultipliers: Record<string, number> = {
      'erratic visionary': 1.5,
      'disaster profiteer': 2.0, // Cramer goes all in
      'memecoin cultist': 1.8,
      'nft degen': 1.6,
      'vampire capitalist': 0.7, // Calculated
      'yacht philosopher': 0.6, // Conservative
    };

    const personalityMult = personalityMultipliers[actor.personality?.toLowerCase()] || 1.0;

    return baseAmount * personalityMult;
  }

  /**
   * Execute a trade for an NPC
   */
  private static async executeTrade(
    actor: any,
    signal: TradingSignal,
    postId: string,
    poolId: string | null
  ): Promise<void> {
    try {
      const balance = poolId
        ? await this.getPoolBalance(poolId)
        : parseFloat(actor.tradingBalance.toString());

      if (balance < signal.amount) {
        logger.warn(`Insufficient balance for ${actor.name}: ${balance} < ${signal.amount}`);
        return; // Not enough balance
      }

      // Get the trading entity ID (actor for personal, pool for pool trades)
      const traderId = poolId || actor.id;
      const currentPrice = signal.type === 'perp' ? await this.getMarketPrice(signal.ticker!) : 50;

      // Execute the actual trade
      let tradeSuccessful = false;
      try {
        if (signal.type === 'prediction' && signal.marketId) {
          // Execute prediction market trade
          tradeSuccessful = await this.executePredictionTrade(
            signal.marketId,
            signal.side as 'YES' | 'NO',
            signal.amount,
            poolId
          );
        } else if (signal.type === 'perp' && signal.ticker) {
          // Execute perpetual futures trade
          tradeSuccessful = await this.executePerpTrade(
            signal.ticker,
            signal.side as 'long' | 'short',
            signal.amount,
            poolId
          );
        }
      } catch (tradeError) {
        logger.error(`Trade execution failed for ${actor.name}:`, tradeError);
        tradeSuccessful = false;
      }

      // Only record the trade if it was successful
      if (tradeSuccessful) {
        await prisma.nPCTrade.create({
          data: {
            npcActorId: actor.id,
            poolId,
            marketType: signal.type,
            ticker: signal.ticker,
            marketId: signal.marketId,
            action: signal.action,
            side: signal.side,
            amount: signal.amount,
            price: currentPrice,
            sentiment: signal.confidence * (signal.side === 'NO' || signal.side === 'short' ? -1 : 1),
            reason: signal.reason,
            postId,
          },
        });

        logger.info(`NPC Trade executed: ${actor.name} ${signal.action} ${signal.ticker || signal.marketId} for ${poolId ? 'pool' : 'personal'}`);
      }
    } catch (error) {
      logger.error(`Error executing trade for ${actor.name}:`, error);
    }
  }

  /**
   * Execute a prediction market trade
   */
  private static async executePredictionTrade(
    marketId: string,
    side: 'YES' | 'NO',
    amount: number,
    poolId: string | null
  ): Promise<boolean> {
    try {
      // Get or create NPC user if trading for personal account
      if (!poolId) {
        // For personal trades, NPCs don't have user accounts yet
        // This is a simplified implementation that would need proper NPC user management
        logger.info(`Prediction trade simulation for personal NPC account: ${marketId} ${side} ${amount}`);
        return true;
      }

      // For pool trades, update pool position
      const pool = await prisma.pool.findUnique({
        where: { id: poolId },
      });

      if (!pool) return false;

      // Check pool has enough available balance
      const availableBalance = parseFloat(pool.availableBalance.toString());
      if (availableBalance < amount) {
        logger.warn(`Pool has insufficient balance: ${availableBalance} < ${amount}`);
        return false;
      }

      // Create or update pool position
      await prisma.$transaction(async (tx) => {
        // Deduct from available balance
        await tx.pool.update({
          where: { id: poolId },
          data: {
            availableBalance: {
              decrement: amount,
            },
          },
        });

        // Create position record
        await tx.poolPosition.create({
          data: {
            poolId,
            marketType: 'prediction',
            marketId,
            side,
            entryPrice: 50, // Simplified - should get actual price from market
            currentPrice: 50,
            size: amount,
            shares: amount, // Simplified - actual shares depend on odds
            unrealizedPnL: 0,
          },
        });
      });

      return true;
    } catch (error) {
      logger.error('Error executing prediction trade:', error);
      return false;
    }
  }

  /**
   * Execute a perpetual futures trade
   */
  private static async executePerpTrade(
    ticker: string,
    side: 'long' | 'short',
    amount: number,
    poolId: string | null
  ): Promise<boolean> {
    try {
      // For personal trades
      if (!poolId) {
        logger.info(`Perp trade simulation for personal NPC account: ${ticker} ${side} ${amount}`);
        return true;
      }

      // For pool trades
      const pool = await prisma.pool.findUnique({
        where: { id: poolId },
      });

      if (!pool) return false;

      const availableBalance = parseFloat(pool.availableBalance.toString());
      if (availableBalance < amount) {
        logger.warn(`Pool has insufficient balance: ${availableBalance} < ${amount}`);
        return false;
      }

      // Get current price
      const currentPrice = await this.getMarketPrice(ticker);

      // Create pool position
      await prisma.$transaction(async (tx) => {
        await tx.pool.update({
          where: { id: poolId },
          data: {
            availableBalance: {
              decrement: amount,
            },
          },
        });

        // Default 5x leverage for NPCs
        const leverage = 5;
        const positionSize = amount * leverage;
        const liquidationDistance = side === 'long' ? 0.8 : 1.2; // 20% move against position
        const liquidationPrice = currentPrice * liquidationDistance;

        await tx.poolPosition.create({
          data: {
            poolId,
            marketType: 'perp',
            ticker,
            side,
            entryPrice: currentPrice,
            currentPrice,
            size: positionSize,
            leverage,
            liquidationPrice,
            unrealizedPnL: 0,
          },
        });
      });

      return true;
    } catch (error) {
      logger.error('Error executing perp trade:', error);
      return false;
    }
  }

  /**
   * Get pool available balance
   */
  private static async getPoolBalance(poolId: string): Promise<number> {
    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      select: { availableBalance: true },
    });

    return pool ? parseFloat(pool.availableBalance.toString()) : 0;
  }

  /**
   * Get current market price for a ticker
   */
  private static async getMarketPrice(ticker: string): Promise<number> {
    const org = await prisma.organization.findFirst({
      where: {
        id: {
          contains: ticker.toLowerCase(),
        },
      },
      select: { currentPrice: true },
    });

    return org?.currentPrice || 100;
  }

  /**
   * Extract reason from post content
   */
  private static extractReason(content: string, context: string): string {
    // Truncate content to reasonable length
    const truncated = content.slice(0, 200);
    return `Post mentioning ${context}: "${truncated}${content.length > 200 ? '...' : ''}"`;
  }

  /**
   * Extract keywords from question text
   */
  private static extractKeywords(text: string): string[] {
    // Remove common words and extract important terms
    const commonWords = new Set([
      'will', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'would',
      'should', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'on',
      'at', 'by', 'for', 'with', 'from', 'as', 'this', 'that'
    ]);

    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10); // Top 10 keywords
  }

  /**
   * Process all recent posts and execute NPC trades
   */
  static async processRecentPosts(marketContext: MarketContext): Promise<void> {
    try {
      // Get recent posts (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentPosts = await prisma.post.findMany({
        where: {
          createdAt: {
            gte: oneHourAgo,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      logger.info(`Processing ${recentPosts.length} recent posts for NPC trading`);

      for (const post of recentPosts) {
        await this.analyzePostAndTrade(
          post.id,
          post.content,
          post.authorId,
          marketContext
        );
      }
    } catch (error) {
      logger.error('Error processing recent posts:', error);
    }
  }
}


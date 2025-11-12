/**
 * Trade Execution Service
 *
 * Executes LLM-generated trading decisions for NPCs.
 * Creates positions, updates balances, records trades.
 */
import { logger } from '@/lib/logger';
import { getReadyPerpsEngine } from '@/lib/perps-service';
import { prisma } from '@/lib/prisma';
import { generateSnowflakeId } from '@/lib/snowflake';

import type {
  ExecutedTrade,
  ExecutionResult,
  TradingDecision,
} from '@/types/market-decisions';

import {
  type AggregatedImpact,
  type TradeImpactInput,
  aggregateTradeImpacts,
} from './market-impact-service';

export class TradeExecutionService {
  /**
   * Execute a batch of trading decisions
   */
  async executeDecisionBatch(
    decisions: TradingDecision[]
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    const result: ExecutionResult = {
      totalDecisions: decisions.length,
      successfulTrades: 0,
      failedTrades: 0,
      holdDecisions: 0,
      totalVolumePerp: 0,
      totalVolumePrediction: 0,
      errors: [],
      executedTrades: [],
    };

    for (const decision of decisions) {
      if (decision.action === 'hold') {
        result.holdDecisions++;
        continue;
      }

      try {
        const executedTrade = await this.executeSingleDecision(decision);
        result.executedTrades.push(executedTrade);
        result.successfulTrades++;

        if (executedTrade.marketType === 'perp') {
          result.totalVolumePerp += executedTrade.size;
        } else {
          result.totalVolumePrediction += executedTrade.size;
        }
      } catch (error) {
        result.failedTrades++;
        result.errors.push({
          npcId: decision.npcId,
          decision,
          error: error instanceof Error ? error.message : String(error),
        });

        logger.error(
          `Failed to execute trade for ${decision.npcName}`,
          {
            error,
            decision,
          },
          'TradeExecutionService'
        );
      }
    }

    const duration = Date.now() - startTime;

    logger.info(
      `Executed ${result.successfulTrades} trades in ${duration}ms`,
      {
        ...result,
        durationMs: duration,
      },
      'TradeExecutionService'
    );

    return result;
  }

  /**
   * Execute a single trading decision
   */
  async executeSingleDecision(
    decision: TradingDecision
  ): Promise<ExecutedTrade> {
    // Get NPC's pool
    const actor = await prisma.actor.findUnique({
      where: { id: decision.npcId },
      include: {
        Pool: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!actor) {
      throw new Error(`Actor not found: ${decision.npcId}`);
    }

    const pool = actor.Pool[0];
    if (!pool) {
      throw new Error(`No active pool found for ${decision.npcName}`);
    }

    // Handle close position
    if (decision.action === 'close_position') {
      return await this.closePosition(decision, pool.id);
    }

    // Handle open position
    if (decision.action === 'open_long' || decision.action === 'open_short') {
      return await this.openPerpPosition(decision, pool.id);
    }

    if (decision.action === 'buy_yes' || decision.action === 'buy_no') {
      return await this.openPredictionPosition(decision, pool.id);
    }

    throw new Error(`Unknown action: ${decision.action}`);
  }

  /**
   * Open a perpetual position
   */
  private async openPerpPosition(
    decision: TradingDecision,
    poolId: string
  ): Promise<ExecutedTrade> {
    if (!decision.ticker) {
      throw new Error('Ticker required for perp position');
    }

    // Get current price
    // Ticker is derived from org ID by removing dashes, uppercasing, and truncating to 12 chars
    // So we need to find org where: org.id.toUpperCase().replace(/-/g, '').substring(0, 12) === ticker
    const ticker = decision.ticker.toUpperCase();
    const allOrgs = await prisma.organization.findMany({
      where: { type: 'company' },
    });

    const org = allOrgs.find((o) => {
      const orgTicker = o.id.toUpperCase().replace(/-/g, '').substring(0, 12);
      return orgTicker === ticker;
    });

    if (!org?.currentPrice) {
      throw new Error(`Organization not found for ticker: ${decision.ticker}`);
    }

    const currentPrice = org.currentPrice;
    const leverage = 5; // Standard leverage
    const side = decision.action === 'open_long' ? 'long' : 'short';

    // NPC pool trades have NO trading fees (only 5% performance fee on withdrawal)
    const positionSize = decision.amount * leverage;

    // Calculate liquidation price
    const liquidationDistance = side === 'long' ? 0.8 : 1.2;
    const liquidationPrice = currentPrice * liquidationDistance;

    // Execute in transaction
    const position = await prisma.$transaction(async (tx) => {
      // Check and deduct from pool balance
      const pool = await tx.pool.findUnique({ where: { id: poolId } });
      if (!pool) throw new Error(`Pool not found: ${poolId}`);

      const availableBalance = parseFloat(pool.availableBalance.toString());
      if (availableBalance < decision.amount) {
        throw new Error(
          `Insufficient pool balance: ${availableBalance} < ${decision.amount}`
        );
      }

      // Deduct from pool
      await tx.pool.update({
        where: { id: poolId },
        data: {
          availableBalance: { decrement: decision.amount },
        },
      });

      // Create position
      const pos = await tx.poolPosition.create({
        data: {
          id: generateSnowflakeId(),
          poolId,
          marketType: 'perp',
          ticker: decision.ticker!,
          side,
          entryPrice: currentPrice,
          currentPrice,
          size: positionSize,
          leverage,
          liquidationPrice,
          unrealizedPnL: 0,
          updatedAt: new Date(),
        },
      });

      // Record trade
      await tx.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: decision.npcId,
          poolId,
          marketType: 'perp',
          ticker: decision.ticker!,
          action: decision.action,
          side,
          amount: decision.amount,
          price: currentPrice,
          sentiment: decision.confidence * (side === 'long' ? 1 : -1),
          reason: decision.reasoning,
        },
      });

      return pos;
    });

    // Integrate with PerpetualsEngine after DB creation
    try {
      const perpsEngine = await getReadyPerpsEngine();
      
      // Add position to engine using poolId as userId (for NPC positions)
      // The engine will track this position and update it on price changes
      perpsEngine.openPoolPosition(position.id, poolId, {
        ticker: decision.ticker!,
        side,
        size: positionSize,
        leverage,
        entryPrice: currentPrice,
        currentPrice,
        liquidationPrice,
        organizationId: org.id,
      });

      logger.debug(
        'NPC perp position added to engine',
        {
          positionId: position.id,
          poolId,
          ticker: decision.ticker,
        },
        'TradeExecutionService'
      );
    } catch (error) {
      // Log error but don't fail the trade - engine integration is best effort
      logger.error(
        'Failed to add NPC position to PerpetualsEngine',
        {
          positionId: position.id,
          poolId,
          ticker: decision.ticker,
          error,
        },
        'TradeExecutionService'
      );
      // Position is still created in DB, so trade succeeds
    }

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId,
      marketType: 'perp',
      ticker: decision.ticker,
      action: decision.action,
      side,
      amount: decision.amount,
      size: positionSize,
      executionPrice: currentPrice,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      positionId: position.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Open a prediction market position
   */
  private async openPredictionPosition(
    decision: TradingDecision,
    poolId: string
  ): Promise<ExecutedTrade> {
    if (!decision.marketId) {
      throw new Error('MarketId required for prediction position');
    }

    // Get market
    const market = await prisma.market.findUnique({
      where: { id: decision.marketId.toString() },
    });

    if (!market) {
      throw new Error(`Market not found: ${decision.marketId}`);
    }

    const yesShares = parseFloat(market.yesShares.toString());
    const noShares = parseFloat(market.noShares.toString());
    const totalShares = yesShares + noShares;

    const yesPrice = totalShares > 0 ? (yesShares / totalShares) * 100 : 50;
    const noPrice = totalShares > 0 ? (noShares / totalShares) * 100 : 50;

    const side = decision.action === 'buy_yes' ? 'YES' : 'NO';
    const entryPrice = side === 'YES' ? yesPrice : noPrice;

    // NPC pool trades have NO trading fees (only 5% performance fee on withdrawal)
    const shares = decision.amount; // Direct 1:1

    // Execute in transaction
    const position = await prisma.$transaction(async (tx) => {
      // Check and deduct from pool balance
      const pool = await tx.pool.findUnique({ where: { id: poolId } });
      if (!pool) throw new Error(`Pool not found: ${poolId}`);

      const availableBalance = parseFloat(pool.availableBalance.toString());
      if (availableBalance < decision.amount) {
        throw new Error(
          `Insufficient pool balance: ${availableBalance} < ${decision.amount}`
        );
      }

      // Deduct from pool
      await tx.pool.update({
        where: { id: poolId },
        data: {
          availableBalance: { decrement: decision.amount },
        },
      });

      // Update market shares
      await tx.market.update({
        where: { id: decision.marketId!.toString() },
        data: {
          [side === 'YES' ? 'yesShares' : 'noShares']: {
            increment: shares,
          },
        },
      });

      // Create position
      const pos = await tx.poolPosition.create({
        data: {
          id: generateSnowflakeId(),
          poolId,
          marketType: 'prediction',
          marketId: decision.marketId!.toString(),
          side,
          entryPrice,
          currentPrice: entryPrice,
          size: decision.amount,
          shares,
          unrealizedPnL: 0,
          updatedAt: new Date(),
        },
      });

      // Record trade
      await tx.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: decision.npcId,
          poolId,
          marketType: 'prediction',
          marketId: decision.marketId!.toString(),
          action: decision.action,
          side,
          amount: decision.amount,
          price: entryPrice,
          sentiment: decision.confidence * (side === 'YES' ? 1 : -1),
          reason: decision.reasoning,
        },
      });

      return pos;
    });

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId,
      marketType: 'prediction',
      marketId: decision.marketId,
      action: decision.action,
      side,
      amount: decision.amount,
      size: decision.amount,
      shares,
      executionPrice: entryPrice,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      positionId: position.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Close an existing position
   */
  private async closePosition(
    decision: TradingDecision,
    poolId: string
  ): Promise<ExecutedTrade> {
    if (!decision.positionId) {
      throw new Error('PositionId required to close position');
    }

    const position = await prisma.poolPosition.findUnique({
      where: { id: decision.positionId },
    });

    if (!position) {
      throw new Error(`Position not found: ${decision.positionId}`);
    }

    if (position.closedAt) {
      throw new Error(`Position already closed: ${decision.positionId}`);
    }

    // Get current price
    let currentPrice = position.currentPrice;

    if (position.marketType === 'perp' && position.ticker) {
      const org = await prisma.organization.findFirst({
        where: { id: { contains: position.ticker.toLowerCase() } },
      });
      if (org?.currentPrice) {
        currentPrice = org.currentPrice;
      }

      // Remove position from PerpetualsEngine if it's a perp position
      try {
        const perpsEngine = await getReadyPerpsEngine();
        if (perpsEngine.hasPosition(decision.positionId)) {
          perpsEngine.closePosition(decision.positionId, currentPrice);
          logger.debug(
            'NPC perp position removed from engine',
            {
              positionId: decision.positionId,
              poolId,
            },
            'TradeExecutionService'
          );
        }
      } catch (error) {
        // Log error but don't fail the close - engine removal is best effort
        logger.error(
          'Failed to remove NPC position from PerpetualsEngine',
          {
            positionId: decision.positionId,
            poolId,
            error,
          },
          'TradeExecutionService'
        );
      }
    } else if (position.marketType === 'prediction' && position.marketId) {
      const market = await prisma.market.findUnique({
        where: { id: position.marketId },
      });
      if (market) {
        const yesShares = parseFloat(market.yesShares.toString());
        const noShares = parseFloat(market.noShares.toString());
        const totalShares = yesShares + noShares;
        if (totalShares > 0) {
          currentPrice =
            position.side === 'YES'
              ? (yesShares / totalShares) * 100
              : (noShares / totalShares) * 100;
        }
      }
    }

    // Calculate P&L
    const priceChange = currentPrice - position.entryPrice;
    const isLong = position.side === 'long' || position.side === 'YES';
    const pnlMultiplier = isLong ? 1 : -1;

    let realizedPnL: number;
    if (position.marketType === 'perp') {
      const percentChange = priceChange / position.entryPrice;
      realizedPnL = percentChange * position.size * pnlMultiplier;
    } else {
      const shares = position.shares || 0;
      realizedPnL = (priceChange / 100) * shares;
    }

    // NPC pool trades have NO trading fees (only 5% performance fee on withdrawal)

    // Execute in transaction
    await prisma.$transaction(async (tx) => {
      // Close position
      await tx.poolPosition.update({
        where: { id: decision.positionId! },
        data: {
          closedAt: new Date(),
          currentPrice,
          unrealizedPnL: 0,
          realizedPnL,
        },
      });

      // Return capital + P&L to pool (no trading fee)
      const returnAmount = position.size + realizedPnL;

      await tx.pool.update({
        where: { id: poolId },
        data: {
          availableBalance: { increment: returnAmount },
          lifetimePnL: { increment: realizedPnL },
        },
      });

      // Record trade
      await tx.nPCTrade.create({
        data: {
          id: generateSnowflakeId(),
          npcActorId: decision.npcId,
          poolId,
          marketType: position.marketType,
          ticker: position.ticker,
          marketId: position.marketId,
          action: 'close',
          side: position.side,
          amount: position.size,
          price: currentPrice,
          sentiment: 0,
          reason: decision.reasoning,
        },
      });
    });

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId,
      marketType: position.marketType as 'perp' | 'prediction',
      ticker: position.ticker || undefined,
      marketId: position.marketId ? parseInt(position.marketId) : undefined,
      action: 'close_position',
      side: position.side,
      amount: position.size,
      size: position.size,
      shares: position.shares || undefined,
      executionPrice: currentPrice,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      positionId: position.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get total trade impact by ticker/market
   */
  async getTradeImpacts(
    executedTrades: ExecutedTrade[]
  ): Promise<Map<string, AggregatedImpact>> {
    const inputs: TradeImpactInput[] = executedTrades.map((trade) => ({
      marketType: trade.marketType,
      ticker: trade.ticker,
      marketId: trade.marketId,
      side: trade.side,
      size: trade.size,
    }));

    return aggregateTradeImpacts(inputs);
  }
}

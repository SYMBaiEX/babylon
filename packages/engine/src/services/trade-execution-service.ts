/**
 * Trade Execution Service
 *
 * Executes LLM-generated trading decisions for NPCs.
 * Creates positions, updates balances, records trades.
 */
import {
  actors,
  db,
  eq,
  ilike,
  markets,
  npcTrades,
  organizations,
  poolPositions,
  pools,
  type Transaction,
} from '@babylon/db';

import { logger } from '@babylon/shared';
import { PredictionPricing } from '../prediction-pricing';
import { generateSnowflakeId } from '@babylon/shared';
import type {
  ExecutedTrade,
  TradingDecision,
  TradingExecutionResult,
} from '../types/market-decisions';
import { FeeService } from './fee-service';
import {
  aggregateTradeImpacts,
  type AggregatedImpact,
  type TradeImpactInput,
} from './market-impact-service';
import {
  PredictionMarketService,
} from './prediction-market-service';
import { invalidateAfterPredictionTrade } from './trade-cache-invalidation';

export class TradeExecutionService {
  /**
   * Execute a batch of trading decisions
   */
  async executeDecisionBatch(
    decisions: TradingDecision[]
  ): Promise<TradingExecutionResult> {
    const startTime = Date.now();

    const result: TradingExecutionResult = {
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          npcId: decision.npcId,
          decision,
          error: errorMessage,
        });

        // Use warn level for expected failures (non-existent organizations, insufficient balance)
        // Use error level for unexpected system failures
        const isExpectedFailure =
          errorMessage.includes('Organization not found') ||
          errorMessage.includes('Insufficient trading balance') ||
          errorMessage.includes('Market not found') ||
          errorMessage.includes('Market already resolved') ||
          errorMessage.includes('Market expired');
        const logLevel = isExpectedFailure ? 'warn' : 'error';

        logger[logLevel](
          `Failed to execute trade for ${decision.npcName}`,
          {
            error,
            decision,
          },
          'TradeExecutionService'
        );

        // FAIL FAST in development: throw on any trade execution error
        if (process.env.NODE_ENV !== 'production' && !isExpectedFailure) {
          throw new Error(
            `[DEV] NPC trade execution failed for ${decision.npcName}: ${errorMessage}`,
            { cause: error }
          );
        }
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
    // Normalize NPC ID to lowercase for case-insensitive lookup
    const normalizedNpcId = decision.npcId.toLowerCase();

    // Normalize amount - handle string amounts with commas (e.g., "12,000" -> 12000)
    if (typeof decision.amount === 'string') {
      const cleanedAmount = String(decision.amount).replace(/,/g, '');
      decision.amount = Number.parseFloat(cleanedAmount);
    }

    // For close_position, amount=0 is valid (we close the full position)
    // For other actions, amount must be > 0
    const isClosePosition = decision.action === 'close_position';
    if (isNaN(decision.amount)) {
      throw new Error(`Invalid amount (NaN): ${decision.amount}`);
    }
    if (!isClosePosition && decision.amount <= 0) {
      throw new Error(`Invalid amount: ${decision.amount}`);
    }

    // Get NPC actor
    const [actor] = await db
      .select()
      .from(actors)
      .where(eq(actors.id, normalizedNpcId))
      .limit(1);

    if (!actor) {
      throw new Error(`Actor not found: ${decision.npcId}`);
    }

    // Update decision to use normalized ID
    decision.npcId = normalizedNpcId;

    // Balance checks are performed inside transactions to ensure atomicity
    // and prevent race conditions when multiple trades are queued for the same NPC

    // Handle close position
    if (decision.action === 'close_position') {
      return await this.closePosition(decision, actor.id);
    }

    // Handle open position
    if (decision.action === 'open_long' || decision.action === 'open_short') {
      return await this.openPerpPosition(decision, actor.id);
    }

    if (decision.action === 'buy_yes' || decision.action === 'buy_no') {
      return await this.openPredictionPosition(decision, actor.id);
    }

    throw new Error(`Unknown action: ${decision.action}`);
  }

  /**
   * Open a perpetual position
   */
  private async openPerpPosition(
    decision: TradingDecision,
    actorId: string
  ): Promise<ExecutedTrade> {
    if (!decision.ticker) {
      throw new Error('Ticker required for perp position');
    }

    // Try multiple lookup strategies to handle LLM-generated ticker variations
    const tickerUpper = decision.ticker.toUpperCase();
    const tickerLower = decision.ticker.toLowerCase();

    // Strategy 1: Exact ID match
    let [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, decision.ticker))
      .limit(1);

    // Strategy 2: Ticker field match (case-insensitive)
    if (!org) {
      [org] = await db
        .select()
        .from(organizations)
        .where(ilike(organizations.ticker, tickerUpper))
        .limit(1);
    }

    // Strategy 3: ID contains match (for partial matches)
    if (!org) {
      [org] = await db
        .select()
        .from(organizations)
        .where(ilike(organizations.id, `%${tickerLower}%`))
        .limit(1);
    }

    // Strategy 4: Name match (normalized - remove spaces, dashes, AI suffixes)
    if (!org) {
      const normalizedTicker = tickerLower.replace(/[^a-z0-9]/g, '');
      const orgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.type, 'company'));

      const matchedOrg = orgs.find((o) => {
        if (!o.currentPrice) return false;
        const normalizedName = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedOrgTicker = (o.ticker || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const normalizedOrgId = o.id.toLowerCase().replace(/[^a-z0-9]/g, '');

        return (
          normalizedName === normalizedTicker ||
          normalizedOrgTicker === normalizedTicker ||
          normalizedOrgId === normalizedTicker ||
          normalizedName.includes(normalizedTicker) ||
          normalizedTicker.includes(normalizedName)
        );
      });

      if (matchedOrg) {
        org = matchedOrg;
      }
    }

    if (!org?.currentPrice) {
      logger.warn(
        'NPC tried to trade non-existent organization',
        {
          npcId: decision.npcId,
          npcName: decision.npcName,
          ticker: decision.ticker,
          action: decision.action,
        },
        'TradeExecutionService'
      );
      throw new Error(`Organization not found: ${decision.ticker}`);
    }

    const currentPrice = org.currentPrice;
    const leverage = 5; // Standard leverage
    const side = decision.action === 'open_long' ? 'long' : 'short';

    // Calculate trading fee (0.1% on position size)
    const positionSize = decision.amount * leverage;
    const feeCalc = FeeService.calculateFee(positionSize);
    const totalCost = decision.amount + feeCalc.feeAmount;

    // Calculate liquidation price
    const liquidationDistance = side === 'long' ? 0.8 : 1.2;
    const liquidationPrice = currentPrice * liquidationDistance;

    // Execute in transaction
    const position = await db.transaction(async (tx: Transaction) => {
      // Check and deduct from actor's trading balance (margin + fee)
      const [actor] = await tx
        .select()
        .from(actors)
        .where(eq(actors.id, actorId))
        .limit(1);

      if (!actor) throw new Error(`Actor not found: ${actorId}`);

      const availableBalance = Number.parseFloat(
        actor.tradingBalance.toString()
      );
      if (availableBalance < totalCost) {
        throw new Error(
          `Insufficient trading balance: ${availableBalance} < ${totalCost} (margin: ${decision.amount}, fee: ${feeCalc.feeAmount})`
        );
      }

      // Deduct margin + fee from actor's trading balance
      await tx
        .update(actors)
        .set({
          tradingBalance: String(availableBalance - totalCost),
        })
        .where(eq(actors.id, actorId));

      // Ensure Pool exists for this actor (required for PoolPosition foreign key)
      const [existingPool] = await tx
        .select()
        .from(pools)
        .where(eq(pools.id, actorId))
        .limit(1);

      if (!existingPool) {
        const now = new Date();
        await tx.insert(pools).values({
          id: actorId,
          npcActorId: actorId,
          name: `${actor.name} Portfolio`,
          description: `Auto-created portfolio for ${actor.name}`,
          isActive: true,
          totalValue: '0',
          totalDeposits: '0',
          availableBalance: '0',
          lifetimePnL: '0',
          performanceFeeRate: 0.05,
          totalFeesCollected: '0',
          openedAt: now,
          updatedAt: now,
          status: 'ACTIVE',
        });
      }

      // Create position (using actorId as poolId for backward compatibility)
      // Store the raw organization ID as ticker for database consistency
      const positionId = await generateSnowflakeId();
      const now = new Date();

      await tx.insert(poolPositions).values({
        id: positionId,
        poolId: actorId, // Using actorId for backward compatibility with existing schema
        marketType: 'perp',
        ticker: org.id, // Use raw org ID for database storage
        side,
        entryPrice: currentPrice,
        currentPrice,
        size: positionSize,
        leverage,
        liquidationPrice,
        unrealizedPnL: 0,
        updatedAt: now,
      });

      // Record trade (poolId is optional now)
      await tx.insert(npcTrades).values({
        id: await generateSnowflakeId(),
        npcActorId: decision.npcId,
        poolId: null, // No longer using pools
        marketType: 'perp',
        ticker: org.id, // Use raw org ID for database storage
        action: decision.action,
        side,
        amount: decision.amount,
        price: currentPrice,
        sentiment: decision.confidence * (side === 'long' ? 1 : -1),
        reason: decision.reasoning,
      });

      // Get the created position
      const [pos] = await tx
        .select()
        .from(poolPositions)
        .where(eq(poolPositions.id, positionId))
        .limit(1);

      return pos!;
    });

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId: actorId, // Using actorId for backward compatibility
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
    actorId: string
  ): Promise<ExecutedTrade> {
    if (!decision.marketId) {
      throw new Error('MarketId required for prediction position');
    }

    // Get market
    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.id, decision.marketId.toString()))
      .limit(1);

    if (!market) {
      throw new Error(`Market not found: ${decision.marketId}`);
    }

    if (market.resolved) {
      throw new Error(`Market already resolved: ${decision.marketId}`);
    }

    if (new Date() > market.endDate) {
      throw new Error(`Market expired: ${decision.marketId}`);
    }

    const side = decision.action === 'buy_yes' ? 'YES' : 'NO';
    const sideLabel: 'yes' | 'no' = side === 'YES' ? 'yes' : 'no';

    const calculation = PredictionPricing.calculateBuyWithFees(
      Number(market.yesShares),
      Number(market.noShares),
      side === 'YES' ? 'yes' : 'no',
      decision.amount
    );

    if (calculation.netAmount <= 0) {
      throw new Error('Trade amount too low after fees');
    }

    const totalWithFee = calculation.totalWithFee ?? decision.amount;
    const entryPrice = calculation.avgPrice * 100;
    const postTradePrice =
      (side === 'YES' ? calculation.newYesPrice : calculation.newNoPrice) * 100;

    // Execute in transaction
    const position = await db.transaction(async (tx: Transaction) => {
      // Check and deduct from actor's trading balance (amount + fee)
      const [actor] = await tx
        .select()
        .from(actors)
        .where(eq(actors.id, actorId))
        .limit(1);

      if (!actor) throw new Error(`Actor not found: ${actorId}`);

      const availableBalance = Number.parseFloat(
        actor.tradingBalance.toString()
      );
      if (availableBalance < totalWithFee) {
        throw new Error(
          `Insufficient trading balance: ${availableBalance} < ${totalWithFee} (amount: ${decision.amount}, fee: ${calculation.fee})`
        );
      }

      // Deduct amount + fee from actor's trading balance
      await tx
        .update(actors)
        .set({
          tradingBalance: String(availableBalance - totalWithFee),
        })
        .where(eq(actors.id, actorId));

      // Update market shares with CPMM output
      await tx
        .update(markets)
        .set({
          yesShares: String(calculation.newYesShares),
          noShares: String(calculation.newNoShares),
          liquidity: String(Number(market.liquidity) + calculation.netAmount),
        })
        .where(eq(markets.id, decision.marketId!.toString()));

      const now = new Date();
      const positionId = await generateSnowflakeId();

      // Create position (using actorId as poolId for backward compatibility)
      await tx.insert(poolPositions).values({
        id: positionId,
        poolId: actorId, // Using actorId for backward compatibility with existing schema
        marketType: 'prediction',
        marketId: decision.marketId!.toString(),
        side,
        entryPrice,
        currentPrice: postTradePrice,
        size: calculation.netAmount,
        shares: calculation.sharesBought,
        unrealizedPnL: 0,
        openedAt: now,
        updatedAt: now,
      });

      // Record trade (poolId is optional now)
      await tx.insert(npcTrades).values({
        id: await generateSnowflakeId(),
        npcActorId: decision.npcId,
        poolId: null, // No longer using pools
        marketType: 'prediction',
        marketId: decision.marketId!.toString(),
        action: decision.action,
        side,
        amount: totalWithFee,
        price: entryPrice,
        sentiment: decision.confidence * (side === 'YES' ? 1 : -1),
        reason: decision.reasoning,
      });

      // Get the created position
      const [pos] = await tx
        .select()
        .from(poolPositions)
        .where(eq(poolPositions.id, positionId))
        .limit(1);

      return pos!;
    });

    const liquidityAfter =
      Number(market.liquidity ?? 0) + calculation.netAmount;

    await PredictionMarketService.recordSnapshot({
      marketId: decision.marketId!.toString(),
      yesPrice: calculation.newYesPrice,
      noPrice: calculation.newNoPrice,
      yesShares: calculation.newYesShares,
      noShares: calculation.newNoShares,
      liquidity: liquidityAfter,
      eventType: 'trade',
      source: 'npc_trade',
    }).catch((error) => {
      logger.warn(
        'Failed to record price history for NPC buy',
        { error, marketId: decision.marketId },
        'TradeExecutionService'
      );
    });

    await invalidateAfterPredictionTrade(decision.marketId).catch((error) => {
      logger.warn(
        'Failed to invalidate cache after NPC prediction buy',
        { error, marketId: decision.marketId },
        'TradeExecutionService'
      );
    });

    PredictionMarketService.emitTradeUpdate({
      marketId: decision.marketId!.toString(),
      yesPrice: calculation.newYesPrice,
      noPrice: calculation.newNoPrice,
      yesShares: calculation.newYesShares,
      noShares: calculation.newNoShares,
      liquidity: liquidityAfter,
      trade: {
        actorType: 'npc',
        actorId: decision.npcId,
        action: 'buy',
        side: sideLabel,
        shares: calculation.sharesBought,
        amount: calculation.netAmount,
        price: entryPrice,
        source: 'npc_trade',
        timestamp: new Date().toISOString(),
      },
    });

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId: actorId, // Using actorId for backward compatibility
      marketType: 'prediction',
      marketId: decision.marketId,
      action: decision.action,
      side,
      amount: totalWithFee,
      size: calculation.netAmount,
      shares: calculation.sharesBought,
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
    actorId: string
  ): Promise<ExecutedTrade> {
    if (!decision.positionId) {
      throw new Error('PositionId required to close position');
    }

    const [position] = await db
      .select()
      .from(poolPositions)
      .where(eq(poolPositions.id, decision.positionId))
      .limit(1);

    if (!position) {
      throw new Error(`Position not found: ${decision.positionId}`);
    }

    if (position.closedAt) {
      throw new Error(`Position already closed: ${decision.positionId}`);
    }

    const now = new Date();

    if (position.marketType === 'prediction') {
      if (!position.marketId) {
        throw new Error(`Prediction position missing marketId: ${position.id}`);
      }

      const shares = position.shares ?? 0;
      if (shares <= 0) {
        throw new Error(
          `Prediction position has no shares to close: ${position.id}`
        );
      }

      const side =
        position.side === 'YES' || position.side === 'NO'
          ? position.side
          : null;
      if (!side) {
        throw new Error(`Invalid prediction position side: ${position.side}`);
      }

      const [market] = await db
        .select()
        .from(markets)
        .where(eq(markets.id, position.marketId))
        .limit(1);

      if (!market) {
        throw new Error(`Market not found: ${position.marketId}`);
      }

      const calculation = PredictionPricing.calculateSellWithFees(
        Number(market.yesShares),
        Number(market.noShares),
        side === 'YES' ? 'yes' : 'no',
        shares
      );

      const grossProceeds = calculation.totalCost;
      const netProceeds = calculation.netProceeds ?? calculation.netAmount;

      if (netProceeds <= 0) {
        throw new Error(
          `Calculated net proceeds must be positive (position ${position.id})`
        );
      }

      const exitPrice = calculation.avgPrice * 100;
      const postTradePrice =
        (side === 'YES' ? calculation.newYesPrice : calculation.newNoPrice) *
        100;
      const realizedPnL = netProceeds - position.size;
      const liquidityAfter = Math.max(
        0,
        Number(market.liquidity ?? 0) - grossProceeds
      );
      const sideLabel: 'yes' | 'no' = side === 'YES' ? 'yes' : 'no';

      await db.transaction(async (tx: Transaction) => {
        await tx
          .update(poolPositions)
          .set({
            closedAt: now,
            currentPrice: postTradePrice,
            unrealizedPnL: 0,
            realizedPnL,
            updatedAt: now,
          })
          .where(eq(poolPositions.id, position.id));

        await tx
          .update(markets)
          .set({
            yesShares: String(calculation.newYesShares),
            noShares: String(calculation.newNoShares),
            liquidity: String(
              Math.max(0, Number(market.liquidity) - grossProceeds)
            ),
          })
          .where(eq(markets.id, position.marketId!));

        // Return proceeds to actor's trading balance
        const [actor] = await tx
          .select()
          .from(actors)
          .where(eq(actors.id, actorId))
          .limit(1);

        if (actor) {
          const currentBalance = Number.parseFloat(
            actor.tradingBalance.toString()
          );
          await tx
            .update(actors)
            .set({
              tradingBalance: String(currentBalance + netProceeds),
            })
            .where(eq(actors.id, actorId));
        }

        // Record trade (poolId is optional now)
        await tx.insert(npcTrades).values({
          id: await generateSnowflakeId(),
          npcActorId: decision.npcId,
          poolId: null, // No longer using pools
          marketType: 'prediction',
          marketId: position.marketId,
          action: 'close',
          side,
          amount: netProceeds,
          price: exitPrice,
          sentiment: 0,
          reason: decision.reasoning,
        });
      });

      await PredictionMarketService.recordSnapshot({
        marketId: position.marketId,
        yesPrice: calculation.newYesPrice,
        noPrice: calculation.newNoPrice,
        yesShares: calculation.newYesShares,
        noShares: calculation.newNoShares,
        liquidity: liquidityAfter,
        eventType: 'trade',
        source: 'npc_trade',
      }).catch((error) => {
        logger.warn(
          'Failed to record price history for NPC close',
          { error, marketId: position.marketId },
          'TradeExecutionService'
        );
      });

      await invalidateAfterPredictionTrade(position.marketId).catch((error) => {
        logger.warn(
          'Failed to invalidate cache after NPC prediction close',
          { error, marketId: position.marketId },
          'TradeExecutionService'
        );
      });

      PredictionMarketService.emitTradeUpdate({
        marketId: position.marketId,
        yesPrice: calculation.newYesPrice,
        noPrice: calculation.newNoPrice,
        yesShares: calculation.newYesShares,
        noShares: calculation.newNoShares,
        liquidity: liquidityAfter,
        trade: {
          actorType: 'npc',
          actorId: decision.npcId,
          action: 'sell',
          side: sideLabel,
          shares,
          amount: netProceeds,
          price: calculation.avgPrice,
          source: 'npc_trade',
          timestamp: now.toISOString(),
        },
      });

      return {
        npcId: decision.npcId,
        npcName: decision.npcName,
        poolId: actorId, // Using actorId for backward compatibility
        marketType: 'prediction',
        marketId: position.marketId ?? undefined,
        action: 'close_position',
        side,
        amount: netProceeds,
        size: position.size,
        shares: position.shares ?? undefined,
        executionPrice: exitPrice,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        positionId: position.id,
        timestamp: now.toISOString(),
      };
    }

    // Get current price
    let currentPrice = position.currentPrice;

    if (position.marketType === 'perp' && position.ticker) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(ilike(organizations.id, `%${position.ticker}%`))
        .limit(1);

      if (org?.currentPrice) {
        currentPrice = org.currentPrice;
      }
    } else if (position.marketType === 'prediction' && position.marketId) {
      const [market] = await db
        .select()
        .from(markets)
        .where(eq(markets.id, position.marketId))
        .limit(1);

      if (market) {
        const yesShares = Number.parseFloat(market.yesShares.toString());
        const noShares = Number.parseFloat(market.noShares.toString());
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

    // Calculate trading fee (0.1% on position size)
    const feeCalc = FeeService.calculateFee(position.size);
    const grossReturn = position.size + realizedPnL;
    const netReturn = Math.max(0, grossReturn - feeCalc.feeAmount);

    // Execute in transaction
    await db.transaction(async (tx: Transaction) => {
      // Close position
      await tx
        .update(poolPositions)
        .set({
          closedAt: now,
          currentPrice,
          unrealizedPnL: 0,
          realizedPnL,
          updatedAt: now,
        })
        .where(eq(poolPositions.id, decision.positionId!));

      // Return capital + P&L to actor's trading balance (after fee deduction)
      const [actor] = await tx
        .select()
        .from(actors)
        .where(eq(actors.id, actorId))
        .limit(1);

      if (actor) {
        const currentBalance = Number.parseFloat(
          actor.tradingBalance.toString()
        );
        await tx
          .update(actors)
          .set({
            tradingBalance: String(currentBalance + netReturn),
          })
          .where(eq(actors.id, actorId));
      }

      // Record trade (poolId is optional now)
      await tx.insert(npcTrades).values({
        id: await generateSnowflakeId(),
        npcActorId: decision.npcId,
        poolId: null, // No longer using pools
        marketType: position.marketType,
        ticker: position.ticker,
        marketId: position.marketId,
        action: 'close',
        side: position.side,
        amount: position.size,
        price: currentPrice,
        sentiment: 0,
        reason: decision.reasoning,
      });
    });

    return {
      npcId: decision.npcId,
      npcName: decision.npcName,
      poolId: actorId, // Using actorId for backward compatibility
      marketType: position.marketType as 'perp' | 'prediction',
      ticker: position.ticker || undefined,
      marketId: position.marketId ?? undefined,
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
    const inputs: TradeImpactInput[] = executedTrades.map(
      (trade: ExecutedTrade) => ({
        marketType: trade.marketType,
        ticker: trade.ticker,
        marketId: trade.marketId,
        side: trade.side,
        size: trade.size,
      })
    );

    return aggregateTradeImpacts(inputs);
  }
}

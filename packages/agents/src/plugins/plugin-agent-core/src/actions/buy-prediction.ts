/**
 * Buy Prediction Action
 * Buy shares in a prediction market via direct DB operations
 * (Same pattern as AutonomousTradingService)
 */

import { and, asUser, db, eq, gte, markets, positions, sql } from '@babylon/db';
import { PredictionPricing, WalletService } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { AgentPnLService } from '../../../../services/AgentPnLService';
import { logger } from '../../../../shared/logger';
import { generateSnowflakeId } from '../../../../shared/snowflake';

const agentPnLService = new AgentPnLService();

const TRADING_FEE_RATE = 0.001; // 0.1% fee

export const buyPredictionAction: Action = {
  name: 'BUY_PREDICTION',
  description:
    'Buy YES or NO shares in a prediction market. IMPORTANT: Always call CHECK_PREDICTIONS first to get the market ID and verify current prices. Also call CHECK_BALANCE to verify you have sufficient funds before buying. Requires marketId, side (YES/NO), and amount in dollars.',
  parameters: {
    marketId: {
      type: 'string',
      description: 'The ID of the prediction market',
      required: true,
    },
    side: {
      type: 'string',
      enum: ['YES', 'NO'],
      description: 'Which side to buy: "YES" or "NO"',
      required: true,
    },
    amount: {
      type: 'number',
      description: 'Dollar amount to spend on shares',
      required: true,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Buy $50 YES on the Tesla prediction' },
      },
      {
        name: 'assistant',
        content: { text: 'Buying YES shares on that market...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Put $100 on NO for the Apple question' },
      },
      {
        name: 'assistant',
        content: { text: "I'll buy NO shares for you." },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentUserId = runtime.agentId;

    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | { marketId?: string; side?: 'YES' | 'NO'; amount?: number }
      | undefined;

    const marketId = actionParams?.marketId;
    const side = actionParams?.side?.toUpperCase() as 'YES' | 'NO' | undefined;
    const amount = actionParams?.amount;

    if (!marketId || !side || !amount) {
      return {
        success: false,
        text: 'Missing parameters. Call CHECK_PREDICTIONS first to get marketId.',
        error: 'Missing parameters: marketId, side, or amount',
      };
    }

    if (side !== 'YES' && side !== 'NO') {
      return {
        success: false,
        text: 'Invalid side. Must be YES or NO.',
        error: 'Invalid side',
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        text: 'Amount must be greater than 0.',
        error: 'Invalid amount',
      };
    }

    try {
      // Get market
      const [market] = await db
        .select()
        .from(markets)
        .where(
          and(
            eq(markets.id, marketId),
            eq(markets.resolved, false),
            gte(markets.endDate, new Date())
          )
        )
        .limit(1);

      if (!market) {
        return {
          success: false,
          text: `Market not found or resolved. Call CHECK_PREDICTIONS first to get valid marketId.`,
          error: 'Market not found',
        };
      }

      // Check balance
      const balance = await WalletService.getBalance(agentUserId);
      if (balance.balance < amount) {
        return {
          success: false,
          text: `Insufficient balance ($${balance.balance.toFixed(2)}). Call CHECK_BALANCE first.`,
          error: 'Insufficient balance',
          values: { balance: balance.balance },
        };
      }

      // Calculate shares and pricing
      const isBuyYes = side === 'YES';
      const calculation = PredictionPricing.calculateBuyWithFees(
        Number(market.yesShares),
        Number(market.noShares),
        isBuyYes ? 'yes' : 'no',
        amount,
        TRADING_FEE_RATE
      );

      // Execute trade in transaction
      const result = await asUser({ userId: agentUserId }, async (txDb) => {
        // Debit balance
        await WalletService.debit(
          agentUserId,
          amount,
          'pred_buy',
          `Bought ${calculation.sharesBought.toFixed(2)} ${side} shares: ${market.question.substring(0, 50)}...`,
          market.id
        );

        // Update market shares
        await txDb
          .update(markets)
          .set({
            yesShares: isBuyYes
              ? sql`${markets.yesShares} + ${calculation.sharesBought}`
              : String(calculation.newYesShares),
            noShares: isBuyYes
              ? String(calculation.newNoShares)
              : sql`${markets.noShares} + ${calculation.sharesBought}`,
            updatedAt: new Date(),
          })
          .where(eq(markets.id, market.id));

        // Check for existing position
        const [existingPosition] = await txDb
          .select()
          .from(positions)
          .where(
            and(
              eq(positions.userId, agentUserId),
              eq(positions.marketId, market.id),
              eq(positions.side, isBuyYes)
            )
          )
          .limit(1);

        let position;
        if (existingPosition) {
          // Update existing position
          const [updated] = await txDb
            .update(positions)
            .set({
              shares: sql`${positions.shares} + ${calculation.sharesBought}`,
              amount: sql`${positions.amount} + ${amount}`,
              updatedAt: new Date(),
            })
            .where(eq(positions.id, existingPosition.id))
            .returning();
          position = updated;
        } else {
          // Create new position
          const [inserted] = await txDb
            .insert(positions)
            .values({
              id: await generateSnowflakeId(),
              userId: agentUserId,
              marketId: market.id,
              side: isBuyYes,
              shares: String(calculation.sharesBought),
              avgPrice: String(calculation.avgPrice),
              amount: String(amount),
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          position = inserted;
        }

        return { position, calculation };
      });

      // Record trade for UI/performance tracking
      await agentPnLService.recordTrade({
        agentId: agentUserId,
        userId: agentUserId,
        marketType: 'prediction',
        marketId,
        action: 'open',
        side: side.toLowerCase() as 'yes' | 'no',
        amount,
        price: result.calculation.avgPrice,
        reasoning: (state?.data?.thought as string) || 'Chat-initiated trade',
      });

      logger.info('[BUY_PREDICTION] Trade successful', {
        agentUserId,
        marketId,
        side,
        shares: result.calculation.sharesBought,
        avgPrice: result.calculation.avgPrice,
        cost: amount,
      });

      return {
        success: true,
        text: `Bought ${result.calculation.sharesBought.toFixed(2)} ${side} shares at $${result.calculation.avgPrice.toFixed(4)}.`,
        data: {
          marketId,
          marketQuestion: market.question,
          side,
          shares: result.calculation.sharesBought,
          avgPrice: result.calculation.avgPrice,
          cost: amount,
        },
        values: {
          marketId,
          side,
          shares: result.calculation.sharesBought,
          avgPrice: result.calculation.avgPrice,
          cost: amount,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[BUY_PREDICTION] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to buy shares: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
};

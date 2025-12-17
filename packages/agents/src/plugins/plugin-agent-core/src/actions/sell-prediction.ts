/**
 * Sell Prediction Action
 * Sell shares from a prediction market position via direct DB operations
 * (Same pattern as AutonomousTradingService)
 */

import { and, asUser, db, eq, markets, positions, sql } from '@babylon/db';
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

const TRADING_FEE_RATE = 0.001; // 0.1% fee
const agentPnLService = new AgentPnLService();

export const sellPredictionAction: Action = {
  name: 'SELL_PREDICTION',
  description:
    'Sell shares from an existing prediction market position. IMPORTANT: Always call CHECK_PNL first to see your actual holdings - you need the position ID and must verify how many shares you actually own before selling. Do NOT rely on conversation history for share counts. Requires positionId and number of shares to sell.',
  parameters: {
    positionId: {
      type: 'string',
      description: 'The ID of the position to sell from',
      required: true,
    },
    shares: {
      type: 'number',
      description: 'Number of shares to sell',
      required: true,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Sell 50 shares from my Tesla position' },
      },
      {
        name: 'assistant',
        content: { text: 'Selling those shares for you...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Close out my position on the Apple prediction' },
      },
      {
        name: 'assistant',
        content: { text: "I'll sell your shares from that position." },
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
      | { positionId?: string; shares?: number }
      | undefined;

    const positionId = actionParams?.positionId;
    const sharesToSell = actionParams?.shares;

    if (!positionId || !sharesToSell) {
      return {
        success: false,
        text: 'Missing required parameters. Need positionId and shares.',
        data: { error: 'Missing parameters' },
        values: { error: 'Missing parameters' },
      };
    }

    if (sharesToSell <= 0) {
      return {
        success: false,
        text: 'Shares must be greater than 0.',
        data: { error: 'Invalid shares' },
        values: { error: 'Invalid shares' },
      };
    }

    try {
      // Get position
      const [position] = await db
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.id, positionId),
            eq(positions.userId, agentUserId),
            eq(positions.status, 'active')
          )
        )
        .limit(1);

      if (!position) {
        return {
          success: false,
          text: 'Position not found or not owned by you.',
          data: { error: 'Position not found' },
          values: { error: 'Position not found' },
        };
      }

      const currentShares = Number(position.shares);
      if (sharesToSell > currentShares) {
        return {
          success: false,
          text: `Cannot sell ${sharesToSell} shares. You only have ${currentShares} shares.`,
          data: { error: 'Insufficient shares', currentShares },
          values: { error: 'Insufficient shares', currentShares },
        };
      }

      // Get market
      const [market] = await db
        .select()
        .from(markets)
        .where(eq(markets.id, position.marketId))
        .limit(1);

      if (!market) {
        return {
          success: false,
          text: 'Market not found.',
          data: { error: 'Market not found' },
          values: { error: 'Market not found' },
        };
      }

      // Calculate sell proceeds
      const isSellYes = position.side;
      const calculation = PredictionPricing.calculateSellWithFees(
        Number(market.yesShares),
        Number(market.noShares),
        isSellYes ? 'yes' : 'no',
        sharesToSell,
        TRADING_FEE_RATE
      );

      // Execute sell in transaction
      const result = await asUser({ userId: agentUserId }, async (txDb) => {
        // Credit proceeds to balance
        await WalletService.credit(
          agentUserId,
          calculation.netProceeds ?? calculation.netAmount,
          'pred_sell',
          `Sold ${sharesToSell} ${isSellYes ? 'YES' : 'NO'} shares: ${market.question.substring(0, 50)}...`,
          market.id
        );

        // Update market shares
        await txDb
          .update(markets)
          .set({
            yesShares: isSellYes
              ? sql`${markets.yesShares} - ${sharesToSell}`
              : String(calculation.newYesShares),
            noShares: isSellYes
              ? String(calculation.newNoShares)
              : sql`${markets.noShares} - ${sharesToSell}`,
            updatedAt: new Date(),
          })
          .where(eq(markets.id, market.id));

        // Update or close position
        const remainingShares = currentShares - sharesToSell;
        if (remainingShares <= 0) {
          // Close position
          await txDb
            .update(positions)
            .set({
              shares: '0',
              status: 'closed',
              updatedAt: new Date(),
            })
            .where(eq(positions.id, position.id));
        } else {
          // Update position
          await txDb
            .update(positions)
            .set({
              shares: String(remainingShares),
              updatedAt: new Date(),
            })
            .where(eq(positions.id, position.id));
        }

        return { remainingShares, calculation };
      });

      const proceeds =
        result.calculation.netProceeds ?? result.calculation.netAmount;

      // Record trade for UI/performance tracking
      await agentPnLService.recordTrade({
        agentId: agentUserId,
        userId: agentUserId,
        marketType: 'prediction',
        marketId: position.marketId,
        action: 'close',
        side: isSellYes ? 'yes' : 'no',
        amount: proceeds,
        price: result.calculation.avgPrice ?? proceeds / sharesToSell,
        reasoning: (state?.data?.thought as string) || 'Chat-initiated sell',
      });

      const responseText = `Sold ${sharesToSell} ${isSellYes ? 'YES' : 'NO'} shares. Proceeds: $${proceeds.toFixed(2)}. Remaining: ${result.remainingShares} shares.`;

      logger.info('[SELL_PREDICTION] Trade successful', {
        agentUserId,
        positionId,
        sharesSold: sharesToSell,
        proceeds,
        remainingShares: result.remainingShares,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId,
          marketId: position.marketId,
          side: isSellYes ? 'YES' : 'NO',
          sharesSold: sharesToSell,
          proceeds,
          remainingShares: result.remainingShares,
        },
        values: {
          positionId,
          sharesSold: sharesToSell,
          proceeds,
          remainingShares: result.remainingShares,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SELL_PREDICTION] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to sell shares: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

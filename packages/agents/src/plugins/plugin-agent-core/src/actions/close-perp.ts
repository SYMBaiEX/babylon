/**
 * Close Perp Action
 * Close an open perpetual position via direct DB operations
 * (Same pattern as AutonomousTradingService)
 */

import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { and, db, eq, isNull, perpPositions } from '@babylon/db';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
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

const agentPnLService = new AgentPnLService();

export const closePerpAction: Action = {
  name: 'CLOSE_PERP',
  description:
    'Close an open perpetual position (full or partial). IMPORTANT: Always call CHECK_PNL first to see your actual open positions - you need the position ID and current size to close. Requires positionId. Optionally specify amount to partially close.',
  parameters: {
    positionId: {
      type: 'string',
      description: 'The ID of the perpetual position to close',
      required: true,
    },
    amount: {
      type: 'number',
      description:
        'Dollar amount of position to close. If not specified, closes the entire position.',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Close my NVDA position' },
      },
      {
        name: 'assistant',
        content: { text: 'Closing your NVDA position now...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Exit my Tesla short' },
      },
      {
        name: 'assistant',
        content: { text: "I'll close that position for you." },
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
      | { positionId?: string; amount?: number }
      | undefined;

    const positionId = actionParams?.positionId;
    const closeAmount = actionParams?.amount;

    if (!positionId) {
      return {
        success: false,
        text: 'Missing required parameter: positionId. Please call CHECK_PNL first to see your open perp positions and get the position ID.',
        data: { error: 'Missing positionId' },
        values: { error: 'Missing positionId' },
      };
    }

    try {
      // Get position
      const [position] = await db
        .select()
        .from(perpPositions)
        .where(
          and(
            eq(perpPositions.id, positionId),
            eq(perpPositions.userId, agentUserId),
            isNull(perpPositions.closedAt)
          )
        )
        .limit(1);

      if (!position) {
        return {
          success: false,
          text: `Position not found with ID "${positionId}". Please call CHECK_PNL first to see your actual open positions and get the correct position ID. Do not use ticker names - use the position ID from CHECK_PNL results.`,
          data: { error: 'Position not found', providedId: positionId },
          values: { error: 'Position not found', providedId: positionId },
        };
      }

      // Create perp service with wallet adapter
      const walletAdapter = {
        debit: async ({
          userId,
          amount,
          reason,
          description,
          relatedId,
        }: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) => {
          await WalletService.debit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          );
        },
        credit: async ({
          userId,
          amount,
          reason,
          description,
          relatedId,
        }: {
          userId: string;
          amount: number;
          reason: string;
          description?: string;
          relatedId?: string;
        }) => {
          await WalletService.credit(
            userId,
            amount,
            reason,
            description ?? '',
            relatedId
          );
        },
        recordPnL: async ({
          userId,
          pnl,
          reason,
          relatedId,
        }: {
          userId: string;
          pnl: number;
          reason: string;
          relatedId?: string;
        }) => {
          await WalletService.recordPnL(userId, pnl, reason, relatedId);
        },
        getBalance: WalletService.getBalance,
      };

      const service = new PerpMarketService({
        db: new PerpDbAdapter(),
        wallet: walletAdapter,
        fees: {
          tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
          platformShare: FEE_CONFIG.PLATFORM_SHARE,
          referrerShare: FEE_CONFIG.REFERRER_SHARE,
          minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
        },
      });

      // Get current price for the ticker
      const marketSnapshot = await service.getMarketsSnapshot();
      const market = marketSnapshot.find((m) => m.ticker === position.ticker);
      const exitPrice = market?.currentPrice ?? Number(position.entryPrice);

      const positionSize = Number(position.size);
      const isPartialClose =
        closeAmount !== undefined &&
        closeAmount > 0 &&
        closeAmount < positionSize;

      let pnl: number;
      let closedAmount: number;
      let remainingSize: number;

      if (isPartialClose) {
        // Partial close - calculate proportional P&L and update position
        closedAmount = closeAmount;
        const closeRatio = closedAmount / positionSize;

        // Calculate proportional P&L
        const entryPrice = Number(position.entryPrice);
        const leverage = position.leverage ?? 1;
        const priceDiff = exitPrice - entryPrice;
        const direction = position.side === 'long' ? 1 : -1;
        const totalUnrealizedPnL =
          (priceDiff / entryPrice) * positionSize * leverage * direction;
        pnl = totalUnrealizedPnL * closeRatio;

        // Update position size
        remainingSize = positionSize - closedAmount;
        await db
          .update(perpPositions)
          .set({
            size: remainingSize,
            lastUpdated: new Date(),
          })
          .where(eq(perpPositions.id, positionId));

        // Credit wallet with closed amount + P&L
        await WalletService.credit(
          agentUserId,
          closedAmount + pnl,
          'perp_partial_close',
          `Partial close ${position.ticker}: ${closedAmount} of ${positionSize}`,
          positionId
        );
      } else {
        // Full close
        const result = await service.closePosition({
          positionId,
          userId: agentUserId,
        });
        pnl = result.realizedPnL ?? 0;
        closedAmount = positionSize;
        remainingSize = 0;
      }

      const pnlStr =
        pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

      // Record trade for UI/performance tracking
      await agentPnLService.recordTrade({
        agentId: agentUserId,
        userId: agentUserId,
        marketType: 'perp',
        ticker: position.ticker,
        action: 'close',
        side: position.side as 'long' | 'short',
        amount: closedAmount,
        price: exitPrice,
        pnl,
        reasoning:
          (state?.data?.thought as string) || 'Chat-initiated perp close',
      });

      const responseText = isPartialClose
        ? `Partially closed ${position.side.toUpperCase()} position on ${position.ticker}: $${closedAmount.toFixed(2)} at $${exitPrice.toFixed(2)}. P&L: ${pnlStr}. Remaining: $${remainingSize.toFixed(2)}`
        : `Closed ${position.side.toUpperCase()} position on ${position.ticker} at $${exitPrice.toFixed(2)}. P&L: ${pnlStr}`;

      logger.info('[CLOSE_PERP] Position closed', {
        agentUserId,
        positionId,
        ticker: position.ticker,
        side: position.side,
        exitPrice,
        closedAmount,
        remainingSize,
        pnl,
        isPartialClose,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId,
          ticker: position.ticker,
          side: position.side,
          exitPrice,
          closedAmount,
          remainingSize,
          pnl,
          isPartialClose,
        },
        values: {
          positionId,
          ticker: position.ticker,
          side: position.side,
          exitPrice,
          closedAmount,
          remainingSize,
          pnl,
          isPartialClose,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CLOSE_PERP] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to close position: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

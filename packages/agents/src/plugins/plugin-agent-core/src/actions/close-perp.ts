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
    'Close an open perpetual position. IMPORTANT: Always call CHECK_PNL first to see your actual open positions - you need the position ID to close. Do NOT rely on conversation history for position data. Requires positionId.',
  parameters: {
    positionId: {
      type: 'string',
      description: 'The ID of the perpetual position to close',
      required: true,
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
      | { positionId?: string }
      | undefined;

    const positionId = actionParams?.positionId;

    if (!positionId) {
      return {
        success: false,
        text: 'Missing required parameter: positionId.',
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
          text: 'Position not found, not owned by you, or already closed.',
          data: { error: 'Position not found' },
          values: { error: 'Position not found' },
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

      // Close position
      const result = await service.closePosition({
        positionId,
        userId: agentUserId,
      });

      const pnl = result.realizedPnL ?? 0;
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
        amount: Number(position.size),
        price: exitPrice,
        pnl,
        reasoning:
          (state?.data?.thought as string) || 'Chat-initiated perp close',
      });

      const responseText = `Closed ${position.side.toUpperCase()} position on ${position.ticker} at $${exitPrice.toFixed(2)}. P&L: ${pnlStr}`;

      logger.info('[CLOSE_PERP] Position closed', {
        agentUserId,
        positionId,
        ticker: position.ticker,
        side: position.side,
        exitPrice,
        pnl,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId,
          ticker: position.ticker,
          side: position.side,
          exitPrice,
          pnl,
        },
        values: {
          positionId,
          ticker: position.ticker,
          side: position.side,
          exitPrice,
          pnl,
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

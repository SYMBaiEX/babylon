/**
 * Check P&L Action
 *
 * Returns the agent's profit/loss, balance, and trading activity.
 */

import {
  agentTrades,
  and,
  db,
  desc,
  eq,
  isNull,
  perpPositions,
  positions,
  users,
} from '@babylon/db';
import { WalletService } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

/**
 * Format currency values
 */
function formatCurrency(value: number): string {
  return value >= 0
    ? `+$${value.toFixed(2)}`
    : `-$${Math.abs(value).toFixed(2)}`;
}

/**
 * CHECK_PNL Action
 *
 * Returns the agent's P&L, positions, and recent trades.
 */
export const checkPnlAction: Action = {
  name: 'CHECK_PNL',
  description:
    "Check the agent's profit/loss, current positions, and recent trading activity",

  parameters: {},

  examples: [
    [
      {
        name: 'User',
        content: { text: "What's your P&L?" },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me check my trading performance...',
          actions: ['CHECK_PNL'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'How are you doing on trades?' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking my trading stats...',
          actions: ['CHECK_PNL'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Show me your positions' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me pull up my current positions...',
          actions: ['CHECK_PNL'],
        },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentId = runtime.agentId;

    try {
      // Get agent info
      const [agent] = await db
        .select({
          displayName: users.displayName,
          lifetimePnL: users.lifetimePnL,
        })
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1);

      // Get wallet balance
      let balance = 0;
      let lifetimePnL = 0;
      try {
        const walletBalance = await WalletService.getBalance(agentId);
        balance = walletBalance.balance;
        lifetimePnL = walletBalance.lifetimePnL;
      } catch {
        // Use agent's stored lifetimePnL if wallet service fails
        lifetimePnL = Number(agent?.lifetimePnL ?? 0);
      }

      // Get active prediction market positions
      const activePositions = await db
        .select()
        .from(positions)
        .where(
          and(eq(positions.userId, agentId), eq(positions.status, 'active'))
        );

      // Get active perp positions
      const activePerpPositions = await db
        .select()
        .from(perpPositions)
        .where(
          and(eq(perpPositions.userId, agentId), isNull(perpPositions.closedAt))
        );

      // Get recent trades
      const recentTrades = await db
        .select({
          action: agentTrades.action,
          ticker: agentTrades.ticker,
          amount: agentTrades.amount,
          pnl: agentTrades.pnl,
          executedAt: agentTrades.executedAt,
        })
        .from(agentTrades)
        .where(eq(agentTrades.agentUserId, agentId))
        .orderBy(desc(agentTrades.executedAt))
        .limit(5);

      // Build response
      const sections: string[] = [];

      // P&L Summary
      sections.push(`💰 **Balance**: $${balance.toFixed(2)}`);
      sections.push(`📊 **Lifetime P&L**: ${formatCurrency(lifetimePnL)}`);

      // Active Positions
      if (activePositions.length > 0 || activePerpPositions.length > 0) {
        sections.push('\n**Active Positions:**');

        for (const pos of activePositions) {
          const posType = pos.outcome ? 'YES' : 'NO';
          sections.push(
            `- ${pos.marketId}: ${posType} (${pos.shares} shares @ $${Number(pos.avgPrice).toFixed(2)})`
          );
        }

        for (const pos of activePerpPositions) {
          const direction = pos.side === 'long' ? 'LONG' : 'SHORT';
          sections.push(
            `- ${pos.ticker}: ${direction} ${pos.size} @ $${Number(pos.entryPrice).toFixed(2)}`
          );
        }
      } else {
        sections.push('\n**Active Positions:** None');
      }

      // Recent Trades
      if (recentTrades.length > 0) {
        sections.push('\n**Recent Trades:**');
        for (const trade of recentTrades) {
          const pnlStr = trade.pnl
            ? ` (${formatCurrency(Number(trade.pnl))})`
            : '';
          sections.push(
            `- ${trade.action} ${trade.ticker}: $${Number(trade.amount).toFixed(2)}${pnlStr}`
          );
        }
      } else {
        sections.push('\n**Recent Trades:** None');
      }

      const responseText = sections.join('\n');

      logger.info(`[CHECK_PNL] Retrieved P&L for agent`, undefined, 'CheckPnL');

      return {
        success: true,
        text: responseText,
        data: {
          balance,
          lifetimePnL,
          activePositions: activePositions.length,
          activePerpPositions: activePerpPositions.length,
          recentTradesCount: recentTrades.length,
        },
        values: {
          balance,
          lifetimePnL,
          activePositionCount:
            activePositions.length + activePerpPositions.length,
          recentTradesCount: recentTrades.length,
          isProfitable: lifetimePnL > 0,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_PNL] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to retrieve P&L: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

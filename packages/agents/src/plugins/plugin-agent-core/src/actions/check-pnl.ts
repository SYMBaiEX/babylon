/**
 * CHECK_PNL Action
 *
 * Returns the agent's balance, P&L, open positions (with IDs), and recent trades.
 */

import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import {
  agentTrades,
  and,
  db,
  desc,
  eq,
  isNull,
  markets,
  perpPositions,
  positions,
  users,
} from '@babylon/db';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
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

export const checkPnlAction: Action = {
  name: 'CHECK_PNL',
  description:
    "Check balance, P&L, open positions (with IDs for trading), and recent trades. Use position IDs with SELL_PREDICTION or CLOSE_PERP.",

  parameters: {},

  examples: [
    [
      {
        name: 'user',
        content: { text: "What's your P&L?" },
      },
      {
        name: 'assistant',
        content: { text: 'Let me check my trading performance...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Show me your positions' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me pull up my current positions...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'How are you doing on trades?' },
      },
      {
        name: 'assistant',
        content: { text: 'Checking my trading stats...' },
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
        lifetimePnL = Number(agent?.lifetimePnL ?? 0);
      }

      // Get active prediction positions with market details
      const predictionPositions = await db
        .select({
          id: positions.id,
          marketId: positions.marketId,
          side: positions.side,
          shares: positions.shares,
          avgPrice: positions.avgPrice,
          amount: positions.amount,
          question: markets.question,
          yesShares: markets.yesShares,
          noShares: markets.noShares,
        })
        .from(positions)
        .leftJoin(markets, eq(positions.marketId, markets.id))
        .where(
          and(eq(positions.userId, agentId), eq(positions.status, 'active'))
        );

      // Get active perp positions
      const perpPositionsList = await db
        .select()
        .from(perpPositions)
        .where(
          and(eq(perpPositions.userId, agentId), isNull(perpPositions.closedAt))
        );

      // Get current perp prices for P&L calculation
      const walletAdapter = {
        debit: async () => {},
        credit: async () => {},
        recordPnL: async () => {},
        getBalance: WalletService.getBalance,
      };

      const perpService = new PerpMarketService({
        db: new PerpDbAdapter(),
        wallet: walletAdapter,
        fees: {
          tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
          platformShare: FEE_CONFIG.PLATFORM_SHARE,
          referrerShare: FEE_CONFIG.REFERRER_SHARE,
          minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
        },
      });

      const perpMarkets = await perpService.getMarketsSnapshot();
      const priceMap = new Map(
        perpMarkets.map((m) => [m.ticker, m.currentPrice])
      );

      // Get recent trades
      const recentTrades = await db
        .select({
          action: agentTrades.action,
          ticker: agentTrades.ticker,
          marketId: agentTrades.marketId,
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

      // Summary
      sections.push(`💰 **Balance**: $${balance.toFixed(2)}`);
      sections.push(`📊 **Lifetime P&L**: ${formatCurrency(lifetimePnL)}`);

      // Prediction Positions
      if (predictionPositions.length > 0) {
        sections.push('\n**📊 Prediction Positions:**');
        for (const pos of predictionPositions) {
          const side = pos.side ? 'YES' : 'NO';
          const shares = Number(pos.shares);
          const avgPrice = Number(pos.avgPrice);
          const cost = Number(pos.amount);

          // Calculate current probability and value
          const yesShares = Number(pos.yesShares ?? 0);
          const noShares = Number(pos.noShares ?? 0);
          const totalShares = yesShares + noShares;
          const currentProb =
            totalShares > 0
              ? pos.side
                ? yesShares / totalShares
                : noShares / totalShares
              : 0.5;
          const currentValue = shares * currentProb;
          const unrealizedPnL = currentValue - cost;
          const pnlStr = formatCurrency(unrealizedPnL);

          const question =
            pos.question && pos.question.length > 40
              ? pos.question.substring(0, 37) + '...'
              : pos.question ?? 'Unknown';

          sections.push(
            `• **${side}** "${question}"\n` +
              `  ${shares.toFixed(1)} shares @ $${avgPrice.toFixed(3)} | Value: $${currentValue.toFixed(2)} | P&L: ${pnlStr}\n` +
              `  ID: \`${pos.id}\``
          );
        }
      }

      // Perp Positions
      if (perpPositionsList.length > 0) {
        sections.push('\n**📈 Perp Positions:**');
        for (const pos of perpPositionsList) {
          const side = pos.side.toUpperCase();
          const size = Number(pos.size);
          const entryPrice = Number(pos.entryPrice);
          const leverage = pos.leverage ?? 1;
          const currentPrice = priceMap.get(pos.ticker) ?? entryPrice;

          // Calculate P&L
          const priceDiff = currentPrice - entryPrice;
          const direction = pos.side === 'long' ? 1 : -1;
          const unrealizedPnL =
            (priceDiff / entryPrice) * size * leverage * direction;
          const pnlStr = formatCurrency(unrealizedPnL);
          const pnlPercent = ((unrealizedPnL / size) * 100).toFixed(1);

          sections.push(
            `• **${pos.ticker}** ${side} ${leverage}x\n` +
              `  $${size.toFixed(2)} @ $${entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} | P&L: ${pnlStr} (${pnlPercent}%)\n` +
              `  ID: \`${pos.id}\``
          );
        }
      }

      // No positions
      if (predictionPositions.length === 0 && perpPositionsList.length === 0) {
        sections.push('\n**Open Positions:** None');
      }

      // Recent Trades
      if (recentTrades.length > 0) {
        sections.push('\n**Recent Trades:**');
        for (const trade of recentTrades) {
          const pnlStr = trade.pnl ? ` ${formatCurrency(Number(trade.pnl))}` : '';
          const identifier = trade.ticker || trade.marketId || 'unknown';
          sections.push(
            `• ${trade.action} ${identifier}: $${Number(trade.amount).toFixed(2)}${pnlStr}`
          );
        }
      }

      const responseText = sections.join('\n');
      const totalPositions =
        predictionPositions.length + perpPositionsList.length;

      logger.info(
        `[CHECK_PNL] Retrieved P&L for agent`,
        { positions: totalPositions, trades: recentTrades.length },
        'CheckPnL'
      );

      return {
        success: true,
        text: responseText,
        data: {
          balance,
          lifetimePnL,
          predictionPositions: predictionPositions.map((p) => ({
            id: p.id,
            marketId: p.marketId,
            side: p.side ? 'YES' : 'NO',
            shares: Number(p.shares),
            avgPrice: Number(p.avgPrice),
          })),
          perpPositions: perpPositionsList.map((p) => ({
            id: p.id,
            ticker: p.ticker,
            side: p.side,
            size: Number(p.size),
            entryPrice: Number(p.entryPrice),
            leverage: p.leverage,
          })),
          recentTrades: recentTrades.length,
        },
        values: {
          balance,
          lifetimePnL,
          predictionCount: predictionPositions.length,
          perpCount: perpPositionsList.length,
          totalPositions,
          hasPositions: totalPositions > 0,
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

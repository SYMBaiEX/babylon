/**
 * Check Markets Action
 *
 * Returns overview of available markets (predictions + perps).
 * This is a simplified action for the coordinator that doesn't require
 * agent-specific context.
 */

import { db, eq, markets, perpMarketSnapshots } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

interface CheckMarketsParams {
  type?: 'predictions' | 'perps' | 'all';
  limit?: number;
}

/**
 * CHECK_MARKETS Action
 *
 * Get an overview of available markets for trading.
 * Returns prediction markets and/or perpetual contracts.
 */
export const checkMarketsAction: Action = {
  name: 'CHECK_MARKETS',
  description:
    'Get an overview of available markets including prediction markets and perpetual contracts. Use this to help users understand what trading options are available.',

  parameters: {
    type: {
      type: 'string',
      description:
        'Type of markets to check: "predictions", "perps", or "all" (default: "all")',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of markets to return per type (default: 5)',
      required: false,
    },
  },

  examples: [
    [
      {
        name: 'User',
        content: { text: 'What markets are available?' },
      },
      {
        name: 'Coordinator',
        content: {
          text: "I'll check the available markets for you.",
          action: 'CHECK_MARKETS',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Show me prediction markets' },
      },
      {
        name: 'Coordinator',
        content: {
          text: 'Checking prediction markets...',
          action: 'CHECK_MARKETS',
        },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    // Always valid - this is a read-only informational action
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | CheckMarketsParams
      | undefined;

    const marketType = actionParams?.type || 'all';
    const limit = actionParams?.limit || 5;

    try {
      const results: string[] = [];
      let predictionCount = 0;
      let perpCount = 0;

      // Fetch prediction markets
      if (marketType === 'all' || marketType === 'predictions') {
        const activeMarkets = await db
          .select({
            id: markets.id,
            question: markets.question,
            yesShares: markets.yesShares,
            noShares: markets.noShares,
            liquidity: markets.liquidity,
            endDate: markets.endDate,
          })
          .from(markets)
          .where(eq(markets.resolved, false))
          .limit(limit);

        predictionCount = activeMarkets.length;

        if (activeMarkets.length > 0) {
          const predictionLines = activeMarkets.map((p) => {
            const yesPrice =
              p.yesShares && p.noShares
                ? (
                    (Number(p.noShares) /
                      (Number(p.yesShares) + Number(p.noShares))) *
                    100
                  ).toFixed(1)
                : '50.0';
            return `  - "${p.question}" (ID: ${p.id}) | YES: ${yesPrice}% | Liquidity: $${Number(p.liquidity || 0).toFixed(2)}`;
          });
          results.push(`**Prediction Markets (${predictionCount} active):**`);
          results.push(...predictionLines);
        } else {
          results.push('**Prediction Markets:** No active markets found.');
        }
      }

      // Fetch perpetual contracts
      if (marketType === 'all' || marketType === 'perps') {
        const perps = await db
          .select({
            ticker: perpMarketSnapshots.ticker,
            name: perpMarketSnapshots.name,
            currentPrice: perpMarketSnapshots.currentPrice,
            changePercent24h: perpMarketSnapshots.changePercent24h,
          })
          .from(perpMarketSnapshots)
          .limit(limit);

        perpCount = perps.length;

        if (perps.length > 0) {
          const perpLines = perps.map((p) => {
            const changeStr =
              p.changePercent24h !== null
                ? `${Number(p.changePercent24h) >= 0 ? '+' : ''}${Number(p.changePercent24h).toFixed(2)}%`
                : 'N/A';
            return `  - ${p.name || p.ticker} (${p.ticker}) | Price: $${Number(p.currentPrice || 0).toFixed(2)} | 24h: ${changeStr}`;
          });
          results.push('');
          results.push(`**Perpetual Contracts (${perpCount} available):**`);
          results.push(...perpLines);
        } else {
          results.push('');
          results.push('**Perpetual Contracts:** No contracts found.');
        }
      }

      const responseText = results.join('\n');

      logger.info(
        `[CHECK_MARKETS] Retrieved ${predictionCount} predictions, ${perpCount} perps`,
        undefined,
        'CheckMarkets'
      );

      return {
        success: true,
        text: responseText,
        data: {
          predictionCount,
          perpCount,
          marketType,
        },
        values: {
          predictionCount,
          perpCount,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `[CHECK_MARKETS] Error: ${errorMsg}`,
        undefined,
        'CheckMarkets'
      );

      return {
        success: false,
        text: `Failed to fetch markets: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
};

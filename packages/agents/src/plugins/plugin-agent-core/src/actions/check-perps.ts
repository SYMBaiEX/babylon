/**
 * CHECK_PERPS Action
 *
 * Returns perpetual/stock market data:
 * - Ticker, name, current price
 * - 24h change (absolute and %)
 * - Volume, open interest
 * - Funding rate
 */

import { getDbInstance } from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

type SortOption = 'price' | 'change' | 'volume' | 'name';

export const checkPerpsAction: Action = {
  name: 'CHECK_PERPS',
  description:
    'Check perpetual/stock market data - prices, 24h changes, volume, funding rates',
  parameters: {
    limit: {
      type: 'number',
      description: 'Number of markets to show (default: 10, max: 20)',
      required: false,
    },
    sortBy: {
      type: 'string',
      description:
        'Sort by: "price", "change", "volume", "name" (default: "volume")',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: "What's happening in the perp markets?" },
      },
      {
        name: 'assistant',
        content: { text: "I'll check the perpetual markets for you." },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Show me stock prices' },
      },
      {
        name: 'assistant',
        content: { text: "I'll fetch the latest perp market data." },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Which stocks are moving the most?' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me check the top movers.' },
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
    _runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const actionParams = state?.data?.actionParams as
      | { limit?: number; sortBy?: string }
      | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 10, 1), 20);
    const sortBy = (actionParams?.sortBy as SortOption) ?? 'volume';

    try {
      // Get perpetual markets from static registry with dynamic prices
      const orgStates = await getDbInstance().getOrganizationsByPrice();
      const allOrgs = StaticDataRegistry.getAllOrganizations();

      const perpMarkets = orgStates
        .map((state) => {
          const staticOrg = allOrgs.find((o) => o.id === state.id);
          if (!staticOrg || staticOrg.type !== 'company') return null;

          const currentPrice =
            state.currentPrice ?? staticOrg.initialPrice ?? 0;
          const initialPrice = staticOrg.initialPrice ?? 0;
          const change24h = currentPrice - initialPrice;
          const changePercent =
            initialPrice > 0 ? (change24h / initialPrice) * 100 : 0;

          return {
            ticker: staticOrg.ticker ?? staticOrg.id,
            name: staticOrg.name,
            currentPrice,
            initialPrice,
            change24h,
            changePercent,
            // These would come from actual market data in production
            volume24h: Math.abs(change24h) * 1000, // Simulated
            openInterest: currentPrice * 100, // Simulated
            fundingRate: changePercent > 0 ? 0.01 : -0.01, // Simulated
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      // Sort markets
      const sortedMarkets = [...perpMarkets].sort((a, b) => {
        switch (sortBy) {
          case 'price':
            return b.currentPrice - a.currentPrice;
          case 'change':
            return Math.abs(b.changePercent) - Math.abs(a.changePercent);
          case 'volume':
            return b.volume24h - a.volume24h;
          case 'name':
            return a.name.localeCompare(b.name);
          default:
            return b.volume24h - a.volume24h;
        }
      });

      const displayedMarkets = sortedMarkets.slice(0, limit);

      if (displayedMarkets.length === 0) {
        return {
          success: true,
          text: 'No perpetual markets available at the moment.',
          data: { markets: [], count: 0 },
          values: { markets: [], count: 0, hasMarkets: false },
        };
      }

      // Format response
      const marketsList = displayedMarkets
        .map((m, i) => {
          const changeStr =
            m.changePercent >= 0
              ? `+${m.changePercent.toFixed(2)}%`
              : `${m.changePercent.toFixed(2)}%`;
          const changeIcon = m.changePercent >= 0 ? '📈' : '📉';
          return `${i + 1}. **${m.ticker}** (${m.name})\n   $${m.currentPrice.toFixed(2)} ${changeIcon} ${changeStr}`;
        })
        .join('\n');

      const topGainer = displayedMarkets.reduce((max, m) =>
        m.changePercent > max.changePercent ? m : max
      );
      const topLoser = displayedMarkets.reduce((min, m) =>
        m.changePercent < min.changePercent ? m : min
      );

      const summary = `Top Gainer: ${topGainer.ticker} (+${topGainer.changePercent.toFixed(2)}%) | Top Loser: ${topLoser.ticker} (${topLoser.changePercent.toFixed(2)}%)`;

      const responseText = `**Perpetual Markets (${displayedMarkets.length}):**\n${marketsList}\n\n${summary}`;

      logger.info(
        `[CHECK_PERPS] Retrieved ${displayedMarkets.length} markets`,
        undefined,
        'CheckPerps'
      );

      return {
        success: true,
        text: responseText,
        data: {
          markets: displayedMarkets,
          count: displayedMarkets.length,
          topGainer: topGainer.ticker,
          topLoser: topLoser.ticker,
        },
        values: {
          markets: displayedMarkets,
          count: displayedMarkets.length,
          hasMarkets: true,
          marketsList,
          summary,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_PERPS] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to retrieve perp markets: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

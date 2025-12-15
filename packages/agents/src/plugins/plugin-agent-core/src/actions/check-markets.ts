/**
 * CHECK_MARKETS Action
 *
 * Returns current market data including:
 * - Active prediction markets with YES/NO prices
 * - Perpetual/stock markets with current prices
 */

import { db, desc, eq, getDbInstance, markets } from '@babylon/db';
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

export const checkMarketsAction: Action = {
  name: 'CHECK_MARKETS',
  description:
    'Check current market data - prediction markets and stock/perp prices',
  parameters: {
    limit: {
      type: 'number',
      description: 'Number of markets to show per type (default: 5, max: 10)',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: "What's happening in the markets?" },
      },
      {
        name: 'assistant',
        content: { text: 'Let me check the current markets for you.' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Show me market prices' },
      },
      {
        name: 'assistant',
        content: { text: "I'll fetch the latest market data." },
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
      | { limit?: number }
      | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 5, 1), 10);

    try {
      // Get active prediction markets
      const predictionMarkets = await db
        .select()
        .from(markets)
        .where(eq(markets.resolved, false))
        .orderBy(desc(markets.yesShares))
        .limit(limit);

      // Get perpetual/stock markets from static registry with dynamic prices
      const orgStates = await getDbInstance().getOrganizationsByPrice();
      const perpMarkets = orgStates
        .slice(0, limit)
        .map((state) => {
          const staticOrg = StaticDataRegistry.getOrganization(state.id);
          return staticOrg
            ? {
                id: staticOrg.id,
                name: staticOrg.name,
                ticker: staticOrg.ticker,
                currentPrice: state.currentPrice ?? staticOrg.initialPrice,
                initialPrice: staticOrg.initialPrice,
              }
            : null;
        })
        .filter(
          (o): o is NonNullable<typeof o> => o !== null && o.ticker !== undefined
        );

      // Format prediction markets
      const formattedPredictions = predictionMarkets.map((market) => {
        const yesShares = Number(market.yesShares || 0);
        const noShares = Number(market.noShares || 0);
        const totalShares = yesShares + noShares;
        const yesPrice =
          totalShares > 0 ? Math.round((yesShares / totalShares) * 100) : 50;

        return {
          id: market.id,
          question: market.question,
          yesPrice,
          noPrice: 100 - yesPrice,
        };
      });

      // Format perp markets
      const formattedPerps = perpMarkets.map((market) => {
        const currentPrice = market.currentPrice ?? market.initialPrice ?? 0;
        const initialPrice = market.initialPrice ?? 0;
        const change =
          initialPrice > 0
            ? (((currentPrice - initialPrice) / initialPrice) * 100).toFixed(1)
            : '0.0';
        return {
          name: market.name,
          ticker: market.ticker,
          price: currentPrice.toFixed(2),
          change: `${Number(change) >= 0 ? '+' : ''}${change}%`,
        };
      });

      // Build response text
      const sections: string[] = [];

      if (formattedPredictions.length > 0) {
        sections.push('**Prediction Markets:**');
        for (const p of formattedPredictions) {
          sections.push(`• ${p.question}`);
          sections.push(`  YES: ${p.yesPrice}% | NO: ${p.noPrice}%`);
        }
      } else {
        sections.push('**Prediction Markets:** No active markets');
      }

      sections.push('');

      if (formattedPerps.length > 0) {
        sections.push('**Stocks/Perps:**');
        for (const s of formattedPerps) {
          sections.push(`• ${s.name} (${s.ticker}): $${s.price} (${s.change})`);
        }
      } else {
        sections.push('**Stocks/Perps:** No active markets');
      }

      const responseText = sections.join('\n');

      logger.info(
        `[CHECK_MARKETS] Retrieved ${formattedPredictions.length} predictions, ${formattedPerps.length} perps`,
        undefined,
        'CheckMarkets'
      );

      return {
        success: true,
        text: responseText,
        data: {
          predictions: formattedPredictions,
          perps: formattedPerps,
          predictionCount: formattedPredictions.length,
          perpCount: formattedPerps.length,
        },
        values: {
          predictions: formattedPredictions,
          perps: formattedPerps,
          predictionCount: formattedPredictions.length,
          perpCount: formattedPerps.length,
          marketSummary: responseText,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_MARKETS] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to retrieve markets: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


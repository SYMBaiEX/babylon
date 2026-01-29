/**
 * CHECK_PREDICTIONS Action (Coordinator)
 *
 * Returns prediction market data:
 * - Question text
 * - Status (active/resolved)
 * - YES/NO probabilities
 * - Days until resolution
 * - Resolution outcome (if resolved)
 */

import { db, desc, eq, gte, markets } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

type StatusFilter = 'active' | 'resolved' | 'all';

function getDaysUntil(date: Date | null): number | null {
  if (!date) return null;
  const now = Date.now();
  const diff = date.getTime() - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export const checkPredictionsAction: Action = {
  name: 'CHECK_PREDICTIONS',
  description:
    'Check prediction markets - questions, YES/NO odds, resolution dates. Help users discover markets to trade.',
  parameters: {
    status: {
      type: 'string',
      description:
        'Filter by status: "active", "resolved", or "all" (default: "active")',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Number of predictions to show (default: 10, max: 20)',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'What predictions are active?' },
      },
      {
        name: 'coordinator',
        content: { text: "I'll check the active prediction markets." },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Show me resolved predictions' },
      },
      {
        name: 'coordinator',
        content: { text: 'Let me fetch the resolved predictions.' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'What can I bet on?' },
      },
      {
        name: 'coordinator',
        content: { text: "I'll show you the available prediction markets." },
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
      | { status?: string; limit?: number }
      | undefined;
    const statusFilter = (actionParams?.status as StatusFilter) ?? 'active';
    const limit = Math.min(Math.max(actionParams?.limit ?? 10, 1), 20);

    try {
      // Build query based on status filter
      let query = db.select().from(markets);

      if (statusFilter === 'active') {
        query = query.where(eq(markets.resolved, false)) as typeof query;
        // Also filter for markets that haven't ended
        const now = new Date();
        query = query.where(gte(markets.endDate, now)) as typeof query;
      } else if (statusFilter === 'resolved') {
        query = query.where(eq(markets.resolved, true)) as typeof query;
      }
      // 'all' - no filter

      const predictions = await query
        .orderBy(desc(markets.createdAt))
        .limit(limit);

      if (predictions.length === 0) {
        const statusText = statusFilter === 'all' ? '' : ` ${statusFilter}`;
        return {
          success: true,
          text: `No${statusText} predictions found.`,
          data: { predictions: [], count: 0, status: statusFilter },
          values: { count: 0 },
        };
      }

      // Format predictions
      const formattedPredictions = predictions.map((p, i) => {
        const yesShares = Number(p.yesShares || 0);
        const noShares = Number(p.noShares || 0);
        const totalShares = yesShares + noShares;
        const yesPercent =
          totalShares > 0 ? Math.round((yesShares / totalShares) * 100) : 50;
        const noPercent = 100 - yesPercent;
        const daysUntil = getDaysUntil(p.endDate);

        return {
          index: i + 1,
          id: p.id,
          question: p.question,
          yesPercent,
          noPercent,
          resolved: p.resolved,
          resolution: p.resolution,
          daysUntil,
          endDate: p.endDate?.toISOString().split('T')[0] ?? 'TBD',
        };
      });

      logger.info(
        `[CHECK_PREDICTIONS] Retrieved ${predictions.length} ${statusFilter} predictions`,
        undefined,
        'CheckPredictions'
      );

      return {
        success: true,
        text: `Retrieved ${formattedPredictions.length} ${statusFilter} predictions.`,
        data: {
          predictions: formattedPredictions,
          count: formattedPredictions.length,
          status: statusFilter,
        },
        values: {
          count: formattedPredictions.length,
          markets: formattedPredictions.map((p) => ({
            id: p.id,
            question:
              p.question.length > 80
                ? p.question.substring(0, 80) + '...'
                : p.question,
            yesPercent: p.yesPercent,
            resolved: p.resolved,
            daysUntil: p.daysUntil,
          })),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_PREDICTIONS] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to retrieve predictions: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
};

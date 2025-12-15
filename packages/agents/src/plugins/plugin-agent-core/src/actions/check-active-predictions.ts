/**
 * CHECK_ACTIVE_PREDICTIONS Action
 *
 * Returns active prediction questions with:
 * - Question text
 * - Days until resolution
 * - Current status
 */

import { db, desc, eq, questions } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

export const checkActivePredictionsAction: Action = {
  name: 'CHECK_ACTIVE_PREDICTIONS',
  description: 'Check active prediction questions and their resolution dates',
  parameters: {
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
        name: 'assistant',
        content: { text: "I'll check the active predictions." },
      },
    ],
    [
      {
        name: 'user',
        content: { text: "What's being predicted right now?" },
      },
      {
        name: 'assistant',
        content: { text: 'Let me fetch the current prediction questions.' },
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
    const limit = Math.min(Math.max(actionParams?.limit ?? 10, 1), 20);

    try {
      // Get active questions from the Question table
      const activeQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.status, 'active'))
        .orderBy(desc(questions.createdAt))
        .limit(limit);

      if (activeQuestions.length === 0) {
        return {
          success: true,
          text: 'No active predictions at the moment.',
          data: { predictions: [], count: 0 },
          values: { predictions: [], count: 0, hasPredictions: false },
        };
      }

      // Format predictions with days until resolution
      const formattedPredictions = activeQuestions.map((q, i) => {
        const resolutionDate = q.resolutionDate
          ? new Date(q.resolutionDate)
          : null;
        const daysUntil = resolutionDate
          ? Math.ceil(
              (resolutionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )
          : null;

        return {
          index: i + 1,
          id: q.id,
          question: q.text,
          status: q.status,
          daysUntilResolution: daysUntil,
          resolutionDate: resolutionDate?.toISOString().split('T')[0] ?? 'TBD',
        };
      });

      // Build response text
      const predictionsList = formattedPredictions
        .map((p) => {
          const timeStr =
            p.daysUntilResolution !== null
              ? p.daysUntilResolution > 0
                ? `resolves in ${p.daysUntilResolution}d`
                : 'resolving soon'
              : 'no deadline';
          return `${p.index}. "${p.question}" (${timeStr})`;
        })
        .join('\n');

      const responseText = `**Active Predictions (${activeQuestions.length}):**\n${predictionsList}`;

      logger.info(
        `[CHECK_ACTIVE_PREDICTIONS] Retrieved ${activeQuestions.length} predictions`,
        undefined,
        'CheckActivePredictions'
      );

      return {
        success: true,
        text: responseText,
        data: {
          predictions: formattedPredictions,
          count: formattedPredictions.length,
        },
        values: {
          predictions: formattedPredictions,
          count: formattedPredictions.length,
          hasPredictions: true,
          predictionsList,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_ACTIVE_PREDICTIONS] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to retrieve predictions: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


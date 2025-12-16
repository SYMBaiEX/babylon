/**
 * Sell Prediction Action
 * Sell shares in a prediction market via A2A client
 */

import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import type { BabylonRuntime } from '../../../babylon/types';
import { logger } from '../../../../shared/logger';

export const sellPredictionAction: Action = {
  name: 'SELL_PREDICTION',
  description:
    'Sell shares from an existing prediction market position. Requires position ID and number of shares.',
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
    const babylonRuntime = runtime as BabylonRuntime;

    // Check A2A connectivity
    if (!babylonRuntime.a2aClient?.isConnected()) {
      logger.warn('[SELL_PREDICTION] A2A client not connected');
      return {
        success: false,
        text: 'Trading is not available right now. A2A client not connected.',
        data: { error: 'A2A not connected' },
        values: { error: 'A2A not connected' },
      };
    }

    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | { positionId?: string; shares?: number }
      | undefined;

    const positionId = actionParams?.positionId;
    const shares = actionParams?.shares;

    if (!positionId || !shares) {
      return {
        success: false,
        text: 'Missing required parameters. Need positionId and shares.',
        data: { error: 'Missing parameters' },
        values: { error: 'Missing parameters' },
      };
    }

    if (shares <= 0) {
      return {
        success: false,
        text: 'Shares must be greater than 0.',
        data: { error: 'Invalid shares' },
        values: { error: 'Invalid shares' },
      };
    }

    try {
      const result = (await babylonRuntime.a2aClient.sellShares(
        positionId,
        shares
      )) as {
        success?: boolean;
        remainingShares?: number;
        proceeds?: number;
        message?: string;
      };

      if (result.success === false) {
        logger.warn('[SELL_PREDICTION] Trade failed', { message: result.message });
        return {
          success: false,
          text: `Failed to sell shares: ${result.message || 'Unknown error'}`,
          data: { error: result.message },
          values: { error: result.message },
        };
      }

      const responseText = `Sold ${shares} shares. Proceeds: $${(result.proceeds ?? 0).toFixed(2)}. Remaining: ${result.remainingShares ?? 0} shares`;

      logger.info('[SELL_PREDICTION] Trade successful', {
        positionId,
        shares,
        proceeds: result.proceeds,
        remainingShares: result.remainingShares,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId,
          sharesSold: shares,
          proceeds: result.proceeds,
          remainingShares: result.remainingShares,
        },
        values: {
          positionId,
          sharesSold: shares,
          proceeds: result.proceeds,
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


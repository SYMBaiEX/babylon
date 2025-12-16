/**
 * Buy Prediction Action
 * Buy shares in a prediction market via A2A client
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

export const buyPredictionAction: Action = {
  name: 'BUY_PREDICTION',
  description:
    'Buy YES or NO shares in a prediction market. Requires market ID, side (YES/NO), and amount.',
  parameters: {
    marketId: {
      type: 'string',
      description: 'The ID of the prediction market',
      required: true,
    },
    side: {
      type: 'string',
      enum: ['YES', 'NO'],
      description: 'Which side to buy: "YES" or "NO"',
      required: true,
    },
    amount: {
      type: 'number',
      description: 'Dollar amount to spend on shares',
      required: true,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Buy $50 YES on the Tesla prediction' },
      },
      {
        name: 'assistant',
        content: { text: 'Buying YES shares on that market...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Put $100 on NO for the Apple question' },
      },
      {
        name: 'assistant',
        content: { text: "I'll buy NO shares for you." },
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
      logger.warn('[BUY_PREDICTION] A2A client not connected');
      return {
        success: false,
        text: 'Trading is not available right now. A2A client not connected.',
        data: { error: 'A2A not connected' },
        values: { error: 'A2A not connected' },
      };
    }

    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | { marketId?: string; side?: 'YES' | 'NO'; amount?: number }
      | undefined;

    const marketId = actionParams?.marketId;
    const side = actionParams?.side?.toUpperCase() as 'YES' | 'NO' | undefined;
    const amount = actionParams?.amount;

    if (!marketId || !side || !amount) {
      return {
        success: false,
        text: 'Missing required parameters. Need marketId, side (YES/NO), and amount.',
        data: { error: 'Missing parameters' },
        values: { error: 'Missing parameters' },
      };
    }

    if (side !== 'YES' && side !== 'NO') {
      return {
        success: false,
        text: 'Invalid side. Must be YES or NO.',
        data: { error: 'Invalid side' },
        values: { error: 'Invalid side' },
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        text: 'Amount must be greater than 0.',
        data: { error: 'Invalid amount' },
        values: { error: 'Invalid amount' },
      };
    }

    try {
      const result = (await babylonRuntime.a2aClient.buyShares(
        marketId,
        side,
        amount
      )) as {
        success?: boolean;
        shares?: number;
        avgPrice?: number;
        cost?: number;
        message?: string;
      };

      if (result.success === false) {
        logger.warn('[BUY_PREDICTION] Trade failed', { message: result.message });
        return {
          success: false,
          text: `Failed to buy shares: ${result.message || 'Unknown error'}`,
          data: { error: result.message },
          values: { error: result.message },
        };
      }

      const responseText = `Bought ${result.shares ?? 0} ${side} shares at avg price $${(result.avgPrice ?? 0).toFixed(2)}. Cost: $${(result.cost ?? amount).toFixed(2)}`;

      logger.info('[BUY_PREDICTION] Trade successful', {
        marketId,
        side,
        shares: result.shares,
        cost: result.cost,
      });

      return {
        success: true,
        text: responseText,
        data: {
          marketId,
          side,
          shares: result.shares,
          avgPrice: result.avgPrice,
          cost: result.cost,
        },
        values: {
          marketId,
          side,
          shares: result.shares,
          avgPrice: result.avgPrice,
          cost: result.cost,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[BUY_PREDICTION] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to buy shares: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


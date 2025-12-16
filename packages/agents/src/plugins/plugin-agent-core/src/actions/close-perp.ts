/**
 * Close Perp Action
 * Close an open perpetual position via A2A client
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

export const closePerpAction: Action = {
  name: 'CLOSE_PERP',
  description:
    'Close an open perpetual position. Requires the position ID.',
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
    const babylonRuntime = runtime as BabylonRuntime;

    // Check A2A connectivity
    if (!babylonRuntime.a2aClient?.isConnected()) {
      logger.warn('[CLOSE_PERP] A2A client not connected');
      return {
        success: false,
        text: 'Trading is not available right now. A2A client not connected.',
        data: { error: 'A2A not connected' },
        values: { error: 'A2A not connected' },
      };
    }

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
      const result = (await babylonRuntime.a2aClient.closePosition(
        positionId
      )) as {
        success?: boolean;
        exitPrice?: number;
        pnl?: number;
        message?: string;
      };

      if (result.success === false) {
        logger.warn('[CLOSE_PERP] Close failed', { message: result.message });
        return {
          success: false,
          text: `Failed to close position: ${result.message || 'Unknown error'}`,
          data: { error: result.message },
          values: { error: result.message },
        };
      }

      const pnl = result.pnl ?? 0;
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      const responseText = `Closed position at $${(result.exitPrice ?? 0).toFixed(2)}. P&L: ${pnlStr}`;

      logger.info('[CLOSE_PERP] Position closed', {
        positionId,
        exitPrice: result.exitPrice,
        pnl: result.pnl,
      });

      return {
        success: true,
        text: responseText,
        data: {
          positionId,
          exitPrice: result.exitPrice,
          pnl: result.pnl,
        },
        values: {
          positionId,
          exitPrice: result.exitPrice,
          pnl: result.pnl,
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


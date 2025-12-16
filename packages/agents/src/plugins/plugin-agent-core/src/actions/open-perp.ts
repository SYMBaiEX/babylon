/**
 * Open Perp Action
 * Open a leveraged perpetual position via A2A client
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

export const openPerpAction: Action = {
  name: 'OPEN_PERP',
  description:
    'Open a leveraged perpetual position on a stock/company. Requires ticker, side (LONG/SHORT), amount, and optional leverage.',
  parameters: {
    ticker: {
      type: 'string',
      description: 'Stock ticker symbol (e.g., AAPL, TSLA, NVDA)',
      required: true,
    },
    side: {
      type: 'string',
      enum: ['LONG', 'SHORT'],
      description: 'Position direction: "LONG" (bet price goes up) or "SHORT" (bet price goes down)',
      required: true,
    },
    amount: {
      type: 'number',
      description: 'Dollar amount to use as collateral',
      required: true,
    },
    leverage: {
      type: 'number',
      description: 'Leverage multiplier (1-10x). Default: 1',
      required: false,
    },
  },
  examples: [
    [
      {
        name: 'user',
        content: { text: 'Open a 5x long on NVDA with $100' },
      },
      {
        name: 'assistant',
        content: { text: 'Opening a leveraged long position on NVDA...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'Short Tesla with $50' },
      },
      {
        name: 'assistant',
        content: { text: "I'll open a short position on TSLA for you." },
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
      logger.warn('[OPEN_PERP] A2A client not connected');
      return {
        success: false,
        text: 'Trading is not available right now. A2A client not connected.',
        data: { error: 'A2A not connected' },
        values: { error: 'A2A not connected' },
      };
    }

    // Get parameters from state
    const actionParams = state?.data?.actionParams as
      | {
          ticker?: string;
          side?: 'LONG' | 'SHORT';
          amount?: number;
          leverage?: number;
        }
      | undefined;

    const ticker = actionParams?.ticker?.toUpperCase();
    const side = actionParams?.side?.toUpperCase() as 'LONG' | 'SHORT' | undefined;
    const amount = actionParams?.amount;
    const leverage = actionParams?.leverage ?? 1;

    if (!ticker || !side || !amount) {
      return {
        success: false,
        text: 'Missing required parameters. Need ticker, side (LONG/SHORT), and amount.',
        data: { error: 'Missing parameters' },
        values: { error: 'Missing parameters' },
      };
    }

    if (side !== 'LONG' && side !== 'SHORT') {
      return {
        success: false,
        text: 'Invalid side. Must be LONG or SHORT.',
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

    if (leverage < 1 || leverage > 10) {
      return {
        success: false,
        text: 'Leverage must be between 1 and 10.',
        data: { error: 'Invalid leverage' },
        values: { error: 'Invalid leverage' },
      };
    }

    try {
      const result = (await babylonRuntime.a2aClient.openPosition(
        ticker,
        side,
        amount,
        leverage
      )) as {
        success?: boolean;
        positionId?: string;
        entryPrice?: number;
        message?: string;
      };

      if (result.success === false) {
        logger.warn('[OPEN_PERP] Trade failed', { message: result.message });
        return {
          success: false,
          text: `Failed to open position: ${result.message || 'Unknown error'}`,
          data: { error: result.message },
          values: { error: result.message },
        };
      }

      const responseText = `Opened ${leverage}x ${side} position on ${ticker} at $${(result.entryPrice ?? 0).toFixed(2)}. Position ID: ${result.positionId ?? 'unknown'}`;

      logger.info('[OPEN_PERP] Position opened', {
        ticker,
        side,
        amount,
        leverage,
        entryPrice: result.entryPrice,
        positionId: result.positionId,
      });

      return {
        success: true,
        text: responseText,
        data: {
          ticker,
          side,
          amount,
          leverage,
          entryPrice: result.entryPrice,
          positionId: result.positionId,
        },
        values: {
          ticker,
          side,
          amount,
          leverage,
          entryPrice: result.entryPrice,
          positionId: result.positionId,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[OPEN_PERP] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to open position: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


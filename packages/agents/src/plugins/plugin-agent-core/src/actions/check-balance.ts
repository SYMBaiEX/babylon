/**
 * Check Balance Action
 * Returns the agent's current wallet balance
 */

import { WalletService } from '@babylon/engine';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

export const checkBalanceAction: Action = {
  name: 'CHECK_BALANCE',
  description: 'Check the agent wallet balance. Use this before making trades to ensure sufficient funds.',
  parameters: {},
  examples: [
    [
      {
        name: 'user',
        content: { text: 'What is your balance?' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me check my current balance.' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'How much money do you have?' },
      },
      {
        name: 'assistant',
        content: { text: "I'll check my wallet balance." },
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
    const agentUserId = runtime.agentId;

    try {
      const walletInfo = await WalletService.getBalance(agentUserId);
      const balance = walletInfo.balance;

      const responseText = `Current balance: $${balance.toFixed(2)}`;

      logger.info('[CHECK_BALANCE] Retrieved balance', {
        agentUserId,
        balance,
      });

      return {
        success: true,
        text: responseText,
        data: {
          balance,
          userId: agentUserId,
        },
        values: {
          balance,
          hasBalance: balance > 0,
          canTrade: balance >= 1, // Minimum $1 to trade
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_BALANCE] Error:', errorMsg);
      return {
        success: false,
        text: `Failed to check balance: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


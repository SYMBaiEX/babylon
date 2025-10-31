/**
 * Babylon Game Actions
 *
 * Eliza actions for interacting with Babylon prediction markets
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from '@ai16z/eliza';
import { BabylonApiClient } from '../api-client';
import type { TradeRequest } from '../types';

/**
 * Buy Shares Action
 *
 * Allows agents to place bets on prediction markets
 */
export const buySharesAction: Action = {
  name: 'BUY_SHARES',
  similes: [
    'BUY',
    'PLACE_BET',
    'TAKE_POSITION',
    'ENTER_MARKET',
    'BET_ON',
  ],
  description: 'Buy shares in a prediction market',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Check if agent has Babylon client configured
    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) {
      console.error('Babylon client not configured');
      return false;
    }

    // Extract market intent from message
    const content = message.content.text.toLowerCase();
    const hasBuyIntent =
      content.includes('buy') ||
      content.includes('bet') ||
      content.includes('take position') ||
      content.includes('go long') ||
      content.includes('yes on') ||
      content.includes('no on');

    return hasBuyIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<unknown> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    if (!client) {
      callback?.({
        text: 'Error: Babylon client not configured',
        action: 'BUY_SHARES',
        source: message.content.source,
      });
      return false;
    }

    try {
      // Extract trade parameters from message or state
      const tradeRequest: TradeRequest = {
        marketId: (state as any)?.marketId || (options as any)?.marketId,
        side: (state as any)?.side || (options as any)?.side || 'yes',
        amount: (state as any)?.amount || (options as any)?.amount || 10,
      };

      // Validate parameters
      if (!tradeRequest.marketId) {
        callback?.({
          text: 'Error: No market specified for trade',
          action: 'BUY_SHARES',
          source: message.content.source,
        });
        return false;
      }

      // Check wallet balance
      const wallet = await client.getWallet();
      if (!wallet || wallet.availableBalance < tradeRequest.amount) {
        callback?.({
          text: `Insufficient balance. Available: $${wallet?.availableBalance || 0}, Required: $${tradeRequest.amount}`,
          action: 'BUY_SHARES',
          source: message.content.source,
        });
        return false;
      }

      // Execute trade
      console.log(`Buying ${tradeRequest.side} shares for $${tradeRequest.amount} on market ${tradeRequest.marketId}`);
      const result = await client.buyShares(tradeRequest);

      if (result.success) {
        const responseText = `✅ Trade executed! Bought ${result.shares?.toFixed(2)} shares at avg price $${result.avgPrice?.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: 'BUY_SHARES',
          source: message.content.source,
          data: result,
        });

        return true;
      } else {
        callback?.({
          text: `❌ Trade failed: ${result.error}`,
          action: 'BUY_SHARES',
          source: message.content.source,
        });
        return false;
      }
    } catch (error) {
      console.error('Error in buySharesAction:', error);
      callback?.({
        text: `Error executing trade: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'BUY_SHARES',
        source: message.content.source,
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Buy YES shares on this market for $50',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Analyzing market... Executing trade for $50 on YES side.',
          action: 'BUY_SHARES',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'I want to bet $100 on NO for question 42',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Placing bet of $100 on NO side for market 42.',
          action: 'BUY_SHARES',
        },
      },
    ],
  ],
};

/**
 * Sell Shares Action
 *
 * Allows agents to close positions and realize profits/losses
 */
export const sellSharesAction: Action = {
  name: 'SELL_SHARES',
  similes: [
    'SELL',
    'CLOSE_POSITION',
    'EXIT_MARKET',
    'TAKE_PROFIT',
    'STOP_LOSS',
  ],
  description: 'Sell shares and close position in a prediction market',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) return false;

    const content = message.content.text.toLowerCase();
    const hasSellIntent =
      content.includes('sell') ||
      content.includes('close position') ||
      content.includes('exit') ||
      content.includes('take profit') ||
      content.includes('stop loss');

    return hasSellIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<unknown> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    if (!client) {
      callback?.({
        text: 'Error: Babylon client not configured',
        action: 'SELL_SHARES',
        source: message.content.source,
      });
      return false;
    }

    try {
      const marketId = (state as any)?.marketId || (options as any)?.marketId;
      const shares = (state as any)?.shares || (options as any)?.shares;

      if (!marketId) {
        callback?.({
          text: 'Error: No market specified',
          action: 'SELL_SHARES',
          source: message.content.source,
        });
        return false;
      }

      // Get current position
      const positions = await client.getPositions();
      const position = positions.find(p => p.marketId === marketId);

      if (!position) {
        callback?.({
          text: `No position found for market ${marketId}`,
          action: 'SELL_SHARES',
          source: message.content.source,
        });
        return false;
      }

      // Sell shares
      const sharesToSell = (shares || position.shares) as number;
      console.log(`Selling ${sharesToSell} shares from market ${marketId}`);
      const result = await client.sellShares(marketId, sharesToSell);

      if (result.success) {
        const responseText = `✅ Position closed! Sold ${sharesToSell.toFixed(2)} shares. P&L: ${position.pnl >= 0 ? '+' : ''}$${position.pnl.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: 'SELL_SHARES',
          source: message.content.source,
          data: result,
        });

        return true;
      } else {
        callback?.({
          text: `❌ Sale failed: ${result.error}`,
          action: 'SELL_SHARES',
          source: message.content.source,
        });
        return false;
      }
    } catch (error) {
      console.error('Error in sellSharesAction:', error);
      callback?.({
        text: `Error selling shares: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'SELL_SHARES',
        source: message.content.source,
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Sell my position on market 42',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Closing position on market 42...',
          action: 'SELL_SHARES',
        },
      },
    ],
  ],
};

/**
 * Check Wallet Action
 *
 * Allows agents to check their balance and available funds
 */
export const checkWalletAction: Action = {
  name: 'CHECK_WALLET',
  similes: [
    'CHECK_BALANCE',
    'WALLET_STATUS',
    'HOW_MUCH_MONEY',
    'MY_BALANCE',
  ],
  description: 'Check wallet balance and available funds',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;
    if (!client) return false;

    const content = message.content.text.toLowerCase();
    const hasWalletIntent =
      content.includes('balance') ||
      content.includes('wallet') ||
      content.includes('how much') ||
      content.includes('funds');

    return hasWalletIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<unknown> => {
    const client = runtime.clients.babylonClient as BabylonApiClient;

    if (!client) {
      callback?.({
        text: 'Error: Babylon client not configured',
        action: 'CHECK_WALLET',
        source: message.content.source,
      });
      return false;
    }

    try {
      const wallet = await client.getWallet();

      if (!wallet) {
        callback?.({
          text: 'Error fetching wallet information',
          action: 'CHECK_WALLET',
          source: message.content.source,
        });
        return false;
      }

      const responseText = `💰 Wallet Status:\nTotal Balance: $${wallet.balance.toFixed(2)}\nAvailable: $${wallet.availableBalance.toFixed(2)}\nLocked in positions: $${wallet.lockedBalance.toFixed(2)}`;

      callback?.({
        text: responseText,
        action: 'CHECK_WALLET',
        source: message.content.source,
        data: wallet,
      });

      return true;
    } catch (error) {
      console.error('Error in checkWalletAction:', error);
      callback?.({
        text: `Error checking wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'CHECK_WALLET',
        source: message.content.source,
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'How much money do I have?',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Checking wallet...',
          action: 'CHECK_WALLET',
        },
      },
    ],
  ],
};

// Export all actions
export const babylonGameActions: Action[] = [
  buySharesAction,
  sellSharesAction,
  checkWalletAction,
];

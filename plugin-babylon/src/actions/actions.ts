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
  ActionResult,
} from '@elizaos/core';
import { BabylonClientService } from '../plugin';
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
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);
    if (!babylonService) {
      runtime.logger.error('Babylon service not configured');
      return false;
    }

    // Extract market intent from message
    const content = message.content.text?.toLowerCase() || '';
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
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: 'Error: Babylon service not configured',
        error: 'Babylon service not configured',
      };
      callback?.({
        text: errorResult.text,
        action: 'BUY_SHARES',
      });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Log user intent for debugging (message content may provide context)
      if (message.content.text) {
        runtime.logger.debug(`BUY_SHARES triggered by: ${message.content.text.substring(0, 100)}`);
      }

      // Extract trade parameters from message or state
      const tradeRequest: TradeRequest = {
        marketId: (state as any)?.marketId || (options as any)?.marketId,
        side: (state as any)?.side || (options as any)?.side || 'yes',
        amount: (state as any)?.amount || (options as any)?.amount || 10,
      };

      // Validate parameters
      if (!tradeRequest.marketId) {
        const errorResult: ActionResult = {
          success: false,
          text: 'Error: No market specified for trade',
          error: 'No market specified',
        };
        callback?.({
          text: errorResult.text,
          action: 'BUY_SHARES',
        });
        return errorResult;
      }

      // Check wallet balance
      const wallet = await client.getWallet();
      if (!wallet || wallet.availableBalance < tradeRequest.amount) {
        const errorResult: ActionResult = {
          success: false,
          text: `Insufficient balance. Available: $${wallet?.availableBalance || 0}, Required: $${tradeRequest.amount}`,
          error: 'Insufficient balance',
        };
        callback?.({
          text: errorResult.text,
          action: 'BUY_SHARES',
        });
        return errorResult;
      }

      // Execute trade
      runtime.logger.info(`Buying ${tradeRequest.side} shares for $${tradeRequest.amount} on market ${tradeRequest.marketId}`);
      const result = await client.buyShares(tradeRequest);

      if (result.success) {
        const responseText = `✅ Trade executed! Bought ${result.shares?.toFixed(2)} shares at avg price $${result.avgPrice?.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: 'BUY_SHARES',
          data: result,
        });

        return {
          success: true,
          text: responseText,
          data: result,
        };
      } else {
        const errorResult: ActionResult = {
          success: false,
          text: `❌ Trade failed: ${result.error}`,
          error: result.error,
        };
        callback?.({
          text: errorResult.text,
          action: 'BUY_SHARES',
        });
        return errorResult;
      }
    } catch (error) {
      runtime.logger.error(`Error in buySharesAction: ${error instanceof Error ? error.message : String(error)}`);
      const errorResult: ActionResult = {
        success: false,
        text: `Error executing trade: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
      callback?.({
        text: errorResult.text,
        action: 'BUY_SHARES',
      });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Buy YES shares on this market for $50',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Analyzing market... Executing trade for $50 on YES side.',
          action: 'BUY_SHARES',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I want to bet $100 on NO for question 42',
        },
      },
      {
        name: '{{agent}}',
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
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);
    if (!babylonService) return false;

    const content = message.content.text?.toLowerCase() || '';
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
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: 'Error: Babylon service not configured',
        error: 'Babylon service not configured',
      };
      callback?.({ text: errorResult.text, action: 'SELL_SHARES' });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Log user intent for debugging (message content may provide context)
      if (message.content.text) {
        runtime.logger.debug(`SELL_SHARES triggered by: ${message.content.text.substring(0, 100)}`);
      }

      const marketId = (state as any)?.marketId || (options as any)?.marketId;
      const shares = (state as any)?.shares || (options as any)?.shares;

      if (!marketId) {
        const errorResult: ActionResult = {
          success: false,
          text: 'Error: No market specified',
          error: 'No market specified',
        };
        callback?.({ text: errorResult.text, action: 'SELL_SHARES' });
        return errorResult;
      }

      // Get current position
      const positions = await client.getPositions();
      const position = positions.find(p => p.marketId === marketId);

      if (!position) {
        const errorResult: ActionResult = {
          success: false,
          text: `No position found for market ${marketId}`,
          error: 'Position not found',
        };
        callback?.({ text: errorResult.text, action: 'SELL_SHARES' });
        return errorResult;
      }

      // Sell shares
      const sharesToSell = (shares || position.shares) as number;
      runtime.logger.info(`Selling ${sharesToSell} shares from market ${marketId}`);
      const result = await client.sellShares(marketId, sharesToSell);

      if (result.success) {
        const responseText = `✅ Position closed! Sold ${sharesToSell.toFixed(2)} shares. P&L: ${position.pnl >= 0 ? '+' : ''}$${position.pnl.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: 'SELL_SHARES',
          data: result,
        });

        return {
          success: true,
          text: responseText,
          data: result,
        };
      } else {
        const errorResult: ActionResult = {
          success: false,
          text: `❌ Sale failed: ${result.error}`,
          error: result.error,
        };
        callback?.({ text: errorResult.text, action: 'SELL_SHARES' });
        return errorResult;
      }
    } catch (error) {
      runtime.logger.error(`Error in sellSharesAction: ${error instanceof Error ? error.message : String(error)}`);
      const errorResult: ActionResult = {
        success: false,
        text: `Error selling shares: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
      callback?.({ text: errorResult.text, action: 'SELL_SHARES' });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Sell my position on market 42',
        },
      },
      {
        name: '{{agent}}',
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
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);
    if (!babylonService) return false;

    const content = message.content.text?.toLowerCase() || '';
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
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(BabylonClientService.serviceType);

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: 'Error: Babylon service not configured',
        error: 'Babylon service not configured',
      };
      callback?.({ text: errorResult.text, action: 'CHECK_WALLET' });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Extract display preferences from options
      const showDetailed = (options as any)?.detailed === true;
      const includeTradingContext = (options as any)?.includeTradingContext === true;

      // Check state for trading context
      const inTradingFlow = (state as any)?.inTradingFlow === true;
      const pendingTradeAmount = (state as any)?.pendingTradeAmount as number | undefined;

      // Extract any specific request from message (e.g., "detailed balance")
      const messageText = message.content.text?.toLowerCase() || '';
      const detailedRequest = messageText.includes('detail') || showDetailed;

      const wallet = await client.getWallet();

      if (!wallet) {
        const errorResult: ActionResult = {
          success: false,
          text: 'Error fetching wallet information',
          error: 'Wallet information unavailable',
        };
        callback?.({ text: errorResult.text, action: 'CHECK_WALLET' });
        return errorResult;
      }

      // Build response with optional details
      let responseText = `💰 Wallet Status:\nTotal Balance: $${wallet.balance.toFixed(2)}\nAvailable: $${wallet.availableBalance.toFixed(2)}\nLocked in positions: $${wallet.lockedBalance.toFixed(2)}`;

      // Add detailed analysis if requested
      if (detailedRequest && wallet.balance > 0) {
        const utilizationRate = ((wallet.lockedBalance / wallet.balance) * 100).toFixed(1);
        responseText += `\n\nDetailed Analysis:\n- Capital Utilization: ${utilizationRate}%\n- Available for Trading: ${((wallet.availableBalance / wallet.balance) * 100).toFixed(1)}%`;
      }

      // Add trading context if in trading flow
      if ((inTradingFlow || includeTradingContext) && pendingTradeAmount) {
        const canAfford = wallet.availableBalance >= pendingTradeAmount;
        const remainingAfterTrade = wallet.availableBalance - pendingTradeAmount;

        responseText += `\n\n🔄 Trading Context:\n- Pending Trade: $${pendingTradeAmount.toFixed(2)}`;
        responseText += canAfford
          ? `\n- Status: ✅ Sufficient funds\n- Remaining after trade: $${remainingAfterTrade.toFixed(2)}`
          : `\n- Status: ❌ Insufficient funds (need $${(pendingTradeAmount - wallet.availableBalance).toFixed(2)} more)`;
      }

      callback?.({
        text: responseText,
        action: 'CHECK_WALLET',
        data: wallet,
      });

      return {
        success: true,
        text: responseText,
        data: wallet,
      };
    } catch (error) {
      runtime.logger.error(`Error in checkWalletAction: ${error instanceof Error ? error.message : String(error)}`);
      const errorResult: ActionResult = {
        success: false,
        text: `Error checking wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
      callback?.({ text: errorResult.text, action: 'CHECK_WALLET' });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'How much money do I have?',
        },
      },
      {
        name: '{{agent}}',
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

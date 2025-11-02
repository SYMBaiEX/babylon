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
} from "@elizaos/core";
import { BabylonClientService } from "../plugin";
import type { TradeRequest } from "../types";

/**
 * Extended State interface for Babylon trading actions
 */
interface BabylonActionState extends State {
  marketId?: string;
  side?: "yes" | "no";
  amount?: number;
  shares?: number;
  inTradingFlow?: boolean;
  pendingTradeAmount?: number;
}

/**
 * Options interface for action handlers
 */
interface BabylonActionOptions {
  marketId?: string;
  side?: "yes" | "no";
  amount?: number;
  shares?: number;
  detailed?: boolean;
  includeTradingContext?: boolean;
}

/**
 * Buy Shares Action
 *
 * Allows agents to place bets on prediction markets
 */
export const buySharesAction: Action = {
  name: "BUY_SHARES",
  similes: ["BUY", "PLACE_BET", "TAKE_POSITION", "ENTER_MARKET", "BET_ON"],
  description: "Buy shares in a prediction market",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) {
      runtime.logger.error("Babylon service not configured");
      return false;
    }

    // Extract market intent from message
    const content = message.content.text?.toLowerCase() || "";
    const hasBuyIntent =
      content.includes("buy") ||
      content.includes("bet") ||
      content.includes("take position") ||
      content.includes("go long") ||
      content.includes("yes on") ||
      content.includes("no on");

    return hasBuyIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
      callback?.({
        text: errorResult.text,
        action: "BUY_SHARES",
      });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Log user intent for debugging (message content may provide context)
      if (message.content.text) {
        runtime.logger.debug(
          `BUY_SHARES triggered by: ${message.content.text.substring(0, 100)}`,
        );
      }

      // Extract trade parameters from message or state
      const actionState = state as BabylonActionState | undefined;
      const actionOptions = options as BabylonActionOptions | undefined;
      const marketId = actionState?.marketId || actionOptions?.marketId;
      
      // Validate parameters
      if (!marketId || typeof marketId !== 'string') {
        const errorResult: ActionResult = {
          success: false,
          text: "Error: No market specified for trade",
          error: "No market specified",
        };
        callback?.({
          text: errorResult.text,
          action: "BUY_SHARES",
        });
        return errorResult;
      }

      const tradeRequest: TradeRequest = {
        marketId,
        side: (actionState?.side || actionOptions?.side || "yes") as "yes" | "no",
        amount: actionState?.amount || actionOptions?.amount || 10,
      };

      // Check wallet balance
      const wallet = await client.getWallet();
      if (!wallet || wallet.availableBalance < tradeRequest.amount) {
        const errorResult: ActionResult = {
          success: false,
          text: `Insufficient balance. Available: $${wallet?.availableBalance || 0}, Required: $${tradeRequest.amount}`,
          error: "Insufficient balance",
        };
        callback?.({
          text: errorResult.text,
          action: "BUY_SHARES",
        });
        return errorResult;
      }

      // Execute trade
      runtime.logger.info(
        `Buying ${tradeRequest.side} shares for $${tradeRequest.amount} on market ${tradeRequest.marketId}`,
      );
      const result = await client.buyShares(tradeRequest);

      if (result.success) {
        const responseText = `✅ Trade executed! Bought ${result.shares?.toFixed(2)} shares at avg price $${result.avgPrice?.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: "BUY_SHARES",
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
          action: "BUY_SHARES",
        });
        return errorResult;
      }
    } catch (error) {
      runtime.logger.error(
        `Error in buySharesAction: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorResult: ActionResult = {
        success: false,
        text: `Error executing trade: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      callback?.({
        text: errorResult.text,
        action: "BUY_SHARES",
      });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Buy YES shares on this market for $50",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Analyzing market... Executing trade for $50 on YES side.",
          action: "BUY_SHARES",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to bet $100 on NO for question 42",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Placing bet of $100 on NO side for market 42.",
          action: "BUY_SHARES",
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
  name: "SELL_SHARES",
  similes: [
    "SELL",
    "CLOSE_POSITION",
    "EXIT_MARKET",
    "TAKE_PROFIT",
    "STOP_LOSS",
  ],
  description: "Sell shares and close position in a prediction market",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) return false;

    const content = message.content.text?.toLowerCase() || "";
    const hasSellIntent =
      content.includes("sell") ||
      content.includes("close position") ||
      content.includes("exit") ||
      content.includes("take profit") ||
      content.includes("stop loss");

    return hasSellIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
      callback?.({ text: errorResult.text, action: "SELL_SHARES" });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Log user intent for debugging (message content may provide context)
      if (message.content.text) {
        runtime.logger.debug(
          `SELL_SHARES triggered by: ${message.content.text.substring(0, 100)}`,
        );
      }

      const actionState = state as BabylonActionState | undefined;
      const actionOptions = options as BabylonActionOptions | undefined;
      const marketId = actionState?.marketId || actionOptions?.marketId;
      const shares = actionState?.shares || actionOptions?.shares;

      if (!marketId) {
        const errorResult: ActionResult = {
          success: false,
          text: "Error: No market specified",
          error: "No market specified",
        };
        callback?.({ text: errorResult.text, action: "SELL_SHARES" });
        return errorResult;
      }

      // Get current position
      const positions = await client.getPositions();
      const position = positions.find((p) => p.marketId === marketId);

      if (!position) {
        const errorResult: ActionResult = {
          success: false,
          text: `No position found for market ${marketId}`,
          error: "Position not found",
        };
        callback?.({ text: errorResult.text, action: "SELL_SHARES" });
        return errorResult;
      }

      // Sell shares
      const sharesToSell = (shares || position.shares) as number;
      runtime.logger.info(
        `Selling ${sharesToSell} shares from market ${marketId}`,
      );
      const result = await client.sellShares(marketId, sharesToSell);

      if (result.success) {
        const responseText = `✅ Position closed! Sold ${sharesToSell.toFixed(2)} shares. P&L: ${position.pnl >= 0 ? "+" : ""}$${position.pnl.toFixed(2)}`;

        callback?.({
          text: responseText,
          action: "SELL_SHARES",
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
        callback?.({ text: errorResult.text, action: "SELL_SHARES" });
        return errorResult;
      }
    } catch (error) {
      runtime.logger.error(
        `Error in sellSharesAction: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorResult: ActionResult = {
        success: false,
        text: `Error selling shares: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      callback?.({ text: errorResult.text, action: "SELL_SHARES" });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Sell my position on market 42",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Closing position on market 42...",
          action: "SELL_SHARES",
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
  name: "CHECK_WALLET",
  similes: ["CHECK_BALANCE", "WALLET_STATUS", "HOW_MUCH_MONEY", "MY_BALANCE"],
  description: "Check wallet balance and available funds",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) return false;

    const content = message.content.text?.toLowerCase() || "";
    const hasWalletIntent =
      content.includes("balance") ||
      content.includes("wallet") ||
      content.includes("how much") ||
      content.includes("funds");

    return hasWalletIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      const errorResult: ActionResult = {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
      callback?.({ text: errorResult.text, action: "CHECK_WALLET" });
      return errorResult;
    }

    const client = babylonService.getClient();

    try {
      // Extract display preferences from options
      const actionOptions = options as BabylonActionOptions | undefined;
      const actionState = state as BabylonActionState | undefined;
      const showDetailed = actionOptions?.detailed === true;
      const includeTradingContext = actionOptions?.includeTradingContext === true;

      // Check state for trading context
      const inTradingFlow = actionState?.inTradingFlow === true;
      const pendingTradeAmount = actionState?.pendingTradeAmount;

      // Extract any specific request from message (e.g., "detailed balance")
      const messageText = message.content.text?.toLowerCase() || "";
      const detailedRequest = messageText.includes("detail") || showDetailed;

      const wallet = await client.getWallet();

      if (!wallet) {
        const errorResult: ActionResult = {
          success: false,
          text: "Error fetching wallet information",
          error: "Wallet information unavailable",
        };
        callback?.({ text: errorResult.text, action: "CHECK_WALLET" });
        return errorResult;
      }

      // Build response with optional details
      let responseText = `💰 Wallet Status:\nTotal Balance: $${wallet.balance.toFixed(2)}\nAvailable: $${wallet.availableBalance.toFixed(2)}\nLocked in positions: $${wallet.lockedBalance.toFixed(2)}`;

      // Add detailed analysis if requested
      if (detailedRequest && wallet.balance > 0) {
        const utilizationRate = (
          (wallet.lockedBalance / wallet.balance) *
          100
        ).toFixed(1);
        responseText += `\n\nDetailed Analysis:\n- Capital Utilization: ${utilizationRate}%\n- Available for Trading: ${((wallet.availableBalance / wallet.balance) * 100).toFixed(1)}%`;
      }

      // Add trading context if in trading flow
      if ((inTradingFlow || includeTradingContext) && pendingTradeAmount) {
        const canAfford = wallet.availableBalance >= pendingTradeAmount;
        const remainingAfterTrade =
          wallet.availableBalance - pendingTradeAmount;

        responseText += `\n\n🔄 Trading Context:\n- Pending Trade: $${pendingTradeAmount.toFixed(2)}`;
        responseText += canAfford
          ? `\n- Status: ✅ Sufficient funds\n- Remaining after trade: $${remainingAfterTrade.toFixed(2)}`
          : `\n- Status: ❌ Insufficient funds (need $${(pendingTradeAmount - wallet.availableBalance).toFixed(2)} more)`;
      }

      callback?.({
        text: responseText,
        action: "CHECK_WALLET",
        data: wallet,
      });

      return {
        success: true,
        text: responseText,
        data: wallet,
      };
    } catch (error) {
      runtime.logger.error(
        `Error in checkWalletAction: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorResult: ActionResult = {
        success: false,
        text: `Error checking wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
      callback?.({ text: errorResult.text, action: "CHECK_WALLET" });
      return errorResult;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "How much money do I have?",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Checking wallet...",
          action: "CHECK_WALLET",
        },
      },
    ],
  ],
};

/**
 * Like Post Action
 * Allows agents to like posts naturally
 */
export const likePostAction: Action = {
  name: "LIKE_POST",
  similes: ["LIKE", "FAVORITE", "REACT"],
  description: "Like a post on the feed",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) {
      runtime.logger.error("Babylon service not configured");
      return false;
    }

    // Extract like intent from message
    const content = message.content.text?.toLowerCase() || "";
    const hasLikeIntent =
      content.includes("like") ||
      content.includes("favorite") ||
      content.includes("react") ||
      content.includes("heart") ||
      content.includes("👍") ||
      content.includes("❤️");

    return hasLikeIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      return {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
    }

    const client = babylonService.getClient();
    
    // Try to extract postId from options, state, or message content
    let postId = (options?.postId || state?.postId) as string;
    
    // If not found, try to extract from message content (e.g., "like post post-123")
    if (!postId && message.content.text) {
      const content = message.content.text;
      // Look for post ID patterns in the message
      const postIdMatch = content.match(/post[_-]?[\w-]+/i) || content.match(/[\w-]+(?:-\d+){2,}/);
      if (postIdMatch) {
        postId = postIdMatch[0];
      }
    }

    if (!postId) {
      runtime.logger.error("Like post action: Post ID not found in options, state, or message content");
      return {
        success: false,
        text: "Error: Post ID is required. Please specify which post to like.",
        error: "Post ID is required",
      };
    }

    try {
      const result = await client.likePost(postId);
      
      if (result.success) {
        const responseText = `✅ Liked post ${postId}`;
        callback?.({
          text: responseText,
          action: "LIKE_POST",
        });
        return {
          success: true,
          text: responseText,
        };
      } else {
        return {
          success: false,
          text: `Failed to like post: ${result.error || "Unknown error"}`,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      runtime.logger.error(`Error in likePostAction: ${errorMessage}`);
      return {
        success: false,
        text: `Error liking post: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

/**
 * Create Post Action
 * Allows agents to create original posts
 */
export const createPostAction: Action = {
  name: "CREATE_POST",
  similes: ["POST", "PUBLISH", "SHARE_THOUGHT"],
  description: "Create a new post on the feed",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) {
      runtime.logger.error("Babylon service not configured");
      return false;
    }

    // Extract post intent from message
    const content = message.content.text?.toLowerCase() || "";
    const hasPostIntent =
      content.includes("post") ||
      content.includes("publish") ||
      content.includes("share") ||
      content.includes("tweet") ||
      content.length > 10; // Any substantial message could be a post

    return hasPostIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      return {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
    }

    const client = babylonService.getClient();
    const content = (options?.content || state?.postContent || message.content.text) as string;

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        text: "Error: Post content is required",
        error: "Post content is required",
      };
    }

    try {
      const result = await client.createPost(content);
      
      if (result.success) {
        const responseText = `✅ Created post: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`;
        callback?.({
          text: responseText,
          action: "CREATE_POST",
        });
        return {
          success: true,
          text: responseText,
        };
      } else {
        return {
          success: false,
          text: `Failed to create post: ${result.error || "Unknown error"}`,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      runtime.logger.error(`Error in createPostAction: ${errorMessage}`);
      return {
        success: false,
        text: `Error creating post: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

/**
 * Follow User Action
 * Allows agents to follow interesting users
 */
export const followUserAction: Action = {
  name: "FOLLOW_USER",
  similes: ["FOLLOW", "SUBSCRIBE"],
  description: "Follow a user or actor",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) {
      runtime.logger.error("Babylon service not configured");
      return false;
    }

    // Extract follow intent from message
    const content = message.content.text?.toLowerCase() || "";
    const hasFollowIntent =
      content.includes("follow") ||
      content.includes("subscribe") ||
      content.includes("@") || // User mention
      content.match(/follow\s+\w+/i) !== null; // "follow username" pattern

    return hasFollowIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      return {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
    }

    const client = babylonService.getClient();
    
    // Try to extract userId from options, state, or message content
    let userId = (options?.userId || state?.userId) as string;
    
    // If not found, try to extract from message content (e.g., "follow @username" or "follow user-123")
    if (!userId && message.content.text) {
      const content = message.content.text;
      // Look for @mentions or user ID patterns
      const mentionMatch = content.match(/@(\w+)/i);
      const userIdMatch = content.match(/(?:user|actor)[_-]?[\w-]+/i) || content.match(/[\w-]+(?:-\d+){1,}/);
      
      if (mentionMatch) {
        // @mention found - would need to resolve username to userId (handled by options/state typically)
        runtime.logger.debug(`Found mention in follow message: ${mentionMatch[1]}`);
      } else if (userIdMatch) {
        userId = userIdMatch[0];
      }
    }

    if (!userId) {
      runtime.logger.error("Follow user action: User ID not found in options, state, or message content");
      return {
        success: false,
        text: "Error: User ID is required. Please specify which user to follow.",
        error: "User ID is required",
      };
    }

    try {
      const result = await client.followUser(userId);
      
      if (result.success) {
        const responseText = `✅ Started following user ${userId}`;
        callback?.({
          text: responseText,
          action: "FOLLOW_USER",
        });
        return {
          success: true,
          text: responseText,
        };
      } else {
        return {
          success: false,
          text: `Failed to follow user: ${result.error || "Unknown error"}`,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      runtime.logger.error(`Error in followUserAction: ${errorMessage}`);
      return {
        success: false,
        text: `Error following user: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

/**
 * Comment on Post Action
 * Allows agents to comment on posts
 */
export const commentOnPostAction: Action = {
  name: "COMMENT_ON_POST",
  similes: ["COMMENT", "REPLY", "RESPOND"],
  description: "Comment on a post",
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    // Check if agent has Babylon service configured
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );
    if (!babylonService) {
      runtime.logger.error("Babylon service not configured");
      return false;
    }

    // Extract comment intent from message
    const content = message.content.text?.toLowerCase() || "";
    const hasCommentIntent =
      content.includes("comment") ||
      content.includes("reply") ||
      content.includes("respond") ||
      content.includes("answer") ||
      (content.length > 10 && !content.match(/^(buy|sell|follow|like|post)/i)); // Substantial message that's not another action

    return hasCommentIntent;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const babylonService = runtime.getService<BabylonClientService>(
      BabylonClientService.serviceType,
    );

    if (!babylonService) {
      return {
        success: false,
        text: "Error: Babylon service not configured",
        error: "Babylon service not configured",
      };
    }

    const client = babylonService.getClient();
    
    // Try to extract postId from options, state, or message content
    let postId = (options?.postId || state?.postId) as string;
    
    // If not found, try to extract from message content (e.g., "comment on post-123")
    if (!postId && message.content.text) {
      const content = message.content.text;
      // Look for post ID patterns in the message
      const postIdMatch = content.match(/post[_-]?[\w-]+/i) || content.match(/[\w-]+(?:-\d+){2,}/);
      if (postIdMatch) {
        postId = postIdMatch[0];
      }
    }
    
    // Extract comment content from options, state, or message
    const content = (options?.content || state?.commentContent || message.content.text) as string;

    if (!postId) {
      runtime.logger.error("Comment on post action: Post ID not found in options, state, or message content");
      return {
        success: false,
        text: "Error: Post ID is required. Please specify which post to comment on.",
        error: "Post ID is required",
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        text: "Error: Comment content is required",
        error: "Comment content is required",
      };
    }

    try {
      const result = await client.commentOnPost(postId, content);
      
      if (result.success) {
        const responseText = `✅ Commented on post ${postId}`;
        callback?.({
          text: responseText,
          action: "COMMENT_ON_POST",
        });
        return {
          success: true,
          text: responseText,
        };
      } else {
        return {
          success: false,
          text: `Failed to comment: ${result.error || "Unknown error"}`,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      runtime.logger.error(`Error in commentOnPostAction: ${errorMessage}`);
      return {
        success: false,
        text: `Error commenting: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

// Export all actions
export const babylonGameActions: Action[] = [
  buySharesAction,
  sellSharesAction,
  checkWalletAction,
  likePostAction,
  createPostAction,
  followUserAction,
  commentOnPostAction,
];

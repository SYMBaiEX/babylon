/**
 * Babylon Game API Client
 *
 * Client for interacting with Babylon prediction market API
 * Supports both manual auth tokens and automatic agent authentication
 */

import type {
  BabylonMarket,
  BabylonMarketHistory,
  BabylonPosition,
  BabylonWallet,
  TradeRequest,
  TradeResult,
  AgentConfig,
  Chat,
} from "./types";
import { AgentAuthService } from "./agent-auth-service";
import { logger } from "@elizaos/core";

// Type for HTTP headers
type HeadersInit = Record<string, string>;

export class BabylonApiClient {
  private config: AgentConfig;
  private baseUrl: string;
  private authToken?: string;
  private agentAuthService: AgentAuthService | null = null;
  private useAgentAuth: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.baseUrl = config.apiBaseUrl || "http://localhost:3000";
    this.authToken = config.authToken;

    // Enable automatic agent authentication if no manual token provided
    if (!this.authToken) {
      this.agentAuthService = new AgentAuthService(this.baseUrl);
      this.useAgentAuth = this.agentAuthService.hasCredentials();

      if (this.useAgentAuth) {
        logger.info("🤖 Agent authentication enabled");
      }
    }
  }

  /**
   * Set authentication token (from Privy or other auth provider)
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    this.useAgentAuth = false; // Disable auto-auth when manual token is set
  }

  /**
   * Get authentication headers
   */
  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Use manual token if available
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
      return headers;
    }

    // Try automatic agent authentication
    if (this.useAgentAuth && this.agentAuthService) {
      const sessionToken = await this.agentAuthService.getSessionToken();
      if (sessionToken) {
        headers["Authorization"] = `Bearer ${sessionToken}`;
      }
    }

    return headers;
  }

  /**
   * Fetch active markets
   */
  async getActiveMarkets(): Promise<BabylonMarket[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/markets/predictions`, {
        headers: await this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch markets: ${response.statusText}`);
      }

      const data = (await response.json()) as { markets?: BabylonMarket[] };
      return data.markets || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error fetching active markets:", errorMessage);
      return [];
    }
  }

  /**
   * Get specific market by ID
   */
  async getMarket(marketId: string): Promise<BabylonMarket | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/markets/predictions/${marketId}`,
        {
          headers: await this.getHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch market: ${response.statusText}`);
      }

      return (await response.json()) as BabylonMarket;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching market ${marketId}:`, errorMessage);
      return null;
    }
  }

  /**
   * Get user's wallet balance
   */
  async getWallet(): Promise<BabylonWallet | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/wallet/balance`, {
        headers: await this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wallet: ${response.statusText}`);
      }

      return (await response.json()) as BabylonWallet;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error fetching wallet:", errorMessage);
      return null;
    }
  }

  /**
   * Get user's positions
   */
  async getPositions(): Promise<BabylonPosition[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/positions`, {
        headers: await this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.statusText}`);
      }

      const data = (await response.json()) as { positions?: BabylonPosition[] };
      return data.positions || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error fetching positions:", errorMessage);
      return [];
    }
  }

  /**
   * Place a trade (buy shares)
   */
  async buyShares(request: TradeRequest): Promise<TradeResult> {
    try {
      // Validate request
      if (request.amount < 1) {
        return {
          success: false,
          error: "Minimum trade size is $1",
        };
      }

      if (!["yes", "no"].includes(request.side)) {
        return {
          success: false,
          error: 'Side must be "yes" or "no"',
        };
      }

      // Check wallet balance
      const wallet = await this.getWallet();
      if (!wallet || wallet.availableBalance < request.amount) {
        return {
          success: false,
          error: "Insufficient balance",
        };
      }

      // Check trading limits
      if (request.amount > this.config.tradingLimits.maxTradeSize) {
        return {
          success: false,
          error: `Trade size exceeds limit of $${this.config.tradingLimits.maxTradeSize}`,
        };
      }

      // Execute trade
      const response = await fetch(
        `${this.baseUrl}/api/markets/predictions/${request.marketId}/buy`,
        {
          method: "POST",
          headers: await this.getHeaders(),
          body: JSON.stringify({
            side: request.side,
            amount: request.amount,
          }),
        },
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        return {
          success: false,
          error: error.message || response.statusText,
        };
      }

      const result = (await response.json()) as {
        shares?: number;
        avgPrice?: number;
        position?: BabylonPosition;
      };

      return {
        success: true,
        shares: result.shares,
        avgPrice: result.avgPrice,
        newPosition: result.position,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error buying shares:", errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Sell shares (close position)
   */
  async sellShares(marketId: string, shares: number): Promise<TradeResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/markets/predictions/${marketId}/sell`,
        {
          method: "POST",
          headers: await this.getHeaders(),
          body: JSON.stringify({
            shares,
          }),
        },
      );

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        return {
          success: false,
          error: error.message || response.statusText,
        };
      }

      const result = (await response.json()) as {
        shares?: number;
        avgPrice?: number;
      };

      return {
        success: true,
        shares: result.shares,
        avgPrice: result.avgPrice,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error selling shares:", errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get market history and price data
   */
  async getMarketHistory(
    marketId: string,
  ): Promise<BabylonMarketHistory | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/markets/predictions/${marketId}/history`,
        {
          headers: await this.getHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch market history: ${response.statusText}`,
        );
      }

      return (await response.json()) as BabylonMarketHistory;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching market history for ${marketId}:`, errorMessage);
      return null;
    }
  }

  async getChats(): Promise<Chat[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chats`, {
        headers: await this.getHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch chats: ${response.statusText}`);
      }
      const data = await response.json();
      return data.chats || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Error fetching chats:", errorMessage);
      return [];
    }
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chats/${chatId}/message`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to send message: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error sending message to chat ${chatId}:`, errorMessage);
    }
  }
}

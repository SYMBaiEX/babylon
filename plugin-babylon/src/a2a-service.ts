/**
 * A2A Service for ElizaOS Plugin
 *
 * Integrates A2A WebSocket protocol for real-time agent-to-agent communication
 * Enables market data subscriptions, agent discovery, and coalition formation
 */

import { Service } from "@elizaos/core";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { A2AClient } from "../../src/a2a/client/a2a-client";
import { A2AEventType } from "../../src/a2a/types";
import type {
  A2AClientConfig,
  AgentCapabilities,
  MarketData,
  AgentProfile,
  MarketAnalysis,
} from "../../src/a2a/types";
import type { JsonValue } from "../../src/types/common";
import { logger } from "@elizaos/core";

interface A2AServiceConfig {
  endpoint?: string; // A2A WebSocket server URL (e.g., ws://localhost:8080)
  enabled?: boolean; // Enable A2A integration (default: true if endpoint provided)
  autoReconnect?: boolean;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}

export class BabylonA2AService extends Service {
  static override serviceType = "babylon-a2a" as const;
  private client: A2AClient | null = null;
  private a2aConfig: A2AServiceConfig;
  private connected = false;
  private agentWalletAddress: string | null = null;
  private agentTokenId: number | null = null;
  private agentPrivateKey: string | null = null;

  constructor(config: A2AServiceConfig = {}) {
    super();
    this.a2aConfig = {
      enabled: !!config.endpoint,
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // Check if A2A is enabled
    if (!this.a2aConfig.enabled || !this.a2aConfig.endpoint) {
      logger.info("A2A integration disabled or endpoint not configured");
      return;
    }

    // Get agent credentials from runtime or environment
    await this.loadAgentCredentials();

    if (!this.agentWalletAddress || !this.agentPrivateKey) {
      logger.warn(
        "Agent credentials not available for A2A - A2A integration disabled",
      );
      return;
    }

    // Initialize A2A client
    await this.connect();
  }

  /**
   * Load agent credentials from runtime or environment
   */
  private async loadAgentCredentials(): Promise<void> {
    // Try to get from runtime state or agent auth service
    // For now, we'll use environment variables or generate deterministically
    const agentId =
      this.runtime?.agentId || process.env.BABYLON_AGENT_ID || "default";

    logger.info(`Loading A2A credentials for agent: ${agentId}`);

    // Get wallet address and private key from agent auth or generate
    // This should match the wallet used for on-chain registration
    this.agentWalletAddress = process.env.BABYLON_AGENT_WALLET_ADDRESS || null;
    this.agentPrivateKey = process.env.BABYLON_AGENT_PRIVATE_KEY || null;

    // Get token ID from database or registration
    const tokenIdStr = process.env.BABYLON_AGENT_TOKEN_ID;
    this.agentTokenId = tokenIdStr ? parseInt(tokenIdStr, 10) : null;

    if (!this.agentWalletAddress || !this.agentPrivateKey) {
      logger.warn(
        `A2A credentials not found for agent ${agentId} - using REST API fallback`,
      );
    } else {
      logger.info(
        `A2A credentials loaded for agent ${agentId} - wallet: ${this.agentWalletAddress?.slice(0, 10)}...`,
      );
    }
  }

  /**
   * Connect to A2A server
   */
  async connect(): Promise<void> {
    if (!this.a2aConfig.enabled || !this.a2aConfig.endpoint) {
      return;
    }

    if (!this.agentWalletAddress || !this.agentPrivateKey) {
      logger.warn("Cannot connect to A2A: missing credentials");
      return;
    }

    try {
      // Define agent capabilities
      const capabilities: AgentCapabilities = {
        strategies: ["momentum", "sentiment", "volume"], // Can be customized per agent
        markets: ["prediction"],
        actions: ["analyze", "trade", "coordinate"],
        version: "1.0.0",
      };

      const clientConfig: A2AClientConfig = {
        endpoint: this.a2aConfig.endpoint,
        credentials: {
          address: this.agentWalletAddress,
          privateKey: this.agentPrivateKey,
          tokenId: this.agentTokenId || 0,
        },
        capabilities,
        autoReconnect: this.a2aConfig.autoReconnect,
        reconnectInterval: this.a2aConfig.reconnectInterval,
        heartbeatInterval: this.a2aConfig.heartbeatInterval,
      };

      this.client = new A2AClient(clientConfig);

      // Set up event handlers
      this.setupEventHandlers();

      // Connect
      await this.client.connect();
      this.connected = true;

      logger.info(`✅ Connected to A2A server: ${this.a2aConfig.endpoint}`);
    } catch (error) {
      logger.error(`Failed to connect to A2A server: ${error}`);
      this.connected = false;
    }
  }

  /**
   * Set up A2A event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Connection events
    this.client.on(A2AEventType.AGENT_CONNECTED, (data) => {
      logger.info(`Agent connected to A2A: ${data.agentId}`);
      this.connected = true;
    });

    this.client.on(A2AEventType.AGENT_DISCONNECTED, () => {
      logger.warn("Disconnected from A2A server");
      this.connected = false;
    });

    // Market update events - integrate with runtime providers
    this.client.on(
      "market_update",
      (data: { marketId: string; prices?: number[]; volume?: string }) => {
        logger.info(`📊 Market update received: ${data.marketId}`);
        
        // Store latest market update for provider access
        if (this.runtime) {
          // Emit runtime event for provider/action consumption
          this.runtime.emitEvent?.("a2a.marketUpdate", {
            marketId: data.marketId,
            prices: data.prices,
            volume: data.volume,
            timestamp: Date.now(),
          });
          
          // Update runtime cache for fast provider access
          const cacheKey = `a2a.market.${data.marketId}`;
          this.runtime.setCache?.(cacheKey, {
            marketId: data.marketId,
            prices: data.prices,
            volume: data.volume,
            timestamp: Date.now(),
          });
        }
      },
    );

    // Coalition events - integrate with runtime
    this.client.on("coalition_created", (data: { coalitionId: string; [key: string]: unknown }) => {
      logger.info(`🤝 Coalition created: ${data.coalitionId}`);
      
      if (this.runtime) {
        // Emit coalition event for agent awareness
        const { coalitionId, ...restData } = data;
        this.runtime.emitEvent?.("a2a.coalitionCreated", {
          coalitionId,
          ...restData,
          timestamp: Date.now(),
        });
      }
    });

    this.client.on("coalition_message", (data: { coalitionId: string; message?: string; [key: string]: unknown }) => {
      logger.info(`💬 Coalition message received: ${data.coalitionId}`);
      
      if (this.runtime) {
        // Emit coalition message event
        const { coalitionId, message, ...restData } = data;
        this.runtime.emitEvent?.("a2a.coalitionMessage", {
          coalitionId,
          message,
          ...restData,
          timestamp: Date.now(),
        });
        
        // Create memory of coalition interaction for agent context
        if (message && this.runtime.createMemory && this.runtime.createRunId) {
          const memoryId = this.runtime.createRunId();
          const roomId = this.runtime.agentId;
          const memory: Memory = {
            id: memoryId,
            agentId: this.runtime.agentId,
            entityId: this.runtime.agentId,
            roomId,
            content: {
              text: `Coalition ${coalitionId}: ${message}`,
              source: "a2a",
            },
            createdAt: Date.now(),
          };
          this.runtime.createMemory(memory, roomId).catch((error) => {
            logger.warn(`Failed to create coalition message memory: ${error}`);
          });
        }
      }
    });

    // Error handling
    this.client.on("error", (error) => {
      logger.error(`A2A client error: ${error}`);
    });
  }

  /**
   * Get market data via A2A (preferred) or fallback to REST
   */
  async getMarketData(marketId: string): Promise<MarketData | null> {
    if (this.connected && this.client) {
      try {
        return await this.client.getMarketData(marketId);
      } catch (error) {
        logger.warn(
          `A2A market data fetch failed, falling back to REST: ${error}`,
        );
      }
    }
    return null;
  }

  /**
   * Subscribe to market updates
   */
  async subscribeMarket(marketId: string): Promise<boolean> {
    if (this.connected && this.client) {
      try {
        await this.client.subscribeMarket(marketId);
        logger.info(`Subscribed to market updates: ${marketId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to subscribe to market: ${error}`);
      }
    }
    return false;
  }

  /**
   * Discover other agents
   */
  async discoverAgents(filters?: {
    strategies?: string[];
    minReputation?: number;
    markets?: string[];
  }): Promise<{ agents: AgentProfile[]; total: number }> {
    if (this.connected && this.client) {
      try {
        return await this.client.discoverAgents(filters);
      } catch (error) {
        logger.error(`Failed to discover agents: ${error}`);
      }
    }
    return { agents: [], total: 0 };
  }

  /**
   * Share market analysis with other agents
   */
  async shareAnalysis(analysis: {
    marketId: string;
    analyst: string;
    prediction: number;
    confidence: number;
    reasoning: string;
    dataPoints?: Record<string, unknown>;
    timestamp: number;
  }): Promise<boolean> {
    if (this.connected && this.client) {
      try {
        // Ensure dataPoints is always defined for the client
        const analysisWithData: MarketAnalysis = {
          ...analysis,
          dataPoints: (analysis.dataPoints || {}) as Record<string, JsonValue>,
        };
        await this.client.shareAnalysis(analysisWithData);
        logger.info(`Shared analysis for market: ${analysis.marketId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to share analysis: ${error}`);
      }
    }
    return false;
  }

  /**
   * Check if A2A is connected
   */
  isConnected(): boolean {
    return this.connected && (this.client?.isConnected() || false);
  }

  /**
   * Get A2A client instance
   */
  getClient(): A2AClient | null {
    return this.client;
  }

  /**
   * Disconnect from A2A server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.connected = false;
      logger.info("Disconnected from A2A server");
    }
  }

  /**
   * Stop the service (required by Service interface)
   */
  override async stop(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Capability description (required by Service interface)
   */
  override get capabilityDescription(): string {
    return "Agent-to-Agent (A2A) communication service for real-time market data, agent discovery, and coalition formation";
  }
}

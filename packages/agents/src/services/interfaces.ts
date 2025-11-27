/**
 * Service Interfaces for @babylon/agents
 *
 * These interfaces define the contracts for services that can be injected
 * from the application layer. This allows the agents package to be
 * decoupled from the specific implementations in apps/web.
 */

import type { JsonValue } from '../types/common';
import type {
  AgentCapabilities,
  UnifiedAgentRegistration,
  AgentType,
  AgentStatus,
  TrustLevel,
  AgentDiscoveryFilter,
} from '../types/agent-registry';

/**
 * Agent Registry Service Interface
 */
export interface IAgentRegistry {
  /**
   * Register a new agent
   */
  register(params: {
    agentId: string;
    type: AgentType;
    userId?: string | null;
    name: string;
    systemPrompt: string;
    capabilities: AgentCapabilities;
  }): Promise<UnifiedAgentRegistration>;

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Promise<UnifiedAgentRegistration | null>;

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: AgentStatus): Promise<void>;

  /**
   * Update agent trust level
   */
  updateTrustLevel(agentId: string, trustLevel: TrustLevel): Promise<void>;

  /**
   * Discover agents matching filter
   */
  discover(filter: AgentDiscoveryFilter): Promise<UnifiedAgentRegistration[]>;

  /**
   * Check if agent exists
   */
  exists(agentId: string): Promise<boolean>;
}

/**
 * Wallet Service Interface
 */
export interface IWalletService {
  /**
   * Get user balance
   */
  getBalance(userId: string): Promise<number>;

  /**
   * Transfer points between users
   */
  transferPoints(
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Promise<void>;

  /**
   * Add points to user
   */
  addPoints(userId: string, amount: number, reason?: string): Promise<void>;

  /**
   * Deduct points from user
   */
  deductPoints(userId: string, amount: number, reason?: string): Promise<void>;
}

/**
 * Character Mapping Service Interface
 */
export interface ICharacterMappingService {
  /**
   * Get character mapping for an actor
   */
  getCharacterForActor(actorId: string): Promise<{
    name: string;
    systemPrompt: string;
    traits: string[];
  } | null>;

  /**
   * Update character mapping
   */
  updateCharacterMapping(
    actorId: string,
    character: {
      name: string;
      systemPrompt: string;
      traits: string[];
    }
  ): Promise<void>;
}

/**
 * Trajectory Recorder Interface
 */
export interface ITrajectoryRecorder {
  /**
   * Record a trajectory step
   */
  recordStep(params: {
    agentId: string;
    gameId: string;
    stepType: string;
    input: JsonValue;
    output: JsonValue;
    reward?: number;
    metadata?: Record<string, JsonValue>;
  }): Promise<string>;

  /**
   * Complete a trajectory
   */
  completeTrajectory(
    trajectoryId: string,
    outcome: {
      success: boolean;
      totalReward: number;
      metadata?: Record<string, JsonValue>;
    }
  ): Promise<void>;
}

/**
 * Perp Trade Service Interface
 */
export interface IPerpTradeService {
  /**
   * Open a perpetual position
   */
  openPosition(params: {
    userId: string;
    ticker: string;
    side: 'long' | 'short';
    size: number;
    leverage: number;
  }): Promise<{
    positionId: string;
    entryPrice: number;
  }>;

  /**
   * Close a perpetual position
   */
  closePosition(params: {
    userId: string;
    positionId: string;
  }): Promise<{
    pnl: number;
    exitPrice: number;
  }>;

  /**
   * Get open positions for user
   */
  getPositions(userId: string): Promise<
    Array<{
      id: string;
      ticker: string;
      side: 'long' | 'short';
      size: number;
      entryPrice: number;
      currentPrice: number;
      unrealizedPnL: number;
    }>
  >;
}

/**
 * Prediction Pricing Interface
 */
export interface IPredictionPricing {
  /**
   * Calculate price for shares
   */
  calculatePrice(params: {
    marketId: string;
    side: 'YES' | 'NO';
    shares: number;
  }): Promise<{
    price: number;
    priceImpact: number;
  }>;

  /**
   * Get current market prices
   */
  getMarketPrices(marketId: string): Promise<{
    yesPrice: number;
    noPrice: number;
  }>;
}

/**
 * Agent0 Client Interface
 */
export interface IAgent0Client {
  /**
   * Register agent with Agent0
   */
  registerAgent(params: {
    name: string;
    description: string;
    endpoint: string;
    capabilities: AgentCapabilities;
  }): Promise<{
    tokenId: string;
    metadataCID: string;
  }>;

  /**
   * Get agent info from Agent0
   */
  getAgentInfo(tokenId: string): Promise<{
    name: string;
    description: string;
    endpoint: string;
    reputation: number;
  } | null>;

  /**
   * Sync reputation with Agent0
   */
  syncReputation(agentId: string): Promise<number>;
}

/**
 * Database Context Interface
 * For running queries as a specific user
 */
export interface IDbContext {
  /**
   * Execute a function with user context
   */
  asUser<T>(userId: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Redis Client Interface
 * For caching and session management
 */
export interface IRedisClient {
  /**
   * Get a value by key
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value with optional expiration
   */
  set(key: string, value: string, options?: { ex?: number }): Promise<void>;

  /**
   * Delete a key
   */
  del(key: string): Promise<void>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set expiration on key
   */
  expire(key: string, seconds: number): Promise<void>;

  /**
   * Get time to live for key
   */
  ttl(key: string): Promise<number>;
}

/**
 * Service Container for dependency injection
 */
export interface IServiceContainer {
  agentRegistry?: IAgentRegistry;
  walletService?: IWalletService;
  characterMappingService?: ICharacterMappingService;
  trajectoryRecorder?: ITrajectoryRecorder;
  perpTradeService?: IPerpTradeService;
  predictionPricing?: IPredictionPricing;
  agent0Client?: IAgent0Client;
  dbContext?: IDbContext;
  redisClient?: IRedisClient;
}

/**
 * Global service container instance
 */
let serviceContainer: IServiceContainer = {};

/**
 * Set the service container
 */
export function setServiceContainer(container: IServiceContainer): void {
  serviceContainer = { ...serviceContainer, ...container };
}

/**
 * Get the service container
 */
export function getServiceContainer(): IServiceContainer {
  return serviceContainer;
}

/**
 * Get a specific service with type safety
 */
export function getService<K extends keyof IServiceContainer>(
  key: K
): IServiceContainer[K] {
  return serviceContainer[key];
}


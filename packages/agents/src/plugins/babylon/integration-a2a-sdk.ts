/**
 * Babylon Plugin Integration Service - A2A SDK
 *
 * Babylon A2A client implementation using @a2a-js/sdk
 *
 * Architecture optimized for 300k+ users:
 * - Singleton A2A base client (agent card is shared across all agents)
 * - Agent identity caching with Redis/memory fallback
 * - Lazy header injection per-request (not per-client initialization)
 */

import type { AgentCard } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { db } from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import type { AgentRuntime, Plugin } from '@elizaos/core';
import { agentWalletService } from '../../identity/AgentWalletService';
import { logger } from '../../shared/logger';
import type { JsonValue } from '../../types/common';

type BabylonRuntime = AgentRuntime & { a2aClient?: BabylonA2AClient };

// =============================================================================
// Agent Identity Cache - Redis/Memory fallback for 300k+ users
// =============================================================================

/**
 * Cached agent identity for ERC-8004 headers
 * TTL: 5 minutes (agents rarely change identity)
 */
interface CachedAgentIdentity {
  agentUserId: string;
  walletAddress: string | null;
  agent0TokenId: number | null;
  displayName: string | null;
  cachedAt: number;
}

/**
 * In-memory LRU cache for agent identities
 * Max 10,000 entries with 5-minute TTL
 */
const AGENT_IDENTITY_CACHE = new Map<string, CachedAgentIdentity>();
const AGENT_IDENTITY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const AGENT_IDENTITY_MAX_SIZE = 10000;

/**
 * Get agent identity from cache or database
 * Optimized for high concurrency with lazy refresh
 * Supports both USER_CONTROLLED agents (User table) and NPCs (StaticDataRegistry)
 */
async function getCachedAgentIdentity(
  agentUserId: string
): Promise<CachedAgentIdentity | null> {
  const now = Date.now();
  const cached = AGENT_IDENTITY_CACHE.get(agentUserId);

  // Return cached if valid
  if (cached && now - cached.cachedAt < AGENT_IDENTITY_TTL_MS) {
    return cached;
  }

  // First try User table (USER_CONTROLLED agents)
  const user = await db.user.findUnique({
    where: { id: agentUserId },
    select: {
      id: true,
      isAgent: true,
      walletAddress: true,
      agent0TokenId: true,
      displayName: true,
    },
  });

  if (user && user.isAgent) {
    const identity: CachedAgentIdentity = {
      agentUserId,
      walletAddress: user.walletAddress,
      agent0TokenId: user.agent0TokenId,
      displayName: user.displayName,
      cachedAt: now,
    };

    cacheIdentity(agentUserId, identity);
    return identity;
  }

  // Fall back to static actor data (NPC agents)
  // Actor data is now stored in TypeScript files via StaticDataRegistry
  const actor = StaticDataRegistry.getActor(agentUserId);
  if (actor) {
    // NPCs don't have wallets or tokens - create minimal identity
    const identity: CachedAgentIdentity = {
      agentUserId,
      walletAddress: null,
      agent0TokenId: null,
      displayName: actor.name,
      cachedAt: now,
    };

    cacheIdentity(agentUserId, identity);
    return identity;
  }

  return null;
}

/**
 * Helper to cache identity with LRU eviction
 */
function cacheIdentity(
  agentUserId: string,
  identity: CachedAgentIdentity
): void {
  // LRU eviction if at capacity
  if (AGENT_IDENTITY_CACHE.size >= AGENT_IDENTITY_MAX_SIZE) {
    const oldestKey = AGENT_IDENTITY_CACHE.keys().next().value;
    if (oldestKey) {
      AGENT_IDENTITY_CACHE.delete(oldestKey);
    }
  }

  AGENT_IDENTITY_CACHE.set(agentUserId, identity);
}

/**
 * Invalidate agent identity cache (call after wallet provisioning)
 */
function invalidateAgentIdentityCache(agentUserId: string): void {
  AGENT_IDENTITY_CACHE.delete(agentUserId);
}

// =============================================================================
// Agent Card Cache - Fetched once, reused for all agents
// =============================================================================

/**
 * Cached agent card to avoid repeated HTTP fetches
 * The agent card is the same for all agents
 */
interface CachedAgentCard {
  agentCard: AgentCard;
  baseUrl: string;
  fetchedAt: number;
}

let cachedAgentCard: CachedAgentCard | null = null;
let agentCardFetchPromise: Promise<CachedAgentCard | null> | null = null;
const AGENT_CARD_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get or fetch the agent card JSON (singleton with TTL)
 */
async function getCachedAgentCard(): Promise<CachedAgentCard | null> {
  const now = Date.now();

  // Return cached if valid
  if (cachedAgentCard && now - cachedAgentCard.fetchedAt < AGENT_CARD_TTL_MS) {
    return cachedAgentCard;
  }

  // Prevent multiple concurrent fetches
  if (agentCardFetchPromise) {
    return agentCardFetchPromise;
  }

  agentCardFetchPromise = fetchAgentCard();
  const card = await agentCardFetchPromise;
  agentCardFetchPromise = null;
  return card;
}

/**
 * Fetch the agent card JSON from the server
 */
async function fetchAgentCard(): Promise<CachedAgentCard | null> {
  const baseUrl =
    process.env.BABYLON_A2A_ENDPOINT ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  const agentCardUrl = `${baseUrl}/.well-known/agent-card.json`;

  try {
    logger.info(
      'Fetching agent card (cached for 30 minutes)',
      { agentCardUrl },
      'BabylonIntegration'
    );

    const response = await fetch(agentCardUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.status}`);
    }

    const agentCard = (await response.json()) as AgentCard;
    cachedAgentCard = {
      agentCard,
      baseUrl,
      fetchedAt: Date.now(),
    };

    logger.info(
      '✅ Agent card cached (used for all agents)',
      { agentCardUrl },
      'BabylonIntegration'
    );

    return cachedAgentCard;
  } catch (error) {
    logger.error(
      'Failed to fetch agent card',
      {
        agentCardUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      'BabylonIntegration'
    );
    return null;
  }
}

// =============================================================================
// Per-Agent Client Factory with Identity Headers
// =============================================================================

/**
 * Create authenticated fetch for an agent that injects ERC-8004 headers
 * Headers come from cached identity (refreshed every 5 minutes max)
 */
function createAuthenticatedFetchForAgent(
  identity: CachedAgentIdentity
): typeof fetch {
  const customFetch = async (
    url: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);

    // Always set agent ID for request correlation
    headers.set('x-agent-id', identity.agentUserId);

    // Add ERC-8004 identity headers if available (for Agent0 integration)
    if (identity.walletAddress) {
      headers.set('x-agent-address', identity.walletAddress);
    }
    if (identity.agent0TokenId !== null) {
      headers.set('x-agent-token-id', identity.agent0TokenId.toString());
    }

    // Add API key if configured
    const apiKey = process.env.BABYLON_A2A_API_KEY;
    if (apiKey) {
      headers.set('x-babylon-api-key', apiKey);
    }

    return fetch(url, { ...init, headers });
  };

  // Bun may expose a non-standard `fetch.preconnect`; preserve it when present.
  const maybePreconnect = (fetch as unknown as { preconnect?: unknown })
    .preconnect;
  if (maybePreconnect) {
    (customFetch as unknown as { preconnect?: unknown }).preconnect =
      maybePreconnect;
  }

  return customFetch as typeof fetch;
}

/**
 * Create A2A client for an agent using cached agent card
 * Each agent gets its own client with identity-specific headers
 *
 * OPTIMIZED: Uses constructor directly with cached AgentCard object
 * This avoids repeated HTTP requests to fetch the agent card for each agent
 */
async function createA2AClientForAgent(
  identity: CachedAgentIdentity
): Promise<A2AClient | null> {
  const card = await getCachedAgentCard();
  if (!card) {
    return null;
  }

  // Create client with custom fetch that injects this agent's identity headers
  const fetchImpl = createAuthenticatedFetchForAgent(identity);

  // Use constructor directly with cached AgentCard - avoids re-fetching!
  // The A2AClient constructor accepts AgentCard | string
  return new A2AClient(card.agentCard, { fetchImpl });
}

// =============================================================================
// Helper Functions
// =============================================================================

function shouldAutoProvisionWallets(): boolean {
  return process.env.AUTO_CREATE_AGENT_WALLETS !== 'false';
}

/**
 * Ensure agent has wallet provisioned (if auto-provisioning enabled)
 * Returns updated identity after provisioning
 */
async function ensureAgentWallet(
  agentUserId: string,
  identity: CachedAgentIdentity
): Promise<CachedAgentIdentity> {
  if (identity.walletAddress || !shouldAutoProvisionWallets()) {
    return identity;
  }

  try {
    const walletResult =
      await agentWalletService.createAgentEmbeddedWallet(agentUserId);

    logger.info(
      'Auto-provisioned embedded wallet for agent',
      {
        agentUserId,
        walletAddress: walletResult.walletAddress,
      },
      'BabylonIntegration'
    );

    // Invalidate cache and return updated identity
    invalidateAgentIdentityCache(agentUserId);
    return {
      ...identity,
      walletAddress: walletResult.walletAddress,
      cachedAt: Date.now(),
    };
  } catch (error) {
    // Use debug level for NPC wallet provisioning failures - these are expected
    // for NPCs that don't have user records. Only warn for actual user agents.
    logger.debug(
      'Wallet auto-provision skipped for agent',
      {
        agentUserId,
        reason: error instanceof Error ? error.message : String(error),
      },
      'BabylonIntegration'
    );
    return identity;
  }
}

/**
 * Initialize A2A SDK client for an agent
 *
 * OPTIMIZED FOR 300K+ USERS:
 * - Agent card fetched once and cached (30-minute TTL)
 * - Agent identity cached with 5-minute TTL
 * - Per-agent client with identity-specific headers
 */
async function initializeA2ASdkClient(
  agentUserId: string
): Promise<{ client: A2AClient; identity: CachedAgentIdentity } | null> {
  // Get cached agent identity (or fetch from DB)
  const identity = await getCachedAgentIdentity(agentUserId);

  if (!identity) {
    throw new Error(`Agent user ${agentUserId} not found or not an agent`);
  }

  // Auto-provision wallet if needed
  const updatedIdentity = await ensureAgentWallet(agentUserId, identity);

  // Log ERC-8004 identity status (only on first init, not on cache hit)
  const hasFullIdentity =
    updatedIdentity.walletAddress && updatedIdentity.agent0TokenId !== null;

  if (!hasFullIdentity) {
    logger.debug(
      'Agent missing ERC-8004 identity - A2A will work with limited auth headers',
      {
        agentUserId,
        hasWallet: !!updatedIdentity.walletAddress,
        hasTokenId: updatedIdentity.agent0TokenId !== null,
      },
      'BabylonIntegration'
    );
  }

  // Create A2A client with cached agent card and identity-specific headers
  const client = await createA2AClientForAgent(updatedIdentity);

  if (!client) {
    logger.warn(
      'A2A client creation failed - agent card not available',
      { agentUserId },
      'BabylonIntegration'
    );
    return null;
  }

  logger.debug('A2A client ready for agent', {
    agentUserId,
    agentName: updatedIdentity.displayName,
    hasErc8004Identity: hasFullIdentity,
  });

  return { client, identity: updatedIdentity };
}

/**
 * Babylon A2A Client - uses message/send with skills
 * Converts a2a.* method calls to A2A protocol
 *
 * OPTIMIZED FOR 300K+ USERS:
 * - Agent card cached (30-minute TTL) - one HTTP fetch for all agents
 * - Agent identity cached (5-minute TTL) - one DB query per 5 min per agent
 * - Per-agent client with identity-specific headers baked in at creation
 *
 * @remarks
 * ERC-8004 identity headers (x-agent-address, x-agent-token-id) are injected
 * via custom fetchImpl at client creation time. This enables Agent0 to verify
 * the agent's on-chain identity for authenticated operations.
 */
export class BabylonA2AClient {
  public readonly agentId: string;
  private sdkClient: A2AClient | null;

  constructor(
    sdkClient: A2AClient | null,
    agentId: string,
    _identity: CachedAgentIdentity // Used during creation for headers, stored for reference
  ) {
    this.sdkClient = sdkClient;
    this.agentId = agentId;
  }

  /**
   * Check if client is connected
   * Returns false if SDK client is null (A2A not available)
   */
  isConnected(): boolean {
    // Check if underlying SDK client exists
    // If sdkClient is null, A2A is not available
    return this.sdkClient !== null && this.sdkClient !== undefined;
  }

  /**
   * Execute via A2A protocol or direct executor
   * Uses direct executor on server-side to avoid Vercel serverless 503 errors
   * Falls back to A2A SDK for external/client-side calls
   */
  private async executeViaA2A(
    action: string,
    params: Record<string, JsonValue>
  ): Promise<JsonValue> {
    // Map camelCase actions to category.snake_case operation names
    const operationMap: Record<string, string> = {
      // Portfolio operations
      getBalance: 'portfolio.get_balance',
      getPositions: 'portfolio.get_positions',
      getUserWallet: 'portfolio.get_user_wallet',
      // Social operations
      createPost: 'social.create_post',
      getFeed: 'social.get_feed',
      likePost: 'social.like_post',
      // Stats operations
      getSystemStats: 'stats.system',
      getLeaderboard: 'stats.leaderboard',
      getTrendingTags: 'stats.trending_tags',
      getPostsByTag: 'stats.posts_by_tag',
      getOrganizations: 'stats.get_organizations',
      // Markets operations
      getPredictions: 'markets.list_prediction',
      getPerpetuals: 'markets.list_perpetuals',
      // Users operations
      searchUsers: 'users.search',
      getUserProfile: 'users.get_profile',
      // Messaging operations
      getChats: 'messaging.get_chats',
      getUnreadCount: 'messaging.get_unread_count',
      getNotifications: 'messaging.get_notifications',
    };

    const operationName = operationMap[action] || action;

    // On server-side (Next.js API routes), use direct executor to avoid HTTP self-call
    // This fixes Vercel serverless 503 errors
    const isServerSide = typeof window === 'undefined';
    if (isServerSide) {
      const { BabylonAgentExecutor } = await import('@babylon/a2a');
      return BabylonAgentExecutor.executeDirectly(
        operationName,
        params,
        this.agentId
      );
    }

    // Client-side or when SDK client is needed: use A2A protocol
    if (!this.sdkClient) {
      throw new Error('A2A client not available');
    }

    // Map action to skill ID for A2A protocol
    const skillMap: Record<string, string> = {
      getBalance: 'portfolio-balance',
      getPositions: 'portfolio-balance',
      getUserWallet: 'portfolio-balance',
      getPredictions: 'prediction-markets',
      getPerpetuals: 'perpetual-futures',
      getFeed: 'social-feed',
      createPost: 'social-feed',
      likePost: 'social-feed',
      getUserProfile: 'user-social-graph',
      searchUsers: 'user-social-graph',
      getLeaderboard: 'stats-discovery',
      getSystemStats: 'stats-discovery',
      getTrendingTags: 'stats-discovery',
      getOrganizations: 'stats-discovery',
      getChats: 'messaging-chats',
      getUnreadCount: 'messaging-chats',
      getNotifications: 'messaging-chats',
    };
    const skillId = skillMap[action] || 'portfolio-balance';

    const response = await this.sdkClient.sendMessage({
      message: {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [
          {
            kind: 'data',
            data: { operation: operationName, params },
            metadata: { skillId },
          },
        ],
      },
    });

    // Handle A2A response
    type DataPart = { kind: 'data'; data: JsonValue };
    const isDataPart = (part: { kind: string }): part is DataPart =>
      part.kind === 'data' && 'data' in part;

    if ('result' in response && response.result) {
      const result = response.result;
      if (typeof result === 'object' && result !== null && 'kind' in result) {
        if (result.kind === 'message') {
          const msg = result as { parts: Array<{ kind: string }> };
          const dataPart = msg.parts.find((p) => isDataPart(p));
          return dataPart && isDataPart(dataPart) ? dataPart.data : {};
        }
        if (result.kind === 'task') {
          // For tasks, poll for completion
          const task = result as { id: string; status?: { state: string }; artifacts?: Array<{ parts: Array<{ kind: string }> }> };
          const maxWaitMs = 30000;
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWaitMs) {
            const taskResponse = await this.sdkClient.getTask({ id: task.id });
            if ('result' in taskResponse && taskResponse.result) {
              const taskResult = taskResponse.result as { task?: typeof task };
              if (taskResult.task?.status?.state === 'completed') {
                const artifact = taskResult.task.artifacts?.[0];
                if (artifact) {
                  const dataPart = artifact.parts.find((p) => isDataPart(p));
                  return dataPart && isDataPart(dataPart) ? dataPart.data : {};
                }
                return {};
              }
              if (['failed', 'canceled', 'rejected'].includes(taskResult.task?.status?.state || '')) {
                throw new Error(`Task ${taskResult.task?.status?.state}`);
              }
            }
            await new Promise((r) => setTimeout(r, 500));
          }
          throw new Error('Task timeout');
        }
      }
    }

    return {};
  }

  /**
   * Core request method - uses A2A protocol
   * Accepts params with potential undefined values and filters them out
   * Returns unknown since A2A responses can be any JSON structure
   */
  async request(
    method: string,
    params?: Record<string, JsonValue | undefined>
  ): Promise<JsonValue> {
    if (method.startsWith('a2a.')) {
      // Map a2a.* methods to actions
      const action = method
        .replace('a2a.', '')
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase();
      // Convert back to camelCase for skill mapping
      const camelAction = action
        .split('_')
        .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join('');
      // Filter out undefined values from params and convert to JsonValue
      const cleanParams: Record<string, JsonValue> = {};
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            // Value is known to be defined, safe to cast to JsonValue
            cleanParams[key] = value as JsonValue;
          } else if (value === null) {
            cleanParams[key] = null;
          }
        }
      }
      return this.executeViaA2A(camelAction, cleanParams);
    }
    throw new Error(`Method ${method} must use A2A protocol`);
  }

  /**
   * Alias for request() for backward compatibility with providers
   */
  async sendRequest(
    method: string,
    params?: Record<string, JsonValue | undefined>
  ): Promise<JsonValue> {
    return this.request(method, params);
  }

  // ==================== Market Data Methods ====================
  async getMarketData(marketId: string) {
    return this.request('a2a.getMarketData', { marketId });
  }

  async getMarketPrices(marketId: string) {
    return this.request('a2a.getMarketPrices', { marketId });
  }

  async subscribeMarket(marketId: string) {
    return this.request('a2a.subscribeMarket', { marketId });
  }

  // ==================== Portfolio Methods ====================
  async getBalance(userId?: string) {
    return this.request('a2a.getBalance', userId ? { userId } : {});
  }

  async getPositions(userId?: string) {
    return this.request('a2a.getPositions', userId ? { userId } : {});
  }

  async getUserWallet(userId: string) {
    return this.request('a2a.getUserWallet', { userId });
  }

  // ==================== Agent Discovery Methods ====================
  async discoverAgents(
    filters?: {
      strategies?: string[];
      markets?: string[];
      minReputation?: number;
    },
    limit?: number
  ) {
    return this.request('a2a.discover', {
      filters: filters as JsonValue,
      limit,
    });
  }

  async getAgentInfo(agentId: string) {
    return this.request('a2a.getInfo', { agentId });
  }

  // ==================== Trading Methods ====================
  async getPredictions(params?: {
    userId?: string;
    status?: 'active' | 'resolved';
  }) {
    return this.request('a2a.getPredictions', params || {});
  }

  async getPerpetuals() {
    return this.request('a2a.getPerpetuals', {});
  }

  async buyShares(marketId: string, outcome: 'YES' | 'NO', amount: number) {
    return this.request('a2a.buyShares', { marketId, outcome, amount });
  }

  async sellShares(positionId: string, shares: number) {
    return this.request('a2a.sellShares', { positionId, shares });
  }

  async openPosition(
    ticker: string,
    side: 'LONG' | 'SHORT',
    amount: number,
    leverage: number
  ) {
    return this.request('a2a.openPosition', { ticker, side, amount, leverage });
  }

  async closePosition(positionId: string) {
    return this.request('a2a.closePosition', { positionId });
  }

  async getTrades(params?: { limit?: number; marketId?: string }) {
    return this.request('a2a.getTrades', params || {});
  }

  async getTradeHistory(userId: string, limit?: number) {
    return this.request('a2a.getTradeHistory', { userId, limit });
  }

  // ==================== Social Features ====================
  async getFeed(params?: {
    limit?: number;
    offset?: number;
    following?: boolean;
    type?: 'post' | 'article';
  }) {
    return this.request('a2a.getFeed', params || {});
  }

  async getPost(postId: string) {
    return this.request('a2a.getPost', { postId });
  }

  async createPost(content: string, type: 'post' | 'article' = 'post') {
    return this.request('a2a.createPost', { content, type });
  }

  async deletePost(postId: string) {
    return this.request('a2a.deletePost', { postId });
  }

  async likePost(postId: string) {
    return this.request('a2a.likePost', { postId });
  }

  async unlikePost(postId: string) {
    return this.request('a2a.unlikePost', { postId });
  }

  async sharePost(postId: string, comment?: string) {
    return this.request('a2a.sharePost', { postId, comment });
  }

  async getComments(postId: string, limit?: number) {
    return this.request('a2a.getComments', { postId, limit });
  }

  async createComment(postId: string, content: string) {
    return this.request('a2a.createComment', { postId, content });
  }

  async deleteComment(commentId: string) {
    return this.request('a2a.deleteComment', { commentId });
  }

  async likeComment(commentId: string) {
    return this.request('a2a.likeComment', { commentId });
  }

  // ==================== User Management ====================
  async getUserProfile(userId: string) {
    return this.request('a2a.getUserProfile', { userId });
  }

  async updateProfile(params: {
    displayName?: string;
    bio?: string;
    username?: string;
    profileImageUrl?: string;
  }) {
    return this.request('a2a.updateProfile', params);
  }

  async followUser(userId: string) {
    return this.request('a2a.followUser', { userId });
  }

  async unfollowUser(userId: string) {
    return this.request('a2a.unfollowUser', { userId });
  }

  async getFollowers(userId: string, limit?: number) {
    return this.request('a2a.getFollowers', { userId, limit });
  }

  async getFollowing(userId: string, limit?: number) {
    return this.request('a2a.getFollowing', { userId, limit });
  }

  async searchUsers(query: string, limit?: number) {
    return this.request('a2a.searchUsers', { query, limit });
  }

  // ==================== Messaging ====================
  async getChats(filter?: 'all' | 'dms' | 'groups') {
    return this.request('a2a.getChats', filter ? { filter } : {});
  }

  async getChatMessages(chatId: string, limit?: number, offset?: number) {
    return this.request('a2a.getChatMessages', { chatId, limit, offset });
  }

  async sendMessage(chatId: string, content: string) {
    return this.request('a2a.sendMessage', { chatId, content });
  }

  async createGroup(name: string, memberIds: string[], description?: string) {
    return this.request('a2a.createGroup', { name, memberIds, description });
  }

  async leaveChat(chatId: string) {
    return this.request('a2a.leaveChat', { chatId });
  }

  async getUnreadCount() {
    return this.request('a2a.getUnreadCount', {});
  }

  // ==================== Notifications ====================
  async getNotifications(limit?: number) {
    return this.request('a2a.getNotifications', { limit });
  }

  async markNotificationsRead(notificationIds: string[]) {
    return this.request('a2a.markNotificationsRead', { notificationIds });
  }

  async getGroupInvites() {
    return this.request('a2a.getGroupInvites', {});
  }

  async acceptGroupInvite(inviteId: string) {
    return this.request('a2a.acceptGroupInvite', { inviteId });
  }

  async declineGroupInvite(inviteId: string) {
    return this.request('a2a.declineGroupInvite', { inviteId });
  }

  // ==================== Stats & Discovery ====================
  async getLeaderboard(params?: {
    page?: number;
    pageSize?: number;
    pointsType?: 'all' | 'earned' | 'referral';
    minPoints?: number;
  }) {
    return this.request('a2a.getLeaderboard', params || {});
  }

  async getUserStats(userId: string) {
    return this.request('a2a.getUserStats', { userId });
  }

  async getSystemStats() {
    return this.request('a2a.getSystemStats', {});
  }

  async getReferrals() {
    return this.request('a2a.getReferrals', {});
  }

  async getReferralStats() {
    return this.request('a2a.getReferralStats', {});
  }

  async getReferralCode() {
    return this.request('a2a.getReferralCode', {});
  }

  async getReputation(userId?: string) {
    return this.request('a2a.getReputation', userId ? { userId } : {});
  }

  async getReputationBreakdown(userId: string) {
    return this.request('a2a.getReputationBreakdown', { userId });
  }

  async getTrendingTags(limit?: number) {
    return this.request('a2a.getTrendingTags', { limit });
  }

  async getPostsByTag(tag: string, limit?: number, offset?: number) {
    return this.request('a2a.getPostsByTag', { tag, limit, offset });
  }

  async getOrganizations(limit?: number) {
    return this.request('a2a.getOrganizations', { limit });
  }

  // ==================== Payments (x402) ====================
  async paymentRequest(params: {
    to: string;
    amount: string;
    service: string;
    metadata?: Record<string, JsonValue>;
    from?: string;
  }) {
    return this.request(
      'a2a.paymentRequest',
      params as Record<string, JsonValue>
    );
  }

  async paymentReceipt(requestId: string, txHash: string) {
    return this.request('a2a.paymentReceipt', { requestId, txHash });
  }

  // ==================== Moderation Methods ====================
  async blockUser(userId: string, reason?: string) {
    return this.request('a2a.blockUser', { userId, reason });
  }

  async unblockUser(userId: string) {
    return this.request('a2a.unblockUser', { userId });
  }

  async muteUser(userId: string, reason?: string) {
    return this.request('a2a.muteUser', { userId, reason });
  }

  async unmuteUser(userId: string) {
    return this.request('a2a.unmuteUser', { userId });
  }

  async reportUser(params: {
    userId: string;
    category:
      | 'spam'
      | 'harassment'
      | 'hate_speech'
      | 'violence'
      | 'misinformation'
      | 'inappropriate'
      | 'impersonation'
      | 'self_harm'
      | 'other';
    reason: string;
    evidence?: string;
  }) {
    return this.request('a2a.reportUser', params);
  }

  async reportPost(params: {
    postId: string;
    category:
      | 'spam'
      | 'harassment'
      | 'hate_speech'
      | 'violence'
      | 'misinformation'
      | 'inappropriate'
      | 'impersonation'
      | 'self_harm'
      | 'other';
    reason: string;
    evidence?: string;
  }) {
    return this.request('a2a.reportPost', params);
  }

  async getBlocks(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getBlocks', params || {});
  }

  async getMutes(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getMutes', params || {});
  }

  async checkBlockStatus(userId: string) {
    return this.request('a2a.checkBlockStatus', { userId });
  }

  async checkMuteStatus(userId: string) {
    return this.request('a2a.checkMuteStatus', { userId });
  }

  // ==================== Points Transfer ====================
  async transferPoints(recipientId: string, amount: number, message?: string) {
    return this.request('a2a.transferPoints', { recipientId, amount, message });
  }

  // ==================== Favorites ====================
  async favoriteProfile(userId: string) {
    return this.request('a2a.favoriteProfile', { userId });
  }

  async unfavoriteProfile(userId: string) {
    return this.request('a2a.unfavoriteProfile', { userId });
  }

  async getFavorites(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getFavorites', params || {});
  }

  async getFavoritePosts(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getFavoritePosts', params || {});
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Initialize A2A client for an agent
 *
 * OPTIMIZED FOR 300K+ USERS:
 * - Uses cached agent identity (avoids DB query per init)
 * - Uses singleton A2A client (agent card fetched once)
 * - Returns null if A2A is not available (for graceful fallback)
 */
export async function initializeAgentA2AClient(
  agentUserId: string
): Promise<BabylonA2AClient | null> {
  const result = await initializeA2ASdkClient(agentUserId);

  // If SDK client is null, A2A is not available
  if (!result) {
    return null;
  }

  // Create client with cached identity - headers injected per-request
  return new BabylonA2AClient(result.client, agentUserId, result.identity);
}

/**
 * Enhance agent runtime with Babylon plugin
 *
 * OPTIMIZED FOR 300K+ USERS:
 * - Uses singleton A2A client shared across all agents
 * - Identity cached with 5-minute TTL
 */
export async function enhanceRuntimeWithBabylon(
  runtime: AgentRuntime,
  agentUserId: string,
  plugin: Plugin
): Promise<void> {
  const babylonRuntime = runtime as BabylonRuntime;

  // Initialize A2A client with cached identity and shared base client
  const result = await initializeA2ASdkClient(agentUserId);

  if (!result) {
    logger.warn(
      'A2A client initialization failed - plugin will have limited functionality',
      {
        agentUserId,
        pluginName: plugin.name,
      }
    );
    // Create a disconnected client for graceful degradation
    const fallbackIdentity: CachedAgentIdentity = {
      agentUserId,
      walletAddress: null,
      agent0TokenId: null,
      displayName: null,
      cachedAt: Date.now(),
    };
    babylonRuntime.a2aClient = new BabylonA2AClient(
      null,
      agentUserId,
      fallbackIdentity
    );
  } else {
    babylonRuntime.a2aClient = new BabylonA2AClient(
      result.client,
      agentUserId,
      result.identity
    );
  }

  const a2aConnected = babylonRuntime.a2aClient.isConnected();

  runtime.registerPlugin(plugin);

  // Use debug level for per-agent plugin registration to reduce startup noise
  const a2aMode = a2aConnected ? 'a2a' : 'database-fallback';
  logger.debug('Babylon plugin registered', {
    agentUserId,
    mode: a2aMode,
    a2aEnabled: a2aConnected,
    providersCount: plugin.providers?.length || 0,
    actionsCount: plugin.actions?.length || 0,
  });
}

/**
 * Disconnect A2A client for an agent
 */
export async function disconnectAgentA2AClient(
  runtime: AgentRuntime
): Promise<void> {
  const babylonRuntime = runtime as BabylonRuntime;

  if (!babylonRuntime.a2aClient?.isConnected()) {
    return;
  }

  if (babylonRuntime.a2aClient && 'close' in babylonRuntime.a2aClient) {
    await (babylonRuntime.a2aClient as { close: () => Promise<void> }).close();
  }
  babylonRuntime.a2aClient = undefined;

  logger.info('A2A client disconnected', { agentId: runtime.agentId });
}

/**
 * Check if agent runtime has active A2A connection
 */
export function hasActiveA2AConnection(runtime: AgentRuntime): boolean {
  const babylonRuntime = runtime as BabylonRuntime;
  return !!babylonRuntime.a2aClient?.isConnected();
}

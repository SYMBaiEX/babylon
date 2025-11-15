/**
 * Babylon Plugin Integration Service - Official A2A SDK (Complete)
 * 
 * Complete wrapper implementing all 73 Babylon A2A methods using official SDK
 */

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { agentWalletService } from '@/lib/agents/identity/AgentWalletService'
import { A2AClient } from '@a2a-js/sdk/client'
import type { BabylonRuntime } from './types'
import type { AgentRuntime, Plugin } from '@elizaos/core'

function shouldAutoProvisionWallets(): boolean {
  return process.env.AUTO_CREATE_AGENT_WALLETS !== 'false'
}

/**
 * Initialize A2A client for an agent using official SDK
 */
export async function initializeAgentA2AClientOfficial(
  agentUserId: string
): Promise<A2AClient> {
  const agent = await prisma.user.findUnique({
    where: { id: agentUserId }
  })

  if (!agent || !agent.isAgent) {
    throw new Error(`Agent user ${agentUserId} not found or not an agent`)
  }

  let walletAddress = agent.walletAddress

  if (!walletAddress && shouldAutoProvisionWallets()) {
    try {
      const walletResult = await agentWalletService.createAgentEmbeddedWallet(agentUserId)
      walletAddress = walletResult.walletAddress
      logger.info('Auto-provisioned embedded wallet for agent', {
        agentUserId,
        walletAddress
      }, 'BabylonIntegration')
    } catch (error) {
      logger.warn('Failed to auto-provision wallet for agent', {
        agentUserId,
        error: error instanceof Error ? error.message : String(error)
      }, 'BabylonIntegration')
    }
  }

  // Wallet is optional - A2A works without it (just won't have ERC-8004 headers)
  if (!walletAddress) {
    logger.info(
      'Agent has no wallet address - A2A will work without ERC-8004 headers',
      { agentUserId },
      'BabylonIntegration'
    )
  }

  // Get A2A endpoint URL - prioritize BABYLON_A2A_ENDPOINT, fallback to NEXT_PUBLIC_APP_URL
  const baseUrl = process.env.BABYLON_A2A_ENDPOINT || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const agentCardUrl = `${baseUrl}/.well-known/agent-card.json`

  logger.info('Initializing A2A client', {
    agentUserId,
    agentCardUrl,
    baseUrl,
    hasWallet: !!walletAddress
  }, 'BabylonIntegration')

  // Create A2A client from Agent Card URL
  // Use default fetch - authentication will be handled by server via headers
  // The SDK will handle standard A2A methods, extensions will use custom headers
  const a2aClient = await A2AClient.fromCardUrl(agentCardUrl)

  logger.info('✅ Official A2A SDK client created', { 
    agentUserId, 
    agentName: agent.displayName,
    agentCardUrl
  })

  return a2aClient
}

/**
 * Complete wrapper implementing all HttpA2AClient methods via official SDK
 * This maintains 100% backward compatibility while using official SDK
 */
export class BabylonA2AClientWrapper {
  public readonly agentId: string
  private agentAddress?: string
  private agentTokenId?: number

  constructor(_sdkClient: A2AClient, agentId: string, agentAddress?: string, agentTokenId?: number) {
    // SDK client stored but not used directly - we make direct HTTP calls for extensions
    // This allows us to use custom auth headers while still leveraging SDK for Agent Card discovery
    this.agentId = agentId
    this.agentAddress = agentAddress
    this.agentTokenId = agentTokenId
  }

  /**
   * Check if client is connected (always true for HTTP client)
   */
  isConnected(): boolean {
    return true
  }

  /**
   * Core request method - uses SDK's callExtensionMethod for Babylon methods
   * For Babylon extensions, we need to make direct HTTP calls with auth headers
   * since the SDK's callExtensionMethod may not support our custom auth
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (method.startsWith('a2a.')) {
      // For Babylon extensions, make direct HTTP call with auth headers
      // The SDK's callExtensionMethod expects extensions to be in AgentCard
      // but we need custom auth headers, so we'll make direct calls
      // Use same endpoint resolution as client initialization
      const baseUrl = process.env.BABYLON_A2A_ENDPOINT || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const endpoint = `${baseUrl}/api/a2a`
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.agentId,
          ...(this.agentAddress && { 'X-Agent-Address': this.agentAddress }),
          ...(this.agentTokenId && { 'X-Agent-Token-Id': this.agentTokenId.toString() })
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params: params || {},
          id: Date.now()
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.error) {
        throw new Error(`A2A Error [${result.error.code}]: ${result.error.message}`)
      }

      return result.result
    }
    throw new Error(`Method ${method} should use SDK methods or extensions`)
  }

  /**
   * Alias for request() for backward compatibility with providers
   */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    return this.request(method, params)
  }

  // ==================== Market Data Methods ====================
  async getMarketData(marketId: string) {
    return this.request('a2a.getMarketData', { marketId })
  }

  async getMarketPrices(marketId: string) {
    return this.request('a2a.getMarketPrices', { marketId })
  }

  async subscribeMarket(marketId: string) {
    return this.request('a2a.subscribeMarket', { marketId })
  }

  // ==================== Portfolio Methods ====================
  async getBalance(userId?: string) {
    return this.request('a2a.getBalance', userId ? { userId } : {})
  }

  async getPositions(userId?: string) {
    return this.request('a2a.getPositions', userId ? { userId } : {})
  }

  async getUserWallet(userId: string) {
    return this.request('a2a.getUserWallet', { userId })
  }

  // ==================== Agent Discovery Methods ====================
  async discoverAgents(filters?: {
    strategies?: string[]
    markets?: string[]
    minReputation?: number
  }, limit?: number) {
    return this.request('a2a.discover', { filters, limit })
  }

  async getAgentInfo(agentId: string) {
    return this.request('a2a.getInfo', { agentId })
  }

  // ==================== Trading Methods ====================
  async getPredictions(params?: { userId?: string; status?: 'active' | 'resolved' }) {
    return this.request('a2a.getPredictions', params || {})
  }

  async getPerpetuals() {
    return this.request('a2a.getPerpetuals', {})
  }

  async buyShares(marketId: string, outcome: 'YES' | 'NO', amount: number) {
    return this.request('a2a.buyShares', { marketId, outcome, amount })
  }

  async sellShares(positionId: string, shares: number) {
    return this.request('a2a.sellShares', { positionId, shares })
  }

  async openPosition(ticker: string, side: 'LONG' | 'SHORT', amount: number, leverage: number) {
    return this.request('a2a.openPosition', { ticker, side, amount, leverage })
  }

  async closePosition(positionId: string) {
    return this.request('a2a.closePosition', { positionId })
  }

  async getTrades(params?: { limit?: number; marketId?: string }) {
    return this.request('a2a.getTrades', params || {})
  }

  async getTradeHistory(userId: string, limit?: number) {
    return this.request('a2a.getTradeHistory', { userId, limit })
  }

  // ==================== Social Features ====================
  async getFeed(params?: { limit?: number; offset?: number; following?: boolean; type?: 'post' | 'article' }) {
    return this.request('a2a.getFeed', params || {})
  }

  async getPost(postId: string) {
    return this.request('a2a.getPost', { postId })
  }

  async createPost(content: string, type: 'post' | 'article' = 'post') {
    return this.request('a2a.createPost', { content, type })
  }

  async deletePost(postId: string) {
    return this.request('a2a.deletePost', { postId })
  }

  async likePost(postId: string) {
    return this.request('a2a.likePost', { postId })
  }

  async unlikePost(postId: string) {
    return this.request('a2a.unlikePost', { postId })
  }

  async sharePost(postId: string, comment?: string) {
    return this.request('a2a.sharePost', { postId, comment })
  }

  async getComments(postId: string, limit?: number) {
    return this.request('a2a.getComments', { postId, limit })
  }

  async createComment(postId: string, content: string) {
    return this.request('a2a.createComment', { postId, content })
  }

  async deleteComment(commentId: string) {
    return this.request('a2a.deleteComment', { commentId })
  }

  async likeComment(commentId: string) {
    return this.request('a2a.likeComment', { commentId })
  }

  // ==================== User Management ====================
  async getUserProfile(userId: string) {
    return this.request('a2a.getUserProfile', { userId })
  }

  async updateProfile(params: {
    displayName?: string
    bio?: string
    username?: string
    profileImageUrl?: string
  }) {
    return this.request('a2a.updateProfile', params)
  }

  async followUser(userId: string) {
    return this.request('a2a.followUser', { userId })
  }

  async unfollowUser(userId: string) {
    return this.request('a2a.unfollowUser', { userId })
  }

  async getFollowers(userId: string, limit?: number) {
    return this.request('a2a.getFollowers', { userId, limit })
  }

  async getFollowing(userId: string, limit?: number) {
    return this.request('a2a.getFollowing', { userId, limit })
  }

  async searchUsers(query: string, limit?: number) {
    return this.request('a2a.searchUsers', { query, limit })
  }

  // ==================== Messaging ====================
  async getChats(filter?: 'all' | 'dms' | 'groups') {
    return this.request('a2a.getChats', filter ? { filter } : {})
  }

  async getChatMessages(chatId: string, limit?: number, offset?: number) {
    return this.request('a2a.getChatMessages', { chatId, limit, offset })
  }

  async sendMessage(chatId: string, content: string) {
    return this.request('a2a.sendMessage', { chatId, content })
  }

  async createGroup(name: string, memberIds: string[], description?: string) {
    return this.request('a2a.createGroup', { name, memberIds, description })
  }

  async leaveChat(chatId: string) {
    return this.request('a2a.leaveChat', { chatId })
  }

  async getUnreadCount() {
    return this.request('a2a.getUnreadCount', {})
  }

  // ==================== Notifications ====================
  async getNotifications(limit?: number) {
    return this.request('a2a.getNotifications', { limit })
  }

  async markNotificationsRead(notificationIds: string[]) {
    return this.request('a2a.markNotificationsRead', { notificationIds })
  }

  async getGroupInvites() {
    return this.request('a2a.getGroupInvites', {})
  }

  async acceptGroupInvite(inviteId: string) {
    return this.request('a2a.acceptGroupInvite', { inviteId })
  }

  async declineGroupInvite(inviteId: string) {
    return this.request('a2a.declineGroupInvite', { inviteId })
  }

  // ==================== Stats & Discovery ====================
  async getLeaderboard(params?: {
    page?: number
    pageSize?: number
    pointsType?: 'all' | 'earned' | 'referral'
    minPoints?: number
  }) {
    return this.request('a2a.getLeaderboard', params || {})
  }

  async getUserStats(userId: string) {
    return this.request('a2a.getUserStats', { userId })
  }

  async getSystemStats() {
    return this.request('a2a.getSystemStats', {})
  }

  async getReferrals() {
    return this.request('a2a.getReferrals', {})
  }

  async getReferralStats() {
    return this.request('a2a.getReferralStats', {})
  }

  async getReferralCode() {
    return this.request('a2a.getReferralCode', {})
  }

  async getReputation(userId?: string) {
    return this.request('a2a.getReputation', userId ? { userId } : {})
  }

  async getReputationBreakdown(userId: string) {
    return this.request('a2a.getReputationBreakdown', { userId })
  }

  async getTrendingTags(limit?: number) {
    return this.request('a2a.getTrendingTags', { limit })
  }

  async getPostsByTag(tag: string, limit?: number, offset?: number) {
    return this.request('a2a.getPostsByTag', { tag, limit, offset })
  }

  async getOrganizations(limit?: number) {
    return this.request('a2a.getOrganizations', { limit })
  }

  // ==================== Payments (x402) ====================
  async paymentRequest(params: {
    to: string
    amount: string
    service: string
    metadata?: Record<string, unknown>
    from?: string
  }) {
    return this.request('a2a.paymentRequest', params)
  }

  async paymentReceipt(requestId: string, txHash: string) {
    return this.request('a2a.paymentReceipt', { requestId, txHash })
  }

  // ==================== Moderation Methods ====================
  async blockUser(userId: string, reason?: string) {
    return this.request('a2a.blockUser', { userId, reason })
  }

  async unblockUser(userId: string) {
    return this.request('a2a.unblockUser', { userId })
  }

  async muteUser(userId: string, reason?: string) {
    return this.request('a2a.muteUser', { userId, reason })
  }

  async unmuteUser(userId: string) {
    return this.request('a2a.unmuteUser', { userId })
  }

  async reportUser(params: {
    userId: string
    category: 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'misinformation' | 'inappropriate' | 'impersonation' | 'self_harm' | 'other'
    reason: string
    evidence?: string
  }) {
    return this.request('a2a.reportUser', params)
  }

  async reportPost(params: {
    postId: string
    category: 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'misinformation' | 'inappropriate' | 'impersonation' | 'self_harm' | 'other'
    reason: string
    evidence?: string
  }) {
    return this.request('a2a.reportPost', params)
  }

  async getBlocks(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getBlocks', params || {})
  }

  async getMutes(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getMutes', params || {})
  }

  async checkBlockStatus(userId: string) {
    return this.request('a2a.checkBlockStatus', { userId })
  }

  async checkMuteStatus(userId: string) {
    return this.request('a2a.checkMuteStatus', { userId })
  }

  // ==================== Points Transfer ====================
  async transferPoints(recipientId: string, amount: number, message?: string) {
    return this.request('a2a.transferPoints', { recipientId, amount, message })
  }

  // ==================== Favorites ====================
  async favoriteProfile(userId: string) {
    return this.request('a2a.favoriteProfile', { userId })
  }

  async unfavoriteProfile(userId: string) {
    return this.request('a2a.unfavoriteProfile', { userId })
  }

  async getFavorites(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getFavorites', params || {})
  }

  async getFavoritePosts(params?: { limit?: number; offset?: number }) {
    return this.request('a2a.getFavoritePosts', params || {})
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Initialize A2A client wrapper for backward compatibility
 */
export async function initializeAgentA2AClient(
  agentUserId: string
): Promise<BabylonA2AClientWrapper> {
  const agent = await prisma.user.findUnique({
    where: { id: agentUserId },
    select: { walletAddress: true, agent0TokenId: true }
  })

  const sdkClient = await initializeAgentA2AClientOfficial(agentUserId)
  const walletAddress = agent?.walletAddress || undefined
  const agent0TokenId = agent?.agent0TokenId || undefined
  return new BabylonA2AClientWrapper(
    sdkClient,
    agentUserId,
    walletAddress,
    agent0TokenId
  )
}

/**
 * Enhance agent runtime with Babylon plugin using official SDK
 */
export async function enhanceRuntimeWithBabylon(
  runtime: AgentRuntime,
  agentUserId: string,
  plugin: Plugin
): Promise<void> {
  const babylonRuntime = runtime as BabylonRuntime

  // A2A is REQUIRED - initialize client
  let a2aClient: BabylonA2AClientWrapper | undefined
  try {
    a2aClient = await initializeAgentA2AClient(agentUserId)
    babylonRuntime.a2aClient = a2aClient as unknown as typeof babylonRuntime.a2aClient
    
    logger.info('✅ Babylon plugin registered with official A2A SDK', { 
      agentUserId,
      pluginName: plugin.name,
      providersCount: plugin.providers?.length || 0,
      actionsCount: plugin.actions?.length || 0,
      a2aConnected: true,
      a2aEndpoint: process.env.NEXT_PUBLIC_APP_URL || process.env.BABYLON_A2A_ENDPOINT || 'http://localhost:3000'
    })
  } catch (error) {
    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    
    // Get agent info for error logging
    const agent = await prisma.user.findUnique({
      where: { id: agentUserId },
      select: { walletAddress: true }
    })
    
    logger.error('❌ A2A client initialization FAILED', {
      agentUserId,
      error: errorMessage,
      stack: errorStack,
      agentCardUrl: `${process.env.BABYLON_A2A_ENDPOINT || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/.well-known/agent-card.json`,
      baseUrl: process.env.BABYLON_A2A_ENDPOINT || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      hasWallet: !!agent?.walletAddress
    }, 'BabylonIntegration')
    
    // Don't throw - allow plugin registration but log error
    // Providers/actions will check isConnected() and fail gracefully
    // This allows graceful degradation if A2A endpoint is temporarily unavailable
  }
  
  runtime.registerPlugin(plugin)
  
  const a2aMode = a2aClient?.isConnected() ? 'a2a' : 'database-fallback'
  logger.info('Babylon plugin registered', { 
    agentUserId,
    mode: a2aMode,
    a2aEnabled: !!a2aClient?.isConnected()
  })
}

/**
 * Disconnect A2A client for an agent
 */
export async function disconnectAgentA2AClient(runtime: AgentRuntime): Promise<void> {
  const babylonRuntime = runtime as BabylonRuntime
  
  if (!babylonRuntime.a2aClient?.isConnected()) {
    return
  }

  try {
    if (babylonRuntime.a2aClient && 'close' in babylonRuntime.a2aClient) {
      await (babylonRuntime.a2aClient as { close: () => Promise<void> }).close()
    }
    babylonRuntime.a2aClient = undefined
    
    logger.info('A2A client disconnected', { agentId: runtime.agentId })
  } catch (error) {
    logger.error('Failed to disconnect A2A client', error, 'BabylonIntegration')
  }
}

/**
 * Check if agent runtime has active A2A connection
 */
export function hasActiveA2AConnection(runtime: AgentRuntime): boolean {
  const babylonRuntime = runtime as BabylonRuntime
  return !!babylonRuntime.a2aClient?.isConnected()
}


/**
 * HTTP-based A2A Client
 * 
 * Simple client for A2A protocol over HTTP (no WebSocket)
 * Uses JSON-RPC 2.0 over HTTP POST requests
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcParams } from '@/types/a2a'

export interface HttpA2AClientConfig {
  /** A2A endpoint URL (e.g. http://localhost:3000/api/a2a) */
  endpoint: string
  /** Agent ID for authentication */
  agentId: string
  /** Agent address (optional) */
  address?: string
  /** Agent token ID (optional) */
  tokenId?: number
  /** Request timeout in ms */
  timeout?: number
}

export class HttpA2AClient {
  private config: HttpA2AClientConfig
  private requestId = 0

  constructor(config: HttpA2AClientConfig) {
    this.config = {
      timeout: 30000,
      ...config
    }
  }

  /**
   * Send a JSON-RPC request
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId
    
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params: params as JsonRpcParams | undefined,
      id
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.config.agentId,
        ...(this.config.address && { 'X-Agent-Address': this.config.address }),
        ...(this.config.tokenId && { 'X-Agent-Token-Id': this.config.tokenId.toString() })
      },
      body: JSON.stringify(request),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result: JsonRpcResponse = await response.json()

    if (result.error) {
      throw new Error(`A2A Error [${result.error.code}]: ${result.error.message}`)
    }

    return result.result
  }

  /**
   * Market Data Methods
   */
  async getMarketData(marketId: string) {
    return this.request('a2a.getMarketData', { marketId })
  }

  async getMarketPrices(marketId: string) {
    return this.request('a2a.getMarketPrices', { marketId })
  }

  async subscribeMarket(marketId: string) {
    return this.request('a2a.subscribeMarket', { marketId })
  }

  /**
   * Portfolio Methods
   */
  async getBalance(userId?: string) {
    return this.request('a2a.getBalance', userId ? { userId } : {})
  }

  async getPositions(userId?: string) {
    return this.request('a2a.getPositions', userId ? { userId } : {})
  }

  async getUserWallet(userId: string) {
    return this.request('a2a.getUserWallet', { userId })
  }

  /**
   * Agent Discovery Methods
   */
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

  /**
   * Coalition Methods
   */
  async proposeCoalition(params: {
    name: string
    strategy: string
    targetMarket: string
    minMembers: number
    maxMembers: number
  }) {
    return this.request('a2a.proposeCoalition', params)
  }

  async joinCoalition(coalitionId: string) {
    return this.request('a2a.joinCoalition', { coalitionId })
  }

  async leaveCoalition(coalitionId: string) {
    return this.request('a2a.leaveCoalition', { coalitionId })
  }

  async sendCoalitionMessage(params: {
    coalitionId: string
    messageType: string
    content: unknown
  }) {
    return this.request('a2a.coalitionMessage', params)
  }

  /**
   * Analysis Sharing Methods
   */
  async shareAnalysis(analysis: {
    marketId: string
    analyst: string
    prediction: number
    confidence: number
    reasoning: string
    dataPoints: Record<string, string | number | boolean | null>
    timestamp: number
  }) {
    return this.request('a2a.shareAnalysis', analysis)
  }

  async requestAnalysis(params: {
    marketId: string
    paymentOffer?: string
    deadline: number
  }) {
    return this.request('a2a.requestAnalysis', params)
  }

  async getAnalyses(marketId: string, limit?: number) {
    return this.request('a2a.getAnalyses', { marketId, limit })
  }

  /**
   * Trading Methods
   */
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

  /**
   * Social Features
   */
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

  /**
   * User Management
   */
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

  /**
   * Messaging
   */
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

  /**
   * Notifications
   */
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

  /**
   * Stats & Discovery
   */
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

  /**
   * Payments (x402)
   */
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

  /**
   * Moderation Methods
   */
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

  /**
   * Points Transfer
   */
  async transferPoints(recipientId: string, amount: number, message?: string) {
    return this.request('a2a.transferPoints', { recipientId, amount, message })
  }

  /**
   * Favorites
   */
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

  /**
   * Send a generic JSON-RPC request (alias for request)
   * Kept for backward compatibility with old code
   */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    return this.request(method, params)
  }

  /**
   * Check if client is connected (always true for HTTP)
   * Kept for backward compatibility
   */
  isConnected(): boolean {
    return true
  }

  /**
   * Close the client (no-op for HTTP, kept for API compatibility)
   */
  async close(): Promise<void> {
    // No cleanup needed for HTTP
  }
}

/**
 * Create an HTTP-based A2A client
 */
export function createHttpA2AClient(config: HttpA2AClientConfig): HttpA2AClient {
  return new HttpA2AClient(config)
}


/**
 * Babylon A2A Client
 * 
 * Official A2A SDK implementation using @a2a-js/sdk.
 * All interactions follow the official A2A protocol via message/send with Tasks and Messages.
 * Implements all Babylon features as official A2A Skills.
 */

import { A2AClient, type AgentCard, type Message, type Task, type TextPart, type DataPart, type SendMessageResponse } from '@a2a-js/sdk'
import type { JsonValue } from '../../../src/types/a2a'

export interface BabylonA2AClientConfig {
  /** Base URL of Babylon server (e.g., http://localhost:3000) */
  baseUrl: string
  /** Agent wallet address */
  address: string
  /** Agent token ID from ERC-8004 registry */
  tokenId: number
  /** Private key for signing (optional, for authenticated requests) */
  privateKey?: string
}

/**
 * Official A2A Client for Babylon
 * 
 * Uses message/send to interact with Babylon's A2A server.
 * All operations are sent as Messages with Parts (TextPart, DataPart).
 */
export class BabylonA2AClient {
  private client: A2AClient
  private config: BabylonA2AClientConfig
  private agentCard: AgentCard | null = null
  public agentId: string | null = null

  constructor(config: BabylonA2AClientConfig) {
    this.config = config
    this.agentId = `agent-${config.tokenId}-${config.address.slice(0, 8)}`
    
    // Initialize client - will fetch agent card from .well-known/agent-card.json
    const agentCardUrl = `${config.baseUrl}/.well-known/agent-card.json`
    this.client = new A2AClient(agentCardUrl, {
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        // Add authentication headers
        const headers = new Headers(init?.headers)
        headers.set('x-agent-id', this.agentId)
        headers.set('x-agent-address', this.config.address)
        headers.set('x-agent-token-id', this.config.tokenId.toString())
        return fetch(url, { ...init, headers })
      }
    })
  }

  /**
   * Connect to Babylon and fetch agent card
   */
  async connect(): Promise<void> {
    try {
      // Fetch agent card to verify connection
      const client = await A2AClient.fromCardUrl(
        `${this.config.baseUrl}/.well-known/agent-card.json`,
        {
          fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
            const headers = new Headers(init?.headers)
            headers.set('x-agent-id', this.agentId)
            headers.set('x-agent-address', this.config.address)
            headers.set('x-agent-token-id', this.config.tokenId.toString())
            return fetch(url, { ...init, headers })
          }
        }
      )
      
      // Update client reference
      this.client = client
      
      // Get agent card
      this.agentCard = await client['agentCardPromise'] || null

      // Verify connection by sending a test message
      await this.sendMessage('ping', { action: 'ping' })
    } catch (error) {
      throw new Error(`Failed to connect to Babylon A2A: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Send a message to Babylon using official A2A protocol
   * 
   * @param text Text content of the message
   * @param data Optional structured data (action, params, etc.)
   * @returns Task or Message response
   */
  async sendMessage(text: string, data?: Record<string, unknown>): Promise<Task | Message> {
    const parts: Array<TextPart | DataPart> = [
      {
        kind: 'text',
        text
      }
    ]

    if (data) {
      parts.push({
        kind: 'data',
        data
      })
    }

    const message: Message = {
      kind: 'message',
      messageId: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      parts,
      contextId: this.agentId || undefined
    }

    const response = await this.client.sendMessage({ message })

    if (this.client.isErrorResponse(response)) {
      throw new Error(`A2A Error [${response.error.code}]: ${response.error.message}`)
    }

    // Response can be either a Message or Task
    if ('task' in response.result) {
      return response.result.task
    } else if ('message' in response.result) {
      return response.result.message
    } else {
      // Fallback - check if result itself is a Task or Message
      const result = response.result as unknown
      if (result && typeof result === 'object' && 'kind' in result) {
        if (result.kind === 'task' || result.kind === 'message') {
          return result as Task | Message
        }
      }
      throw new Error('Unexpected response format')
    }
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<Task> {
    const response = await this.client.getTask({ taskId })

    if (this.client.isErrorResponse(response)) {
      throw new Error(`A2A Error [${response.error.code}]: ${response.error.message}`)
    }

    return response.result.task
  }

  /**
   * Wait for task to complete and return final result
   */
  async waitForTask(taskId: string, maxWaitMs: number = 30000): Promise<Task> {
    const startTime = Date.now()
    const pollInterval = 1000

    while (Date.now() - startTime < maxWaitMs) {
      const task = await this.getTask(taskId)
      
      if (task.status.state === 'completed' || task.status.state === 'failed' || task.status.state === 'canceled') {
        return task
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`)
  }

  /**
   * Extract result from task artifacts or messages
   */
  private extractResult(taskOrMessage: Task | Message): Record<string, JsonValue> {
    if (taskOrMessage.kind === 'task') {
      // It's a Task
      const task = taskOrMessage as Task
      if (task.artifacts && task.artifacts.length > 0) {
        // Extract from artifacts
        const artifact = task.artifacts[0]
        if (artifact.parts) {
          for (const part of artifact.parts) {
            if (part.kind === 'data') {
              return (part as DataPart).data as Record<string, JsonValue>
            }
          }
        }
      }
      // Check last message in history
      if (task.history && task.history.length > 0) {
        const lastMessage = task.history[task.history.length - 1]
        if (lastMessage.parts) {
          for (const part of lastMessage.parts) {
            if (part.kind === 'data') {
              return (part as DataPart).data as Record<string, JsonValue>
            }
          }
        }
      }
      // Check status message
      if (task.status?.message?.parts) {
        for (const part of task.status.message.parts) {
          if (part.kind === 'data') {
            return (part as DataPart).data as Record<string, unknown>
          }
        }
      }
      return {}
    } else {
      // It's a Message
      const message = taskOrMessage as Message
      if (message.parts) {
        for (const part of message.parts) {
          if (part.kind === 'data') {
            return (part as DataPart).data as Record<string, unknown>
          }
        }
      }
      return {}
    }
  }

  // ===== Trading Methods (via message/send) =====

  /**
   * Buy prediction market shares
   */
  async buyShares(marketId: string, outcome: 'YES' | 'NO', amount: number): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Buy ${amount} ${outcome} shares in market ${marketId}`,
      {
        skill: 'prediction-market-trader',
        action: 'buyShares',
        marketId,
        outcome,
        amount
      }
    )

    // If it's a task, wait for completion
    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    // If it's a message, extract result directly
    return this.extractResult(response)
  }

  /**
   * Sell prediction market shares
   */
  async sellShares(positionId: string, shares: number): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Sell ${shares} shares from position ${positionId}`,
      {
        skill: 'prediction-market-trader',
        action: 'sellShares',
        positionId,
        shares
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Open perpetual position
   */
  async openPosition(ticker: string, side: 'LONG' | 'SHORT', amount: number, leverage: number): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Open ${side} position on ${ticker} with $${amount} at ${leverage}x leverage`,
      {
        skill: 'perpetual-futures-trader',
        action: 'openPosition',
        ticker,
        side,
        amount,
        leverage
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Close perpetual position
   */
  async closePosition(positionId: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Close position ${positionId}`,
      {
        skill: 'perpetual-futures-trader',
        action: 'closePosition',
        positionId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Get predictions (query skill)
   */
  async getPredictions(params?: { userId?: string; status?: 'active' | 'resolved' }): Promise<{ predictions: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What prediction markets are available?',
      {
        skill: 'market-researcher',
        action: 'getPredictions',
        ...params
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { predictions: result.predictions as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { predictions: result.predictions as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get perpetuals (query skill)
   */
  async getPerpetuals(): Promise<{ perpetuals: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What perpetual futures markets are available?',
      {
        skill: 'market-researcher',
        action: 'getPerpetuals'
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { perpetuals: result.perpetuals as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { perpetuals: result.perpetuals as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get all markets
   */
  async getMarkets(): Promise<{ predictions: Array<Record<string, unknown>>; perps: Array<Record<string, unknown>> }> {
    const [predictions, perps] = await Promise.all([
      this.getPredictions({ status: 'active' }),
      this.getPerpetuals()
    ])
    return {
      predictions: predictions.predictions || [],
      perps: perps.perpetuals || []
    }
  }

  /**
   * Get balance (query skill)
   */
  async getBalance(): Promise<{ balance: number }> {
    const response = await this.sendMessage(
      'What is my current balance?',
      {
        skill: 'portfolio-analyst',
        action: 'getBalance'
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { balance: result.balance as number || 0 }
    }

    const result = this.extractResult(response)
    return { balance: result.balance as number || 0 }
  }

  /**
   * Get positions (query skill)
   */
  async getPositions(userId?: string): Promise<{ perpPositions: Array<Record<string, unknown>>; totalPnL: number }> {
    const response = await this.sendMessage(
      userId ? `What are user ${userId}'s positions?` : 'What are my current positions?',
      {
        skill: 'portfolio-analyst',
        action: 'getPositions',
        userId
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return {
        perpPositions: result.perpPositions as Array<Record<string, unknown>> || [],
        totalPnL: result.totalPnL as number || 0
      }
    }

    const result = this.extractResult(response)
    return {
      perpPositions: result.perpPositions as Array<Record<string, unknown>> || [],
      totalPnL: result.totalPnL as number || 0
    }
  }

  /**
   * Get portfolio (combines balance and positions)
   */
  async getPortfolio(): Promise<{ balance: number; positions: Array<Record<string, unknown>>; pnl: number }> {
    const [balance, positions] = await Promise.all([
      this.getBalance(),
      this.getPositions()
    ])

    return {
      balance: balance.balance,
      positions: positions.perpPositions || [],
      pnl: positions.totalPnL || 0
    }
  }

  /**
   * Get feed (query skill)
   */
  async getFeed(params?: { limit?: number; offset?: number; following?: boolean; type?: 'post' | 'article' }): Promise<{ posts: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'Show me recent posts from the feed',
      {
        skill: 'social-media-manager',
        action: 'getFeed',
        ...params
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { posts: result.posts as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { posts: result.posts as Array<Record<string, unknown>> || [] }
  }

  /**
   * Create post (action skill)
   */
  async createPost(content: string, type: 'post' | 'article' = 'post'): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Post: ${content}`,
      {
        skill: 'social-media-manager',
        action: 'createPost',
        content,
        type
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Create comment (action skill)
   */
  async createComment(postId: string, content: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Comment on post ${postId}: ${content}`,
      {
        skill: 'social-media-manager',
        action: 'createComment',
        postId,
        content
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Like post (action skill)
   */
  async likePost(postId: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Like post ${postId}`,
      {
        skill: 'social-media-manager',
        action: 'likePost',
        postId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Send message (action skill)
   */
  async sendMessageToChat(chatId: string, content: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Send message to chat ${chatId}: ${content}`,
      {
        skill: 'direct-messenger',
        action: 'sendMessage',
        chatId,
        content
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Get chats (query skill)
   */
  async getChats(filter?: 'all' | 'dms' | 'groups'): Promise<{ chats: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What are my chats?',
      {
        skill: 'direct-messenger',
        action: 'getChats',
        filter
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { chats: result.chats as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { chats: result.chats as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get notifications (query skill)
   */
  async getNotifications(limit?: number): Promise<{ notifications: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What are my notifications?',
      {
        skill: 'notification-manager',
        action: 'getNotifications',
        limit
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { notifications: result.notifications as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { notifications: result.notifications as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get leaderboard (query skill)
   */
  async getLeaderboard(params?: {
    page?: number
    pageSize?: number
    pointsType?: 'all' | 'earned' | 'referral'
    minPoints?: number
  }): Promise<{ leaderboard: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'Show me the leaderboard',
      {
        skill: 'stats-researcher',
        action: 'getLeaderboard',
        ...params
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { leaderboard: result.leaderboard as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { leaderboard: result.leaderboard as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get user profile (query skill)
   */
  async getUserProfile(userId: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Show me user ${userId}'s profile`,
      {
        skill: 'profile-manager',
        action: 'getUserProfile',
        userId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Get system stats (query skill)
   */
  async getSystemStats(): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      'What are the system statistics?',
      {
        skill: 'stats-researcher',
        action: 'getSystemStats'
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Get reputation (query skill)
   */
  async getReputation(userId?: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      userId ? `What is user ${userId}'s reputation?` : 'What is my reputation?',
      {
        skill: 'stats-researcher',
        action: 'getReputation',
        userId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Get trending tags (query skill)
   */
  async getTrendingTags(limit?: number): Promise<{ tags: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What topics are trending?',
      {
        skill: 'stats-researcher',
        action: 'getTrendingTags',
        limit
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { tags: result.tags as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { tags: result.tags as Array<Record<string, unknown>> || [] }
  }

  /**
   * Get organizations (query skill)
   */
  async getOrganizations(limit?: number): Promise<{ organizations: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      'What organizations/perpetual markets are available?',
      {
        skill: 'market-researcher',
        action: 'getOrganizations',
        limit
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { organizations: result.organizations as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { organizations: result.organizations as Array<Record<string, unknown>> || [] }
  }

  /**
   * Search users (query skill)
   */
  async searchUsers(query: string, limit?: number): Promise<{ users: Array<Record<string, unknown>> }> {
    const response = await this.sendMessage(
      `Search for users: ${query}`,
      {
        skill: 'user-relationship-manager',
        action: 'searchUsers',
        query,
        limit
      }
    )

    if ('status' in response) {
      const task = await this.waitForTask(response.id)
      const result = this.extractResult(task)
      return { users: result.users as Array<Record<string, unknown>> || [] }
    }

    const result = this.extractResult(response)
    return { users: result.users as Array<Record<string, unknown>> || [] }
  }

  /**
   * Follow user (action skill)
   */
  async followUser(userId: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Follow user ${userId}`,
      {
        skill: 'user-relationship-manager',
        action: 'followUser',
        userId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Unfollow user (action skill)
   */
  async unfollowUser(userId: string): Promise<Record<string, JsonValue>> {
    const response = await this.sendMessage(
      `Unfollow user ${userId}`,
      {
        skill: 'user-relationship-manager',
        action: 'unfollowUser',
        userId
      }
    )

    if (response.kind === 'task') {
      const task = response as Task
      if (task.status.state !== 'completed' && task.status.state !== 'failed' && task.status.state !== 'canceled') {
        const completedTask = await this.waitForTask(task.id)
        return this.extractResult(completedTask)
      }
      return this.extractResult(task)
    }
    
    return this.extractResult(response)
  }

  /**
   * Disconnect (cleanup)
   */
  async disconnect(): Promise<void> {
    // No-op for HTTP client, but kept for API compatibility
  }
}


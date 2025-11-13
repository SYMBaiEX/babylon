/**
 * Babylon A2A Client (Official SDK Implementation)
 * 
 * Wrapper around @a2a-js/sdk client that adapts it to Babylon's needs.
 * Replaces the custom A2AClient implementation with the official SDK.
 * 
 * Benefits:
 * - Standards compliant with A2A protocol
 * - Streaming support via async iterators
 * - Push notifications
 * - Task lifecycle management
 * - Better maintained by A2A project team
 */

import { A2AClient as OfficialA2AClient } from '@a2a-js/sdk/client'
import type { MessageSendParams, TextPart } from '@a2a-js/sdk'
import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import type { AgentProfile, MarketData, MarketAnalysis, Coalition } from '@/types/a2a'
import type { JsonValue, JsonRpcResult } from '@/types/common'

export interface BabylonA2AClientConfig {
  /** Agent card URL or endpoint */
  cardUrl?: string
  /** WebSocket endpoint (if not using card URL) */
  endpoint?: string
  /** Agent ID for context */
  agentId?: string
  /** Authentication credentials */
  credentials?: {
    address: string
    privateKey: string
    tokenId?: number
  }
  /** Agent capabilities */
  capabilities?: {
    strategies?: string[]
    markets?: string[]
    actions?: string[]
    version?: string
  }
}

/**
 * Babylon A2A Client
 * 
 * Wraps the official @a2a-js/sdk client with Babylon-specific methods.
 * Maintains API compatibility with the legacy custom client.
 */
export class BabylonA2AClient extends EventEmitter {
  private client: OfficialA2AClient | null = null
  private config: BabylonA2AClientConfig
  private connected: boolean = false

  constructor(config: BabylonA2AClientConfig) {
    super()
    this.config = config
  }

  /**
   * Connect to A2A server using agent card discovery
   */
  async connect(): Promise<void> {
    try {
      // Use agent card URL discovery if provided
      if (this.config.cardUrl) {
        logger.info('Connecting to A2A server via agent card', { cardUrl: this.config.cardUrl })
        this.client = await OfficialA2AClient.fromCardUrl(this.config.cardUrl)
      } 
      // Direct endpoint connection (legacy support)
      else if (this.config.endpoint) {
        logger.info('Connecting to A2A server via endpoint', { endpoint: this.config.endpoint })
        // Note: Official SDK expects agent card URL, so we construct it
        const cardUrl = `${this.config.endpoint}/.well-known/agent-card.json`
        this.client = await OfficialA2AClient.fromCardUrl(cardUrl)
      } else {
        throw new Error('Either cardUrl or endpoint must be provided')
      }

      this.connected = true
      this.emit('connected', { timestamp: Date.now() })
      logger.info('✅ Connected to A2A server via official SDK')
    } catch (error) {
      logger.error('Failed to connect to A2A server', error)
      throw error
    }
  }

  /**
   * Disconnect from A2A server
   */
  async disconnect(): Promise<void> {
    this.connected = false
    this.client = null
    this.emit('disconnected')
    logger.info('Disconnected from A2A server')
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  /**
   * Send a message and get response (non-streaming)
   */
  async sendMessage(params: MessageSendParams): Promise<unknown> {
    if (!this.client) {
      throw new Error('A2A client not connected')
    }

    try {
      const response = await this.client.sendMessage(params)
      return response
    } catch (error) {
      logger.error('Failed to send A2A message', error)
      throw error
    }
  }

  /**
   * Send a message with streaming support
   */
  async *sendMessageStream(params: MessageSendParams): AsyncIterable<unknown> {
    if (!this.client) {
      throw new Error('A2A client not connected')
    }

    try {
      const stream = this.client.sendMessageStream(params)
      for await (const event of stream) {
        yield event
      }
    } catch (error) {
      logger.error('Failed to stream A2A message', error)
      throw error
    }
  }

  /**
   * Generic JSON-RPC request sender
   * Maps to the official SDK's message system
   */
  async sendRequest<T = JsonRpcResult>(method: string, params?: unknown): Promise<T> {
    if (!this.client) {
      throw new Error('A2A client not connected')
    }

    try {
      // Convert JSON-RPC method to A2A message format
      const textPart: TextPart = {
        kind: 'text',
        text: JSON.stringify({
          method,
          params
        })
      }

      const messageParams: MessageSendParams = {
        message: {
          kind: 'message',
          messageId: `msg-${Date.now()}`,
          contextId: this.config.agentId || 'babylon-context',
          role: 'user',
          parts: [textPart]
        },
        configuration: {
          blocking: true,
          acceptedOutputModes: ['text/plain', 'application/json']
        }
      }

      const response = await this.sendMessage(messageParams)
      
      // Extract result from task
      if (response && typeof response === 'object' && 'result' in response) {
        const result = response.result as { parts?: Array<{ kind: string; text?: string }> }
        if (result && result.parts) {
          const textPart = result.parts.find(p => p.kind === 'text')
          if (textPart && textPart.text) {
            return JSON.parse(textPart.text) as T
          }
        }
      }
      
      return response as T
    } catch (error) {
      logger.error('Failed to send A2A request', error, 'A2AClient')
      throw error
    }
  }

  // ==================== Babylon-Specific Methods ====================
  // These maintain compatibility with the legacy custom client

  async discoverAgents(filters?: {
    strategies?: string[]
    minReputation?: number
    markets?: string[]
  }, limit?: number): Promise<{ agents: AgentProfile[]; total: number }> {
    return this.sendRequest('a2a.discover', filters || limit ? { filters, limit } : {})
  }

  async getAgentInfo(agentId: string): Promise<AgentProfile> {
    return this.sendRequest('a2a.getInfo', { agentId })
  }

  async getMarketData(marketId: string): Promise<MarketData> {
    return this.sendRequest('a2a.getMarketData', { marketId })
  }

  async getMarketPrices(marketId: string): Promise<{ marketId: string; prices: number[]; timestamp: number }> {
    return this.sendRequest('a2a.getMarketPrices', { marketId })
  }

  async subscribeMarket(marketId: string): Promise<{ subscribed: boolean; marketId: string }> {
    const result = await this.sendRequest<{ subscribed: boolean; marketId: string }>(
      'a2a.subscribeMarket',
      { marketId }
    )

    this.on('market_update', (data: { marketId: string }) => {
      if (data.marketId === marketId) {
        this.emit('market_update', data)
      }
    })

    return result
  }

  async proposeCoalition(
    name: string,
    targetMarket: string,
    strategy: string,
    minMembers: number,
    maxMembers: number
  ): Promise<{ coalitionId: string; proposal: Coalition }> {
    return this.sendRequest('a2a.proposeCoalition', {
      name,
      targetMarket,
      strategy,
      minMembers,
      maxMembers
    })
  }

  async joinCoalition(coalitionId: string): Promise<{ joined: boolean; coalition: Coalition }> {
    return this.sendRequest('a2a.joinCoalition', { coalitionId })
  }

  async sendCoalitionMessage(
    coalitionId: string,
    messageType: 'analysis' | 'vote' | 'action' | 'coordination',
    content: Record<string, JsonValue>
  ): Promise<{ delivered: boolean; recipients: number }> {
    return this.sendRequest('a2a.sendCoalitionMessage', {
      coalitionId,
      messageType,
      content
    })
  }

  async leaveCoalition(coalitionId: string): Promise<{ left: boolean }> {
    return this.sendRequest('a2a.leaveCoalition', { coalitionId })
  }

  async shareAnalysis(analysis: MarketAnalysis): Promise<{ shared: boolean; analysisId: string }> {
    return this.sendRequest('a2a.shareAnalysis', { analysis })
  }

  async requestAnalysis(
    marketId: string,
    paymentOffer?: string,
    deadline?: number
  ): Promise<{ requestId: string; broadcasted: boolean }> {
    return this.sendRequest('a2a.requestAnalysis', {
      marketId,
      paymentOffer: paymentOffer || null,
      deadline: deadline || Date.now() + 3600000
    })
  }

  async getUserBalance(userId?: string): Promise<{ 
    balance: number
    totalDeposited: number
    totalWithdrawn: number
    lifetimePnL: number
    reputationPoints?: number
  }> {
    return this.sendRequest('a2a.getBalance', userId ? { userId } : undefined)
  }

  async getUserPositions(userId: string): Promise<{
    marketPositions: Array<{
      id: string
      marketId: string
      question: string
      side: string
      shares: number
      avgPrice: number
      currentPrice: number
      unrealizedPnL: number
    }>
    perpPositions: Array<{
      id: string
      ticker: string
      side: string
      size: number
      entryPrice: number
      currentPrice: number
      leverage: number
      unrealizedPnL: number
      liquidationPrice: number
    }>
  }> {
    return this.sendRequest('a2a.getPositions', { userId })
  }

  async getUserWallet(userId: string): Promise<{
    balance: {
      balance: number
      totalDeposited: number
      totalWithdrawn: number
      lifetimePnL: number
      reputationPoints: number
    }
    positions: {
      marketPositions: unknown[]
      perpPositions: unknown[]
    }
  }> {
    return this.sendRequest('a2a.getUserWallet', { userId })
  }

  async requestPayment(
    to: string,
    amount: string,
    service: string,
    metadata?: Record<string, JsonValue>
  ): Promise<{ requestId: string; amount: string; expiresAt: number }> {
    return this.sendRequest('a2a.requestPayment', {
      to,
      amount,
      service,
      metadata: metadata || {}
    })
  }

  async submitPaymentReceipt(
    requestId: string,
    txHash: string
  ): Promise<{ verified: boolean; message: string }> {
    return this.sendRequest('a2a.submitPaymentReceipt', {
      requestId,
      txHash
    })
  }

  /**
   * Get the underlying official SDK client
   * For advanced use cases that need direct SDK access
   */
  getOfficialClient(): OfficialA2AClient | null {
    return this.client
  }

  /**
   * Get agent ID (for backward compatibility)
   */
  getAgentId(): string | null {
    // Official SDK doesn't expose agentId the same way
    // Return null for now, can be enhanced if needed
    return null
  }

  /**
   * Get session token (for backward compatibility)
   */
  getSessionToken(): string | null {
    // Official SDK handles auth internally
    return null
  }
}

/**
 * Create a Babylon A2A client with agent card discovery
 */
export async function createBabylonA2AClient(config: BabylonA2AClientConfig): Promise<BabylonA2AClient> {
  const client = new BabylonA2AClient(config)
  await client.connect()
  return client
}


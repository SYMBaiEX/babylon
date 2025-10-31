/**
 * A2A Message Router
 * Routes JSON-RPC 2.0 messages to appropriate handlers
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  A2AMethod,
  A2AServerConfig,
  AgentConnection,
  ErrorCode,
  AgentProfile,
  MarketData,
  Coalition,
  MarketAnalysis
} from '../types'
import { RegistryClient } from '../blockchain/registry-client'
import { X402Manager } from '../payments/x402-manager'

export class MessageRouter {
  private config: Required<A2AServerConfig>
  private registryClient: RegistryClient | null = null
  private x402Manager: X402Manager | null = null
  private marketSubscriptions: Map<string, Set<string>> = new Map() // marketId -> Set of agentIds
  private coalitions: Map<string, Coalition> = new Map()

  constructor(
    config: Required<A2AServerConfig>,
    registryClient?: RegistryClient,
    x402Manager?: X402Manager
  ) {
    this.config = config
    this.registryClient = registryClient || null
    this.x402Manager = x402Manager || null
  }

  /**
   * Route incoming JSON-RPC message to appropriate handler
   */
  async route(
    agentId: string,
    request: JsonRpcRequest,
    connection: AgentConnection
  ): Promise<JsonRpcResponse> {
    try {
      // Route to method handler
      switch (request.method) {
        // Agent Discovery
        case A2AMethod.DISCOVER_AGENTS:
          return await this.handleDiscover(agentId, request)
        case A2AMethod.GET_AGENT_INFO:
          return await this.handleGetAgentInfo(agentId, request)

        // Market Operations
        case A2AMethod.GET_MARKET_DATA:
          return await this.handleGetMarketData(agentId, request)
        case A2AMethod.GET_MARKET_PRICES:
          return await this.handleGetMarketPrices(agentId, request)
        case A2AMethod.SUBSCRIBE_MARKET:
          return await this.handleSubscribeMarket(agentId, request)

        // Coalition Operations
        case A2AMethod.PROPOSE_COALITION:
          return await this.handleProposeCoalition(agentId, request)
        case A2AMethod.JOIN_COALITION:
          return await this.handleJoinCoalition(agentId, request)
        case A2AMethod.COALITION_MESSAGE:
          return await this.handleCoalitionMessage(agentId, request)
        case A2AMethod.LEAVE_COALITION:
          return await this.handleLeaveCoalition(agentId, request)

        // Information Sharing
        case A2AMethod.SHARE_ANALYSIS:
          return await this.handleShareAnalysis(agentId, request)
        case A2AMethod.REQUEST_ANALYSIS:
          return await this.handleRequestAnalysis(agentId, request)

        // x402 Micropayments
        case A2AMethod.PAYMENT_REQUEST:
          return await this.handlePaymentRequest(agentId, request)
        case A2AMethod.PAYMENT_RECEIPT:
          return await this.handlePaymentReceipt(agentId, request)

        default:
          return this.errorResponse(
            request.id,
            ErrorCode.METHOD_NOT_FOUND,
            `Method ${request.method} not found`
          )
      }
    } catch (error) {
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal error'
      )
    }
  }

  // ==================== Agent Discovery ====================

  private async handleDiscover(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      filters?: {
        strategies?: string[]
        minReputation?: number
        markets?: string[]
      }
      limit?: number
    }

    let agents: AgentProfile[] = []

    // Query ERC-8004 registry if available
    if (this.registryClient) {
      agents = await this.registryClient.discoverAgents(params.filters)

      // Apply limit if specified
      if (params.limit && params.limit > 0) {
        agents = agents.slice(0, params.limit)
      }
    }

    return {
      jsonrpc: '2.0',
      result: {
        agents,
        total: agents.length
      },
      id: request.id
    }
  }

  private async handleGetAgentInfo(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { agentId: string }

    // Query ERC-8004 registry if available
    if (this.registryClient) {
      // Extract token ID from agentId (format: "agent-{tokenId}")
      const tokenId = parseInt(params.agentId.replace('agent-', ''))
      if (!isNaN(tokenId)) {
        const profile = await this.registryClient.getAgentProfile(tokenId)
        if (profile) {
          return {
            jsonrpc: '2.0',
            result: profile,
            id: request.id
          }
        }
      }
    }

    return this.errorResponse(
      request.id,
      ErrorCode.AGENT_NOT_FOUND,
      `Agent ${params.agentId} not found`
    )
  }

  // ==================== Market Operations ====================

  private async handleGetMarketData(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { marketId: string }

    // TODO: Query blockchain for market data
    const marketData: MarketData = {
      marketId: params.marketId,
      question: '',
      outcomes: [],
      prices: [],
      volume: '0',
      liquidity: '0',
      resolveAt: 0,
      resolved: false
    }

    return {
      jsonrpc: '2.0',
      result: marketData,
      id: request.id
    }
  }

  private async handleGetMarketPrices(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { marketId: string }

    // TODO: Calculate current prices from blockchain state
    return {
      jsonrpc: '2.0',
      result: {
        marketId: params.marketId,
        prices: [],
        timestamp: Date.now()
      },
      id: request.id
    }
  }

  private async handleSubscribeMarket(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { marketId: string }

    // Add agent to subscription set for this market
    if (!this.marketSubscriptions.has(params.marketId)) {
      this.marketSubscriptions.set(params.marketId, new Set())
    }
    this.marketSubscriptions.get(params.marketId)!.add(agentId)

    return {
      jsonrpc: '2.0',
      result: {
        subscribed: true,
        marketId: params.marketId
      },
      id: request.id
    }
  }

  // ==================== Coalition Operations ====================

  private async handleProposeCoalition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      name: string
      targetMarket: string
      strategy: string
      minMembers: number
      maxMembers: number
    }

    const coalitionId = `coalition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const coalition: Coalition = {
      id: coalitionId,
      name: params.name,
      members: [agentId],
      strategy: params.strategy,
      targetMarket: params.targetMarket,
      createdAt: Date.now(),
      active: true
    }

    this.coalitions.set(coalitionId, coalition)

    return {
      jsonrpc: '2.0',
      result: {
        coalitionId,
        proposal: coalition
      },
      id: request.id
    }
  }

  private async handleJoinCoalition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { coalitionId: string }

    const coalition = this.coalitions.get(params.coalitionId)
    if (!coalition) {
      return this.errorResponse(
        request.id,
        ErrorCode.COALITION_NOT_FOUND,
        'Coalition not found'
      )
    }

    // Add member if not already present
    if (!coalition.members.includes(agentId)) {
      coalition.members.push(agentId)
    }

    return {
      jsonrpc: '2.0',
      result: {
        joined: true,
        coalition
      },
      id: request.id
    }
  }

  private async handleCoalitionMessage(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      coalitionId: string
      messageType: 'analysis' | 'vote' | 'action' | 'coordination'
      content: unknown
    }

    const coalition = this.coalitions.get(params.coalitionId)
    if (!coalition) {
      return this.errorResponse(
        request.id,
        ErrorCode.COALITION_NOT_FOUND,
        'Coalition not found'
      )
    }

    if (!coalition.members.includes(agentId)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Agent not a member of coalition'
      )
    }

    // TODO: Broadcast message to coalition members

    return {
      jsonrpc: '2.0',
      result: {
        delivered: true,
        recipients: coalition.members.length - 1
      },
      id: request.id
    }
  }

  private async handleLeaveCoalition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as { coalitionId: string }

    const coalition = this.coalitions.get(params.coalitionId)
    if (!coalition) {
      return this.errorResponse(
        request.id,
        ErrorCode.COALITION_NOT_FOUND,
        'Coalition not found'
      )
    }

    // Remove member
    coalition.members = coalition.members.filter(id => id !== agentId)

    // Deactivate if no members left
    if (coalition.members.length === 0) {
      coalition.active = false
    }

    return {
      jsonrpc: '2.0',
      result: {
        left: true
      },
      id: request.id
    }
  }

  // ==================== Information Sharing ====================

  private async handleShareAnalysis(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as MarketAnalysis

    // TODO: Store and distribute analysis to interested parties

    return {
      jsonrpc: '2.0',
      result: {
        shared: true,
        analysisId: `analysis-${Date.now()}`
      },
      id: request.id
    }
  }

  private async handleRequestAnalysis(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      marketId: string
      paymentOffer?: string
      deadline: number
    }

    // TODO: Broadcast analysis request to capable agents

    return {
      jsonrpc: '2.0',
      result: {
        requestId: `request-${Date.now()}`,
        broadcasted: true
      },
      id: request.id
    }
  }

  // ==================== x402 Micropayments ====================

  private async handlePaymentRequest(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      to: string
      amount: string
      service: string
      metadata?: Record<string, unknown>
    }

    if (!this.config.enableX402) {
      return this.errorResponse(
        request.id,
        ErrorCode.METHOD_NOT_FOUND,
        'x402 payments not enabled'
      )
    }

    if (!this.x402Manager) {
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Payment system not configured'
      )
    }

    try {
      // Get agent address from agentId (format: "agent-{tokenId}")
      const connection = params as unknown as { from?: string }
      const from = connection.from || ''

      // Create payment request via x402 manager
      const paymentRequest = this.x402Manager.createPaymentRequest(
        from,
        params.to,
        params.amount,
        params.service,
        params.metadata
      )

      return {
        jsonrpc: '2.0',
        result: {
          requestId: paymentRequest.requestId,
          amount: paymentRequest.amount,
          expiresAt: paymentRequest.expiresAt
        },
        id: request.id
      }
    } catch (error) {
      return this.errorResponse(
        request.id,
        ErrorCode.PAYMENT_FAILED,
        error instanceof Error ? error.message : 'Payment request failed'
      )
    }
  }

  private async handlePaymentReceipt(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as {
      requestId: string
      txHash: string
    }

    if (!this.config.enableX402) {
      return this.errorResponse(
        request.id,
        ErrorCode.METHOD_NOT_FOUND,
        'x402 payments not enabled'
      )
    }

    if (!this.x402Manager) {
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Payment system not configured'
      )
    }

    try {
      // Get payment request details
      const paymentRequest = this.x402Manager.getPaymentRequest(params.requestId)
      if (!paymentRequest) {
        return this.errorResponse(
          request.id,
          ErrorCode.PAYMENT_FAILED,
          'Payment request not found or expired'
        )
      }

      // Verify payment on blockchain
      const verificationResult = await this.x402Manager.verifyPayment({
        requestId: params.requestId,
        txHash: params.txHash,
        from: paymentRequest.from,
        to: paymentRequest.to,
        amount: paymentRequest.amount,
        timestamp: Date.now(),
        confirmed: false // Will be checked by verifyPayment
      })

      if (!verificationResult.verified) {
        return {
          jsonrpc: '2.0',
          result: {
            verified: false,
            message: verificationResult.error || 'Payment verification failed'
          },
          id: request.id
        }
      }

      return {
        jsonrpc: '2.0',
        result: {
          verified: true,
          message: 'Payment verified successfully'
        },
        id: request.id
      }
    } catch (error) {
      return this.errorResponse(
        request.id,
        ErrorCode.PAYMENT_FAILED,
        error instanceof Error ? error.message : 'Payment verification failed'
      )
    }
  }

  // ==================== Utility Methods ====================

  private errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      error: {
        code,
        message
      },
      id
    }
  }

  /**
   * Get subscribers for a market (used by server for notifications)
   */
  getMarketSubscribers(marketId: string): string[] {
    const subscribers = this.marketSubscriptions.get(marketId)
    return subscribers ? Array.from(subscribers) : []
  }

  /**
   * Get active coalitions for an agent
   */
  getAgentCoalitions(agentId: string): Coalition[] {
    return Array.from(this.coalitions.values()).filter(
      c => c.active && c.members.includes(agentId)
    )
  }
}

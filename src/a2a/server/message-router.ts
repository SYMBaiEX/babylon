/**
 * A2A Message Router
 * Routes JSON-RPC 2.0 messages to appropriate handlers
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  A2AServerConfig,
  AgentConnection,
  AgentProfile,
  MarketData,
  Coalition,
  MarketAnalysis
} from '../types';
import {
  A2AMethod,
  ErrorCode
} from '../types'
import type { JsonRpcResult } from '@/types/json-rpc'
import type { PaymentVerificationParams, PaymentVerificationResult } from '@/types/payments'
import type { RegistryClient } from '@/types/a2a-server'
import type { X402Manager } from '@/types/a2a-server'
import { logger } from '../utils/logger'

// Typed parameter interfaces for each method
interface DiscoverParams {
  filters?: {
    strategies?: string[]
    minReputation?: number
    markets?: string[]
  }
  limit?: number
}

interface GetAgentInfoParams {
  agentId: string
}

interface GetMarketDataParams {
  marketId: string
}

interface GetMarketPricesParams {
  marketId: string
}

interface SubscribeMarketParams {
  marketId: string
}

interface ProposeCoalitionParams {
  name: string
  targetMarket: string
  strategy: string
  minMembers: number
  maxMembers: number
}

interface JoinCoalitionParams {
  coalitionId: string
}

interface CoalitionMessageParams {
  coalitionId: string
  messageType: 'analysis' | 'vote' | 'action' | 'coordination'
  content: Record<string, string | number | boolean | null>
}

interface LeaveCoalitionParams {
  coalitionId: string
}

interface RequestAnalysisParams {
  marketId: string
  paymentOffer?: string
  deadline: number
}

interface PaymentRequestParams {
  to: string
  amount: string
  service: string
  metadata?: Record<string, string | number | boolean | null>
  from?: string
}

interface PaymentReceiptParams {
  requestId: string
  txHash: string
}

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
      // Validate connection is authenticated
      if (!connection.authenticated) {
        return this.errorResponse(
          request.id,
          ErrorCode.NOT_AUTHENTICATED,
          'Connection not authenticated'
        )
      }

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

  // ==================== Helper Methods ====================

  /**
   * Log request for tracking and debugging
   */
  private logRequest(agentId: string, method: string): void {
    logger.debug(`Agent ${agentId} -> ${method}`)
  }

  // ==================== Agent Discovery ====================

  private async handleDiscover(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.DISCOVER_AGENTS)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const discoverRequest = request.params as DiscoverParams
    let agents: AgentProfile[] = []

    // Query ERC-8004 registry if available
    if (this.registryClient) {
      if (this.registryClient?.discoverAgents) {
        agents = await this.registryClient.discoverAgents(discoverRequest.filters)
      }

      // Apply limit if specified
      if (discoverRequest.limit && discoverRequest.limit > 0) {
        agents = agents.slice(0, discoverRequest.limit)
      }
    }

    return {
      jsonrpc: '2.0',
      result: {
        agents,
        total: agents.length
      } as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleGetAgentInfo(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_AGENT_INFO)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const agentInfo = request.params as unknown as GetAgentInfoParams
    
    if (!agentInfo.agentId || typeof agentInfo.agentId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: agentId is required'
      )
    }
    // Query ERC-8004 registry if available
    if (this.registryClient) {
      // Extract token ID from agentId (format: "agent-{tokenId}")
      const tokenId = parseInt(agentInfo.agentId.replace('agent-', ''))
      if (!isNaN(tokenId)) {
        const profile = this.registryClient?.getAgentProfile 
          ? await this.registryClient.getAgentProfile(tokenId)
          : null
        if (profile) {
          return {
            jsonrpc: '2.0',
            result: profile as unknown as JsonRpcResult,
            id: request.id
          }
        }
      }
    }

    return this.errorResponse(
      request.id,
      ErrorCode.AGENT_NOT_FOUND,
        `Agent ${agentInfo.agentId} not found`
    )
  }

  // ==================== Market Operations ====================

  private async handleGetMarketData(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_MARKET_DATA)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const marketRequest = request.params as unknown as GetMarketDataParams
    
    if (!marketRequest.marketId || typeof marketRequest.marketId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: marketId is required'
      )
    }

    // TODO: Query blockchain for market data
    const marketData: MarketData = {
      marketId: marketRequest.marketId,
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
      result: marketData as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleGetMarketPrices(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_MARKET_PRICES)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const pricesRequest = request.params as unknown as GetMarketPricesParams
    
    if (!pricesRequest.marketId || typeof pricesRequest.marketId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: marketId is required'
      )
    }
    // TODO: Calculate current prices from blockchain state
    return {
      jsonrpc: '2.0',
      result: {
        marketId: pricesRequest.marketId,
        prices: [],
        timestamp: Date.now()
      },
      id: request.id
    }
  }

  private async handleSubscribeMarket(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.SUBSCRIBE_MARKET)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const subscriptionRequest = request.params as unknown as SubscribeMarketParams
    
    if (!subscriptionRequest.marketId || typeof subscriptionRequest.marketId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: marketId is required'
      )
    }

    // Add agent to subscription set for this market
    if (!this.marketSubscriptions.has(subscriptionRequest.marketId)) {
      this.marketSubscriptions.set(subscriptionRequest.marketId, new Set())
    }
    this.marketSubscriptions.get(subscriptionRequest.marketId)!.add(agentId)
    return {
      jsonrpc: '2.0',
      result: {
        subscribed: true,
        marketId: subscriptionRequest.marketId
      },
      id: request.id
    }
  }

  // ==================== Coalition Operations ====================

  private async handleProposeCoalition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.PROPOSE_COALITION)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const proposal = request.params as unknown as ProposeCoalitionParams
    
    if (!proposal.name || !proposal.targetMarket || !proposal.strategy) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: name, targetMarket, and strategy are required'
      )
    }
    const coalitionId = `coalition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const coalition: Coalition = {
      id: coalitionId,
      name: proposal.name,
      members: [agentId],
      strategy: proposal.strategy,
      targetMarket: proposal.targetMarket,
      createdAt: Date.now(),
      active: true
    }

    this.coalitions.set(coalitionId, coalition)

    return {
      jsonrpc: '2.0',
      result: {
        coalitionId,
        proposal: coalition
      } as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleJoinCoalition(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.JOIN_COALITION)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const joinRequest = request.params as unknown as JoinCoalitionParams
    
    if (!joinRequest.coalitionId || typeof joinRequest.coalitionId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: coalitionId is required'
      )
    }

    const coalition = this.coalitions.get(joinRequest.coalitionId)
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
      } as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleCoalitionMessage(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.COALITION_MESSAGE)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const messageData = request.params as unknown as CoalitionMessageParams
    
    if (!messageData.coalitionId || !messageData.messageType) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: coalitionId and messageType are required'
      )
    }

    const coalition = this.coalitions.get(messageData.coalitionId)
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
    this.logRequest(agentId, A2AMethod.LEAVE_COALITION)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const leaveRequest = request.params as unknown as LeaveCoalitionParams
    
    if (!leaveRequest.coalitionId || typeof leaveRequest.coalitionId !== 'string') {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: coalitionId is required'
      )
    }

    const coalition = this.coalitions.get(leaveRequest.coalitionId)
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
    this.logRequest(agentId, A2AMethod.SHARE_ANALYSIS)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const analysis = request.params as unknown as MarketAnalysis

    // Validate analysis has required fields
    if (!analysis.marketId || !analysis.timestamp) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Analysis must include marketId and timestamp'
      )
    }

    // TODO: Store and distribute analysis to interested parties
    // For now, log the analysis details
    logger.info(`Agent ${agentId} shared analysis for market ${analysis.marketId}`)
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
    this.logRequest(agentId, A2AMethod.REQUEST_ANALYSIS)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const analysisRequest = request.params as unknown as RequestAnalysisParams
    
    if (!analysisRequest.marketId || !analysisRequest.deadline) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Analysis request must include marketId and deadline'
      )
    }

    // TODO: Broadcast analysis request to capable agents
    // For now, log the request details
    logger.info(`Agent ${agentId} requesting analysis for market ${analysisRequest.marketId}, deadline: ${analysisRequest.deadline}`)
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
    this.logRequest(agentId, A2AMethod.PAYMENT_REQUEST)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const paymentRequest = request.params as unknown as PaymentRequestParams
    
    if (!paymentRequest.to || !paymentRequest.amount || !paymentRequest.service) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: to, amount, and service are required'
      )
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
      const from = paymentRequest.from || ''

      // Create payment request via x402 manager
      const createdPaymentRequest = this.x402Manager.createPaymentRequest(
        from,
        paymentRequest.to,
        paymentRequest.amount,
        paymentRequest.service,
        paymentRequest.metadata as Record<string, string | number | boolean | null> | undefined
      )

      return {
        jsonrpc: '2.0',
        result: {
          requestId: createdPaymentRequest.requestId,
          amount: createdPaymentRequest.amount,
          expiresAt: createdPaymentRequest.expiresAt
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
    this.logRequest(agentId, A2AMethod.PAYMENT_RECEIPT)
    
    // Validate and type params
    if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: expected object'
      )
    }
    
    const receipt = request.params as unknown as PaymentReceiptParams
    
    if (!receipt.requestId || !receipt.txHash) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: requestId and txHash are required'
      )
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
      const storedPaymentRequest = this.x402Manager.getPaymentRequest(receipt.requestId)
      if (!storedPaymentRequest) {
        return this.errorResponse(
          request.id,
          ErrorCode.PAYMENT_FAILED,
          'Payment request not found or expired'
        )
      }

      // Verify payment on blockchain
      const verificationData: PaymentVerificationParams = {
        requestId: receipt.requestId,
        txHash: receipt.txHash,
        from: storedPaymentRequest.from,
        to: storedPaymentRequest.to,
        amount: storedPaymentRequest.amount,
        timestamp: Date.now(),
        confirmed: false // Will be checked by verifyPayment
      }
      const verificationResult: PaymentVerificationResult = await this.x402Manager.verifyPayment(verificationData)

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

/**
 * A2A Client
 * Client library for agents to connect to A2A servers
 */

import { logger } from '@/lib/logger';
import type { JsonValue, JsonRpcParams, JsonRpcResult } from '@/types/common';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type {
  A2AClientConfig,
  AgentProfile,
  Coalition,
  JsonRpcRequest,
  MarketAnalysis,
  MarketData
} from '../types';
import {
  A2AEventType,
  A2AMethod
} from '../types';
import { z } from 'zod';

// Zod schema for JsonRpcResponse for robust type checking
const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

export class A2AClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<A2AClientConfig>
  private agentId: string | null = null
  private _sessionToken: string | null = null
  private messageId = 0
  private pendingRequests: Map<string | number, {
    resolve: (value: JsonRpcResult) => void
    reject: (reason: Error) => void
  }> = new Map()
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(config: A2AClientConfig) {
    super()

    // Set defaults
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000,
      ...config
    }
  }

  /**
   * Connect to A2A server and authenticate
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.endpoint)

      this.ws.on('open', async () => {
        await this.performHandshake()
        this.setupHeartbeat()
        resolve()
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('close', () => {
        this.handleDisconnect()
      })

      this.ws.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Perform handshake and authentication
   */
  private async performHandshake(): Promise<void> {
    const timestamp = Date.now()
    const message = this.createAuthMessage(
      this.config.credentials.address,
      this.config.credentials.tokenId || 0,
      timestamp
    )

    const wallet = new ethers.Wallet(this.config.credentials.privateKey)
    const signature = await wallet.signMessage(message)

    const response = await this.sendRequest<{
      agentId: string
      sessionToken: string
      serverCapabilities: string[]
      expiresAt: number
    }>(A2AMethod.HANDSHAKE, {
      credentials: {
        address: this.config.credentials.address,
        tokenId: this.config.credentials.tokenId || 0,
        signature,
        timestamp
      },
      capabilities: this.config.capabilities,
      endpoint: this.config.endpoint
    } as unknown as JsonRpcParams)

    this.agentId = response.agentId
    this._sessionToken = response.sessionToken

    this.emit(A2AEventType.AGENT_CONNECTED, {
      agentId: this.agentId,
      serverCapabilities: response.serverCapabilities
    })
  }

  /**
   * Create authentication message for signing
   */
  private createAuthMessage(address: string, tokenId: number, timestamp: number): string {
    return `A2A Authentication\n\nAddress: ${address}\nToken ID: ${tokenId}\nTimestamp: ${timestamp}`
  }


  /**
   * Handle incoming message
   */
  private handleMessage(data: Buffer): void {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      logger.error('Failed to parse incoming JSON message', { data: data.toString() });
      return;
    }
    const validation = JsonRpcResponseSchema.safeParse(message);
    if (!validation.success) {
      logger.error('Received invalid JSON-RPC response', { data: message, error: validation.error });
      return;
    }

    const validatedMessage = validation.data;

    if (validatedMessage.id !== undefined && validatedMessage.id !== null) {
      const pending = this.pendingRequests.get(validatedMessage.id)
      if (pending) {
        this.pendingRequests.delete(validatedMessage.id)

        if (validatedMessage.error) {
          pending.reject(new Error(validatedMessage.error.message))
        } else {
          pending.resolve(validatedMessage.result ?? null)
        }
      }
    }

    if (this.isJsonRpcNotification(message)) {
      this.handleNotification(message as JsonRpcRequest)
    }
  }

  private isJsonRpcNotification(message: unknown): message is JsonRpcRequest {
    if (typeof message !== 'object' || message === null) {
      return false;
    }
    const msg = message as Record<string, unknown>;
    return msg.id === null && typeof msg.method === 'string' && msg.jsonrpc === '2.0';
  }

  /**
   * Handle server notifications
   */
  private handleNotification(notification: JsonRpcRequest): void {
    // Handle different notification types with typed events
    const method = notification.method
    const params = notification.params
    
    switch (method) {
      case 'a2a.market_update':
        this.emit(A2AEventType.MARKET_UPDATE, params)
        break
        
      case 'a2a.coalition_notification':
        this.emit(A2AEventType.COALITION_MESSAGE, params)
        break
        
      case 'a2a.analysis_shared':
        this.emit(A2AEventType.ANALYSIS_RECEIVED, params)
        break
        
      case 'a2a.analysis_requested':
        this.emit('analysis_requested', params)
        break
        
      case 'a2a.agent_connected':
        this.emit(A2AEventType.AGENT_CONNECTED, params)
        break
        
      case 'a2a.agent_disconnected':
        this.emit(A2AEventType.AGENT_DISCONNECTED, params)
        break
        
      default:
        // Generic notification for unknown types
        this.emit('notification', notification)
        logger.debug(`Received unhandled notification type: ${method}`)
    }
  }

  /**
   * Handle disconnect and attempt reconnect
   */
  private handleDisconnect(): void {
    this.ws = null
    this.agentId = null
    this._sessionToken = null

    this.emit(A2AEventType.AGENT_DISCONNECTED, {})

    if (this.config.autoReconnect) {
      this.reconnectTimer = setTimeout(async () => {
        await this.connect()
      }, this.config.reconnectInterval)
    }
  }

  /**
   * Setup heartbeat to keep connection alive
   */
  private setupHeartbeat(): void {
    if (this.config.heartbeatInterval) {
      setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping()
        }
      }, this.config.heartbeatInterval)
    }
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  private sendRequest<T = JsonRpcResult>(method: string, params?: JsonRpcParams): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id
      }

      this.pendingRequests.set(id, { resolve: resolve as (value: JsonRpcResult) => void, reject })

      this.ws!.send(JSON.stringify(request))

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  // ==================== Agent Discovery ====================

  async discoverAgents(filters?: {
    strategies?: string[]
    minReputation?: number
    markets?: string[]
  }, limit?: number): Promise<{ agents: AgentProfile[]; total: number }> {
    const params: JsonRpcParams = {};
    if (filters) {
      params.filters = filters;
    }
    if (limit !== undefined) {
      params.limit = limit;
    }
    return this.sendRequest(A2AMethod.DISCOVER_AGENTS, Object.keys(params).length > 0 ? params : undefined)
  }

  async getAgentInfo(agentId: string): Promise<AgentProfile> {
    return this.sendRequest(A2AMethod.GET_AGENT_INFO, { agentId })
  }

  // ==================== Market Operations ====================

  async getMarketData(marketId: string): Promise<MarketData> {
    return this.sendRequest(A2AMethod.GET_MARKET_DATA, { marketId })
  }

  async getMarketPrices(marketId: string): Promise<{ marketId: string; prices: number[]; timestamp: number }> {
    return this.sendRequest(A2AMethod.GET_MARKET_PRICES, { marketId })
  }

  async subscribeMarket(marketId: string): Promise<{ subscribed: boolean; marketId: string }> {
    const result = await this.sendRequest<{ subscribed: boolean; marketId: string }>(
      A2AMethod.SUBSCRIBE_MARKET,
      { marketId }
    )

    this.on(A2AEventType.MARKET_UPDATE, (data: { marketId: string }) => {
      if (data.marketId === marketId) {
        this.emit('market_update', data)
      }
    })

    return result
  }

  // ==================== Coalition Operations ====================

  async proposeCoalition(
    name: string,
    targetMarket: string,
    strategy: string,
    minMembers: number,
    maxMembers: number
  ): Promise<{ coalitionId: string; proposal: Coalition }> {
    return this.sendRequest(A2AMethod.PROPOSE_COALITION, {
      name,
      targetMarket,
      strategy,
      minMembers,
      maxMembers
    })
  }

  async joinCoalition(coalitionId: string): Promise<{ joined: boolean; coalition: Coalition }> {
    return this.sendRequest(A2AMethod.JOIN_COALITION, { coalitionId })
  }

  async sendCoalitionMessage(
    coalitionId: string,
    messageType: 'analysis' | 'vote' | 'action' | 'coordination',
    content: Record<string, JsonValue>
  ): Promise<{ delivered: boolean; recipients: number }> {
    return this.sendRequest(A2AMethod.COALITION_MESSAGE, {
      coalitionId,
      messageType,
      content
    })
  }

  async leaveCoalition(coalitionId: string): Promise<{ left: boolean }> {
    return this.sendRequest(A2AMethod.LEAVE_COALITION, { coalitionId })
  }

  // ==================== Information Sharing ====================

  async shareAnalysis(analysis: MarketAnalysis): Promise<{ shared: boolean; analysisId: string }> {
    const params: JsonRpcParams = { analysis };
    return this.sendRequest(A2AMethod.SHARE_ANALYSIS, params)
  }

  async requestAnalysis(
    marketId: string,
    paymentOffer?: string,
    deadline?: number
  ): Promise<{ requestId: string; broadcasted: boolean }> {
    const params: JsonRpcParams = {
      marketId,
      paymentOffer: paymentOffer || null,
      deadline: deadline || Date.now() + 3600000
    };
    return this.sendRequest(A2AMethod.REQUEST_ANALYSIS, params)
  }

  // ==================== x402 Micropayments ====================

  async requestPayment(
    to: string,
    amount: string,
    service: string,
    metadata?: Record<string, JsonValue>
  ): Promise<{ requestId: string; amount: string; expiresAt: number }> {
    const params: JsonRpcParams = {
      to,
      amount,
      service,
      metadata: metadata || {}
    };
    return this.sendRequest(A2AMethod.PAYMENT_REQUEST, params)
  }

  async submitPaymentReceipt(
    requestId: string,
    txHash: string
  ): Promise<{ verified: boolean; message: string }> {
    return this.sendRequest(A2AMethod.PAYMENT_RECEIPT, {
      requestId,
      txHash
    })
  }

  // ==================== Connection Management ====================

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      // Wait for the WebSocket to actually close
      await new Promise<void>((resolve) => {
        if (this.ws!.readyState === WebSocket.CLOSED) {
          resolve()
          return
        }

        this.ws!.once('close', () => resolve())
        this.ws!.close()

        // Timeout after 1 second to prevent hanging
        setTimeout(() => resolve(), 1000)
      })

      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  getAgentId(): string | null {
    return this.agentId
  }

  getSessionToken(): string | null {
    return this._sessionToken
  }
}

/**
 * A2A WebSocket Server Implementation
 * 
 * WebSocket-based server for A2A protocol communication.
 * Handles agent connections, authentication, and message routing.
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { RegistryClient } from '@/lib/a2a/blockchain/registry-client'
import { X402Manager } from '@/lib/a2a/payments/x402-manager'
import { MessageRouter } from '@/lib/a2a/message-router'
import { verifyAgentSignature, buildA2AAuthMessage, type AgentLookupFunction } from '@/a2a/utils/auth'
import { logger } from '@/lib/logger'
import type { AgentConnection, JsonRpcRequest } from '@/types/a2a'
import { AgentCapabilitiesSchema } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import { getUnifiedDiscoveryService } from '@/agents/agent0/UnifiedDiscovery'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { getAgentLifecycleManager } from '@/lib/agents/lifecycle/AgentLifecycleManager'
import { HandshakeSchema } from '@/lib/a2a/validation/message-schemas'
import { generateMCPToken } from '@/lib/auth/mcp-auth'
import { z } from 'zod'

export interface A2AWebSocketServerConfig {
  port: number
  host: string
  maxConnections?: number
  messageRateLimit?: number
  authTimeout?: number
  enableX402?: boolean
  enableCoalitions?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  registryClient?: RegistryClient
  x402Manager?: X402Manager
}

interface AuthenticatedWebSocket extends WebSocket {
  agentId?: string
  authenticated?: boolean
  lastMessageTime?: number
  messageCount?: number
  isAlive?: boolean
  connection?: AgentConnection
}

export class A2AWebSocketServer {
  private config: Required<Omit<A2AWebSocketServerConfig, 'registryClient' | 'x402Manager'>> & {
    registryClient?: RegistryClient
    x402Manager?: X402Manager
  }
  private server: WebSocketServer | null = null
  private connections: Map<string, AuthenticatedWebSocket> = new Map()
  private pendingSockets: Set<AuthenticatedWebSocket> = new Set()
  private messageRouter: MessageRouter
  private unifiedDiscovery: ReturnType<typeof getUnifiedDiscoveryService>
  private readyPromise: Promise<void>
  private resolveReady?: () => void
  private pingInterval: NodeJS.Timeout | null = null
  private processedMessages: Set<string> = new Set() // Gap 18: Replay protection

  constructor(config: A2AWebSocketServerConfig) {
    this.config = {
      maxConnections: config.maxConnections ?? 1000,
      messageRateLimit: config.messageRateLimit ?? 100,
      authTimeout: config.authTimeout ?? 30000,
      enableX402: config.enableX402 ?? false,
      enableCoalitions: config.enableCoalitions ?? true,
      logLevel: config.logLevel ?? 'info',
      ...config
    }
    
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve
    })
    
    // Initialize message router
    const unifiedDiscovery = getUnifiedDiscoveryService()
    this.messageRouter = new MessageRouter(
      {
        port: this.config.port,
        host: this.config.host,
        maxConnections: this.config.maxConnections,
        messageRateLimit: this.config.messageRateLimit,
        authTimeout: this.config.authTimeout,
        enableX402: this.config.enableX402,
        enableCoalitions: this.config.enableCoalitions,
        logLevel: this.config.logLevel
      },
      this.config.registryClient,
      this.config.x402Manager,
      undefined, // agent0Client will be injected via unifiedDiscovery
      unifiedDiscovery
    )
    
    // Store unified discovery for agent lookup during authentication
    this.unifiedDiscovery = unifiedDiscovery
    
    logger.info('Creating A2A WebSocket Server', {
      port: config.port,
      host: config.host,
      maxConnections: this.config.maxConnections,
    }, 'A2AServer')
    
    this.initialize()
  }

  private initialize() {
    try {
      this.server = new WebSocketServer({
        port: this.config.port,
        host: this.config.host,
      })

      this.server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws as AuthenticatedWebSocket, req)
      })

      this.server.on('error', (error: Error) => {
        logger.error('WebSocket server error', error, 'A2AServer')
      })

      // Set up ping/pong for keepalive
      this.pingInterval = setInterval(() => {
        this.server?.clients.forEach((client) => {
          const ws = client as AuthenticatedWebSocket
          if (!ws.isAlive) {
            ws.terminate()
            return
          }
          ws.isAlive = false
          ws.ping()
        })
      }, 30000)

      // Mark as ready
      if (this.resolveReady) {
        this.resolveReady()
      }

      logger.info('A2A WebSocket Server initialized', {
        port: this.config.port,
        host: this.config.host,
      }, 'A2AServer')
    } catch (error) {
      logger.error('Failed to initialize A2A WebSocket Server', error, 'A2AServer')
      throw error
    }
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage) {
    ws.isAlive = true
    ws.messageCount = 0
    ws.lastMessageTime = Date.now()

    // Check connection limit against all active sockets (authenticated or not)
    this.pendingSockets.add(ws)

    if (this.getActiveConnectionCount() > this.config.maxConnections) {
      logger.warn('Max connections reached, rejecting new connection', {
        current: this.getActiveConnectionCount(),
        max: this.config.maxConnections
      }, 'A2AServer')
      ws.once('close', (code) => {
        logger.warn('Rejected connection closed', { code }, 'A2AServer')
      })
      this.pendingSockets.delete(ws)
      ws.close(1008, 'Server at capacity')
      return
    }

    // Set up pong handler
    ws.on('pong', () => {
      ws.isAlive = true
    })

    // Set up message handler
    ws.on('message', async (data: Buffer) => {
      await this.handleMessage(ws, data)
    })

    // Set up close handler
    ws.on('close', () => {
      this.pendingSockets.delete(ws)
      if (ws.agentId) {
        this.connections.delete(ws.agentId)
        // Clean up processed messages for this agent
        const keysToDelete: string[] = []
        this.processedMessages.forEach(key => {
          if (key.startsWith(`${ws.agentId}:`)) {
            keysToDelete.push(key)
          }
        })
        keysToDelete.forEach(key => this.processedMessages.delete(key))
        logger.info('Agent disconnected', { agentId: ws.agentId }, 'A2AServer')
      }
    })

    // Set up error handler
    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { error, agentId: ws.agentId }, 'A2AServer')
      if (ws.agentId) {
        this.connections.delete(ws.agentId)
      }
    })

    // Wait for authentication handshake
    await this.handleAuthentication(ws, req)
  }

  private async handleAuthentication(ws: AuthenticatedWebSocket, _req: IncomingMessage) {
    const authTimeout = setTimeout(() => {
      if (!ws.authenticated) {
        logger.warn('Authentication timeout', undefined, 'A2AServer')
        ws.close(1008, 'Authentication timeout')
      }
    }, this.config.authTimeout)
    const cancelAuthTimeout = () => clearTimeout(authTimeout)

    try {
      // Wait for handshake message
      const handshakeData = await this.waitForMessage(ws, this.config.authTimeout)
      const handshake = JSON.parse(handshakeData.toString()) as JsonRpcRequest

      if (handshake.method !== 'a2a.handshake') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: handshake.id,
          error: {
            code: ErrorCode.NOT_AUTHENTICATED,
            message: 'Handshake required'
          }
        }))
        ws.close(1008, 'Handshake required')
        cancelAuthTimeout()
        return
      }

      // Validate handshake params against schema
      const validation = HandshakeSchema.safeParse(handshake.params)
      if (!validation.success) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: handshake.id,
          error: {
            code: ErrorCode.INVALID_PARAMS,
            message: 'Invalid handshake parameters',
            data: validation.error.issues
          }
        }))
        ws.close(1008, 'Invalid handshake')
        cancelAuthTimeout()
        return
      }
      
      const params = validation.data

      // Verify timestamp (must be within 5 minutes)
      const now = Date.now()
      const timeDiff = Math.abs(now - params.timestamp)
      if (timeDiff > 5 * 60 * 1000) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: handshake.id,
          error: {
            code: ErrorCode.EXPIRED_REQUEST,
            message: 'Authentication timestamp expired'
          }
        }))
        ws.close(1008, 'Authentication expired')
        cancelAuthTimeout()
        return
      }

      // Build auth message
      const authMessage = buildA2AAuthMessage(
        params.agentId,
        params.address,
        params.tokenId || 0,
        params.timestamp
      )

      // Create agent lookup function that checks both registry and unified discovery
      const agentLookup: AgentLookupFunction = async (agentId: string) => {
        // Try unified discovery first (includes Agent0 and local registry)
        try {
          const profile = await this.unifiedDiscovery.getAgent(agentId)
          if (profile) {
            return { address: profile.address }
          }
        } catch (error) {
          // Continue to registry check if unified discovery fails
        }
        
        // Try local registry client if available
        if (this.config.registryClient) {
          // Extract token ID from agentId (format: "agent-{tokenId}" or just "{tokenId}")
          const tokenId = parseInt(agentId.replace('agent-', ''), 10)
          if (!isNaN(tokenId) && this.config.registryClient.getAgentProfile) {
            try {
              const profile = await this.config.registryClient.getAgentProfile(tokenId)
              if (profile) {
                return { address: profile.address }
              }
            } catch (error) {
              // Registry lookup failed
            }
          }
        }
        
        return null
      }

      // Verify signature with agent lookup
      const isValid = await verifyAgentSignature(
        params.agentId,
        params.signature,
        authMessage,
        params.address,
        agentLookup
      )
      if (!isValid) {
        logger.warn('Invalid signature for agent', { agentId: params.agentId }, 'A2AServer')
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: handshake.id,
          error: {
            code: ErrorCode.AUTHENTICATION_FAILED,
            message: 'Invalid signature'
          }
        }))
        ws.close(1008, 'Authentication failed')
        cancelAuthTimeout()
        return
      }
      
      // Verify Agent0 registration if enabled and tokenId provided
      if (process.env.AGENT0_ENABLED === 'true' && params.tokenId) {
        try {
          const agent0Client = getAgent0Client()
          const profile = await agent0Client.getAgentProfile(params.tokenId)
          
          if (!profile) {
            logger.warn('Agent not registered in Agent0 network', { 
              agentId: params.agentId, 
              tokenId: params.tokenId 
            }, 'A2AServer')
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: handshake.id,
              error: {
                code: ErrorCode.AGENT_NOT_FOUND,
                message: 'Agent not registered in Agent0 network'
              }
            }))
            ws.close(1008, 'Agent not registered')
            cancelAuthTimeout()
            return
          }
          
          // Verify wallet address matches
          if (profile.walletAddress.toLowerCase() !== params.address.toLowerCase()) {
            logger.warn('Wallet address mismatch', {
              agentId: params.agentId,
              expected: profile.walletAddress,
              provided: params.address
            }, 'A2AServer')
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: handshake.id,
              error: {
                code: ErrorCode.AUTHENTICATION_FAILED,
                message: 'Wallet address mismatch with Agent0 registration'
              }
            }))
            ws.close(1008, 'Address mismatch')
            cancelAuthTimeout()
            return
          }
          
          logger.info('Agent0 registration verified', { 
            agentId: params.agentId, 
            tokenId: params.tokenId 
          }, 'A2AServer')
        } catch (error) {
          logger.error('Agent0 verification failed', error, 'A2AServer')
          // Continue anyway - Agent0 verification is optional
        }
      }

      // Authentication successful
      ws.agentId = params.agentId
      ws.authenticated = true
      this.pendingSockets.delete(ws)
      
      // Parse and validate capabilities
      const capabilitiesResult = params.capabilities 
        ? AgentCapabilitiesSchema.safeParse(params.capabilities)
        : { success: true, data: { strategies: [], markets: [], actions: [], version: '1.0.0' } }
      ws.connection = {
        agentId: params.agentId,
        address: params.address,
        tokenId: params.tokenId || 0,
        capabilities: capabilitiesResult.success ? capabilitiesResult.data : {
          strategies: [],
          markets: [],
          actions: [],
          version: '1.0.0'
        },
        authenticated: true,
        connectedAt: now,
        lastActivity: now
      }

      this.connections.set(params.agentId, ws)

      // Generate proper JWT session token
      const sessionToken = generateMCPToken({
        agentId: params.agentId,
        userId: params.agentId, // For now, agentId is userId
        tokenId: params.tokenId
      })
      
      // Get server capabilities dynamically from MessageRouter
      const allServerCapabilities = this.messageRouter.getSupportedMethods()
      
      // Perform capability negotiation
      const clientActions = params.capabilities?.actions || []
      const negotiatedCapabilities = clientActions.filter(
        action => allServerCapabilities.includes(action)
      )
      
      const unsupportedCapabilities = clientActions.filter(
        action => !allServerCapabilities.includes(action)
      )
      
      // Build handshake response with schema validation
      const HandshakeResponseSchema = z.object({
        agentId: z.string(),
        sessionToken: z.string(),
        serverCapabilities: z.array(z.string()),
        unsupportedCapabilities: z.array(z.string()).optional(),
        expiresAt: z.number(),
        serverInfo: z.object({
          name: z.string(),
          version: z.string(),
          protocols: z.array(z.string())
        })
      })
      
      const handshakeResponse = HandshakeResponseSchema.parse({
        agentId: params.agentId,
        sessionToken,
        serverCapabilities: negotiatedCapabilities.length > 0 ? negotiatedCapabilities : allServerCapabilities.slice(0, 20),
        unsupportedCapabilities: unsupportedCapabilities.length > 0 ? unsupportedCapabilities : undefined,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        serverInfo: {
          name: 'Babylon',
          version: '1.0.0',
          protocols: ['a2a', 'mcp', 'x402']
        }
      })
      
      // Send handshake response
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: handshake.id,
        result: handshakeResponse
      }))

      cancelAuthTimeout()
      logger.info('Agent authenticated', { 
        agentId: params.agentId,
        negotiatedCapabilities: negotiatedCapabilities.length,
        unsupportedCapabilities: unsupportedCapabilities.length
      }, 'A2AServer')
      
      // Emit lifecycle event
      const lifecycleManager = getAgentLifecycleManager()
      await lifecycleManager.onAgentConnectedA2A({
        agentId: params.agentId,
        endpoint: this.config.host + ':' + this.config.port,
        sessionToken,
        timestamp: now,
        metadata: {
          tokenId: params.tokenId,
          capabilities: params.capabilities
        }
      })
    } catch (error) {
      cancelAuthTimeout()
      logger.error('Authentication error', { error }, 'A2AServer')
      ws.close(1008, 'Authentication error')
    }
  }

  private waitForMessage(ws: WebSocket, timeout: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout

      const cleanup = () => {
        clearTimeout(timer)
        ws.removeListener('message', onMessage)
        ws.removeListener('close', onClose)
      }

      function onMessage(data: Buffer) {
        cleanup()
        resolve(data)
      }

      function onClose() {
        cleanup()
        reject(new Error('Connection closed before message'))
      }

      timer = setTimeout(() => {
        cleanup()
        reject(new Error('Timeout waiting for message'))
      }, timeout)

      ws.once('message', onMessage)
      ws.once('close', onClose)
    })
  }

  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer) {
    if (!ws.authenticated || !ws.agentId) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: ErrorCode.NOT_AUTHENTICATED,
          message: 'Not authenticated'
        }
      }))
      return
    }

    // Rate limiting
    const now = Date.now()
    if (ws.lastMessageTime && now - ws.lastMessageTime < 1000) {
      ws.messageCount = (ws.messageCount || 0) + 1
      if (ws.messageCount > this.config.messageRateLimit) {
        logger.warn('Rate limit exceeded', { agentId: ws.agentId }, 'A2AServer')
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: ErrorCode.RATE_LIMIT_EXCEEDED,
            message: 'Rate limit exceeded'
          }
        }))
        return
      }
    } else {
      ws.messageCount = 1
      ws.lastMessageTime = now
    }

    try {
      const request = JSON.parse(data.toString()) as JsonRpcRequest
      
      // Replay protection: Check if message ID has been processed
      if (request.id) {
        const messageKey = `${ws.agentId}:${request.id}`
        if (this.processedMessages.has(messageKey)) {
          logger.warn('Duplicate message detected', { 
            agentId: ws.agentId, 
            messageId: request.id 
          }, 'A2AServer')
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: ErrorCode.INVALID_REQUEST,
              message: 'Duplicate message'
            }
          }))
          return
        }
        // Mark message as processed
        this.processedMessages.add(messageKey)
        
        // Clean up old messages (keep last 10000)
        if (this.processedMessages.size > 10000) {
          const iterator = this.processedMessages.values()
          for (let i = 0; i < 1000; i++) {
            const next = iterator.next()
            if (!next.done) {
              this.processedMessages.delete(next.value)
            }
          }
        }
      }
      
      const response = await this.messageRouter.route(ws.agentId, request, ws.connection!)
      ws.send(JSON.stringify(response))
    } catch (error) {
      logger.error('Error handling message', { error, agentId: ws.agentId }, 'A2AServer')
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Internal error'
        }
      }))
    }
  }

  async waitForReady(): Promise<void> {
    await this.readyPromise
    logger.info('A2A WebSocket Server ready', {
      port: this.config.port,
      host: this.config.host,
    }, 'A2AServer')
  }

  private getActiveConnectionCount(): number {
    return this.pendingSockets.size + this.connections.size
  }

  /**
   * Broadcast message to all connected agents
   */
  async broadcast(message: { method: string; params: unknown }): Promise<void> {
    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: message.method,
      params: message.params
    })
    
    let sent = 0
    this.connections.forEach((ws, _agentId) => {
      if (ws.authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(notification)
        sent++
      }
    })
    
    logger.debug(`Broadcast message to ${sent} agents`, { method: message.method }, 'A2AServer')
  }
  
  /**
   * Broadcast to specific market subscribers
   */
  async broadcastToMarketSubscribers(marketId: string, message: { method: string; params: unknown }): Promise<void> {
    const subscribers = this.messageRouter.getMarketSubscribers(marketId)
    
    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: message.method,
      params: message.params
    })
    
    let sent = 0
    subscribers.forEach(agentId => {
      const ws = this.connections.get(agentId)
      if (ws && ws.authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(notification)
        sent++
      }
    })
    
    logger.debug(`Broadcast to ${sent} market subscribers`, { marketId, method: message.method }, 'A2AServer')
  }

  async close(): Promise<void> {
    logger.info('Closing A2A WebSocket Server', undefined, 'A2AServer')
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
    }

    // Close all authenticated connections
    this.connections.forEach((ws) => {
      ws.close(1001, 'Server shutting down')
      ws.terminate()
    })
    this.connections.clear()

    // Close pending sockets
    this.pendingSockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down')
      }
      ws.terminate()
    })
    this.pendingSockets.clear()

    // Close server
    if (this.server) {
      const serverRef = this.server
      this.server = null
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn('WebSocket server close timed out, forcing shutdown', undefined, 'A2AServer')
          resolve()
        }, 2000)

        serverRef.close(() => {
          clearTimeout(timeout)
          logger.info('A2A WebSocket Server closed', undefined, 'A2AServer')
          resolve()
        })
      })
    }
  }
}

/**
 * A2A WebSocket Server
 * Handles agent-to-agent communication via WebSocket and JSON-RPC 2.0
 */

import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'
import {
  JsonRpcRequest,
  JsonRpcResponse,
  A2AServerConfig,
  AgentConnection,
  ErrorCode,
  A2AEventType
} from '../types'
import { MessageRouter } from './message-router'
import { AuthManager } from './auth-manager'
import { RateLimiter } from '../utils/rate-limiter'
import { Logger } from '../utils/logger'
import { RegistryClient } from '../blockchain/registry-client'
import { X402Manager } from '../payments/x402-manager'

export interface A2AServerOptions extends A2AServerConfig {
  registryClient?: RegistryClient
  x402Manager?: X402Manager
}

export class A2AWebSocketServer extends EventEmitter {
  private wss: WebSocketServer
  private connections: Map<string, AgentConnection & { ws: WebSocket }> = new Map()
  private router: MessageRouter
  private authManager: AuthManager
  private rateLimiter: RateLimiter
  private logger: Logger
  private config: Required<A2AServerConfig>
  private registryClient?: RegistryClient
  private x402Manager?: X402Manager

  constructor(config: A2AServerOptions) {
    super()

    // Set defaults
    this.config = {
      host: '0.0.0.0',
      maxConnections: 1000,
      messageRateLimit: 100, // messages per minute
      authTimeout: 30000, // 30 seconds
      enableX402: true,
      enableCoalitions: true,
      logLevel: 'info',
      ...config
    }

    this.registryClient = config.registryClient
    this.x402Manager = config.x402Manager
    this.logger = new Logger(this.config.logLevel)
    this.router = new MessageRouter(this.config, this.registryClient, this.x402Manager)
    this.authManager = new AuthManager(this.registryClient)
    this.rateLimiter = new RateLimiter(this.config.messageRateLimit)

    this.wss = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
      maxPayload: 1024 * 1024 // 1MB max message size
    })

    this.setupServer()
    this.logger.info(`A2A WebSocket server started on ${this.config.host}:${this.config.port}`)
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientIp = req.socket.remoteAddress || 'unknown'
      const tempId = this.generateConnectionId()

      this.logger.debug(`New connection attempt: ${tempId} from ${clientIp}`)

      // Check connection limit
      if (this.connections.size >= this.config.maxConnections) {
        this.logger.warn(`Max connections reached, rejecting ${tempId}`)
        ws.close(1008, 'Server at capacity')
        return
      }

      // Set authentication timeout
      const authTimeout = setTimeout(() => {
        if (this.connections.get(tempId)?.authenticated === false) {
          this.logger.warn(`Authentication timeout for ${tempId}`)
          ws.close(1008, 'Authentication timeout')
          this.connections.delete(tempId)
        }
      }, this.config.authTimeout)

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as JsonRpcRequest

          // Validate JSON-RPC format
          if (!this.isValidJsonRpc(message)) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: ErrorCode.INVALID_REQUEST,
                message: 'Invalid JSON-RPC request'
              },
              id: null
            }))
            return
          }

          const connection = this.connections.get(tempId)

          // Handle handshake (authentication) separately
          if (message.method === 'a2a.handshake') {
            clearTimeout(authTimeout)
            await this.handleHandshake(ws, tempId, message)
            return
          }

          // Check authentication for all other methods
          if (!connection?.authenticated) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: ErrorCode.NOT_AUTHENTICATED,
                message: 'Not authenticated. Please perform handshake first.'
              },
              id: message.id
            }))
            return
          }

          // Rate limiting
          if (!this.rateLimiter.checkLimit(connection.agentId)) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: ErrorCode.RATE_LIMIT_EXCEEDED,
                message: 'Rate limit exceeded. Please slow down.'
              },
              id: message.id
            }))
            return
          }

          // Update last activity
          connection.lastActivity = Date.now()

          // Route message
          const response = await this.router.route(
            connection.agentId,
            message,
            connection
          )

          ws.send(JSON.stringify(response))
        } catch (error) {
          this.logger.error(`Message handling error for ${tempId}:`, error)
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: ErrorCode.INTERNAL_ERROR,
              message: 'Internal server error'
            },
            id: null
          }))
        }
      })

      // Handle connection close
      ws.on('close', (code, reason) => {
        const connection = this.connections.get(tempId)
        if (connection) {
          this.logger.info(`Agent disconnected: ${connection.agentId || tempId}`)
          this.emit(A2AEventType.AGENT_DISCONNECTED, {
            agentId: connection.agentId,
            reason: reason.toString()
          })
          this.connections.delete(tempId)
        }
      })

      // Handle errors
      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for ${tempId}:`, error)
      })

      // Initialize connection (not authenticated yet)
      this.connections.set(tempId, {
        agentId: '',
        address: '',
        tokenId: 0,
        capabilities: { strategies: [], markets: [], actions: [], version: '' },
        authenticated: false,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        ws
      })
    })

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error:', error)
    })
  }

  private async handleHandshake(
    ws: WebSocket,
    tempId: string,
    message: JsonRpcRequest
  ): Promise<void> {
    try {
      const params = message.params as {
        credentials: {
          address: string
          tokenId: number
          signature: string
          timestamp: number
        }
        capabilities: {
          strategies: string[]
          markets: string[]
          actions: string[]
          version: string
        }
        endpoint: string
      }

      // Validate credentials
      const authResult = await this.authManager.authenticate(params.credentials)

      if (!authResult.success) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: ErrorCode.AUTHENTICATION_FAILED,
            message: authResult.error || 'Authentication failed'
          },
          id: message.id
        }))
        ws.close(1008, 'Authentication failed')
        this.connections.delete(tempId)
        return
      }

      // Update connection with authenticated info
      const connection = this.connections.get(tempId)!
      connection.agentId = `agent-${params.credentials.tokenId}`
      connection.address = params.credentials.address
      connection.tokenId = params.credentials.tokenId
      connection.capabilities = params.capabilities
      connection.authenticated = true

      // Send handshake response
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        result: {
          agentId: connection.agentId,
          sessionToken: authResult.sessionToken,
          serverCapabilities: this.getServerCapabilities(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        },
        id: message.id
      }

      ws.send(JSON.stringify(response))

      this.logger.info(`Agent authenticated: ${connection.agentId}`)
      this.emit(A2AEventType.AGENT_CONNECTED, {
        agentId: connection.agentId,
        address: connection.address,
        tokenId: connection.tokenId
      })
    } catch (error) {
      this.logger.error('Handshake error:', error)
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Handshake failed'
        },
        id: message.id
      }))
    }
  }

  private isValidJsonRpc(message: unknown): message is JsonRpcRequest {
    if (typeof message !== 'object' || message === null) return false
    const msg = message as Record<string, unknown>
    return (
      msg.jsonrpc === '2.0' &&
      typeof msg.method === 'string' &&
      (typeof msg.id === 'string' || typeof msg.id === 'number')
    )
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private getServerCapabilities(): string[] {
    const capabilities = [
      'discovery',
      'market-data',
      'subscriptions'
    ]

    if (this.config.enableCoalitions) {
      capabilities.push('coalitions')
    }

    if (this.config.enableX402) {
      capabilities.push('micropayments')
    }

    return capabilities
  }

  // Broadcast message to specific agents
  public broadcast(agentIds: string[], message: unknown): void {
    for (const agentId of agentIds) {
      const connection = Array.from(this.connections.values())
        .find(conn => conn.agentId === agentId)

      if (connection?.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message))
      }
    }
  }

  // Broadcast to all connected agents
  public broadcastAll(message: unknown): void {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN && connection.authenticated) {
        connection.ws.send(JSON.stringify(message))
      }
    }
  }

  // Get list of connected agents
  public getConnectedAgents(): AgentConnection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.authenticated)
      .map(({ ws, ...connection }) => connection)
  }

  /**
   * Wait for server to be ready to accept connections
   */
  public async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wss.listening) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start within timeout'))
      }, 5000)

      this.wss.once('listening', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.wss.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  // Close server
  public async close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all connections first
      const closePromises: Promise<void>[] = []

      for (const connection of this.connections.values()) {
        const closePromise = new Promise<void>((resolveClose) => {
          if (connection.ws.readyState === WebSocket.CLOSED) {
            resolveClose()
            return
          }

          connection.ws.once('close', () => resolveClose())
          connection.ws.close(1001, 'Server shutting down')

          // Timeout after 500ms
          setTimeout(() => resolveClose(), 500)
        })
        closePromises.push(closePromise)
      }

      // Wait for all connections to close, then close server
      Promise.all(closePromises).then(() => {
        this.connections.clear()

        // Set a timeout in case wss.close() never calls callback
        const timeout = setTimeout(() => {
          this.logger.info('A2A WebSocket server closed (forced)')
          resolve()
        }, 2000)

        this.wss.close((err) => {
          clearTimeout(timeout)
          if (err) {
            this.logger.error('Error closing WebSocket server:', err)
          } else {
            this.logger.info('A2A WebSocket server closed')
          }
          resolve()
        })
      })
    })
  }
}

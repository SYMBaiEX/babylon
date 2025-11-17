/**
 * External Agent Adapter
 *
 * Manages connections to external agents via A2A, MCP, or custom protocols
 * Provides unified interface for interacting with external agents
 *
 * @see agent-patch-plan.md Phase 2.4
 */

import { AgentStatus } from '@/types/agent-registry.types'
import { prisma } from '@/lib/prisma'
import type { JsonValue } from '@/types/common'

export type Protocol = 'a2a' | 'mcp' | 'agent0' | 'custom'

export interface ExternalAgentConnection {
  id: string
  externalId: string
  endpoint: string
  protocol: Protocol
  isHealthy: boolean
  lastHealthCheck?: Date
  lastConnected?: Date
}

export interface AgentMessage {
  type: string
  content: JsonValue
  metadata?: Record<string, JsonValue>
}

export interface AgentResponse {
  success: boolean
  data?: JsonValue
  error?: string
}

/**
 * External Agent Adapter
 * Routes messages to external agents based on their protocol
 */
export class ExternalAgentAdapter {
  private connections: Map<string, ExternalAgentConnection> = new Map()
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(private healthCheckIntervalMs: number = 60000) {}

  /**
   * Initialize adapter and start health checks
   */
  async initialize(): Promise<void> {
    await this.loadConnections()
    this.startHealthChecks()
  }

  /**
   * Load all active external agent connections from database
   */
  private async loadConnections(): Promise<void> {
    const externalAgents = await prisma.externalAgentConnection.findMany({
      where: {
        AgentRegistry: {
          status: AgentStatus.ACTIVE,
        },
      },
      include: {
        AgentRegistry: true,
      },
    })

    for (const agent of externalAgents) {
      this.connections.set(agent.externalId, {
        id: agent.id,
        externalId: agent.externalId,
        endpoint: agent.endpoint,
        protocol: agent.protocol as Protocol,
        isHealthy: agent.isHealthy,
        lastConnected: agent.lastConnected ?? undefined,
      })
    }

    console.log(`[ExternalAgentAdapter] Loaded ${this.connections.size} external agent connections`)
  }

  /**
   * Send message to external agent
   */
  async sendMessage(
    externalId: string,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    const connection = this.connections.get(externalId)

    if (!connection) {
      return {
        success: false,
        error: `External agent not found: ${externalId}`,
      }
    }

    if (!connection.isHealthy) {
      return {
        success: false,
        error: `External agent unhealthy: ${externalId}`,
      }
    }

    try {
      // Route to appropriate protocol handler
      switch (connection.protocol) {
        case 'a2a':
          return await this.sendA2AMessage(connection, message)
        case 'mcp':
          return await this.sendMCPMessage(connection, message)
        case 'agent0':
          return await this.sendAgent0Message(connection, message)
        case 'custom':
          return await this.sendCustomMessage(connection, message)
        default:
          return {
            success: false,
            error: `Unsupported protocol: ${connection.protocol}`,
          }
      }
    } catch (error) {
      console.error(`[ExternalAgentAdapter] Error sending message to ${externalId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Send A2A protocol message
   */
  private async sendA2AMessage(
    connection: ExternalAgentConnection,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: message.type,
        content: message.content,
        metadata: message.metadata,
      }),
    })

    if (!response.ok) {
      throw new Error(`A2A request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      data,
    }
  }

  /**
   * Send MCP protocol message
   */
  private async sendMCPMessage(
    connection: ExternalAgentConnection,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: message.type,
        params: message.content,
      }),
    })

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      return {
        success: false,
        error: data.error.message || 'MCP error',
      }
    }

    return {
      success: true,
      data: data.result,
    }
  }

  /**
   * Send Agent0 SDK message
   */
  private async sendAgent0Message(
    connection: ExternalAgentConnection,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    // Agent0 SDK typically uses REST API
    const response = await fetch(`${connection.endpoint}/api/agent/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      throw new Error(`Agent0 request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      data,
    }
  }

  /**
   * Send custom protocol message
   */
  private async sendCustomMessage(
    connection: ExternalAgentConnection,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    // For custom protocols, use generic JSON POST
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      throw new Error(`Custom request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      data,
    }
  }

  /**
   * Perform health check on external agent
   */
  async healthCheck(externalId: string): Promise<boolean> {
    const connection = this.connections.get(externalId)

    if (!connection) {
      return false
    }

    try {
      const response = await fetch(connection.endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      const isHealthy = response.ok
      connection.isHealthy = isHealthy
      connection.lastHealthCheck = new Date()

      // Update database
      await prisma.externalAgentConnection.update({
        where: { externalId },
        data: {
          isHealthy,
          lastHealthCheck: new Date(),
        },
      }).catch(() => {
        // Ignore update errors during health check
      })

      return isHealthy
    } catch {
      connection.isHealthy = false
      connection.lastHealthCheck = new Date()

      await prisma.externalAgentConnection.update({
        where: { externalId },
        data: {
          isHealthy: false,
          lastHealthCheck: new Date(),
        },
      }).catch(() => {
        // Ignore update errors during health check
      })

      return false
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [externalId] of this.connections) {
        await this.healthCheck(externalId)
      }
    }, this.healthCheckIntervalMs)

    console.log(`[ExternalAgentAdapter] Health checks started (interval: ${this.healthCheckIntervalMs}ms)`)
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      console.log('[ExternalAgentAdapter] Health checks stopped')
    }
  }

  /**
   * Get connection status for external agent
   */
  getConnectionStatus(externalId: string): ExternalAgentConnection | undefined {
    return this.connections.get(externalId)
  }

  /**
   * Get all connections
   */
  getAllConnections(): ExternalAgentConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Refresh connections from database
   */
  async refreshConnections(): Promise<void> {
    await this.loadConnections()
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stopHealthChecks()
    this.connections.clear()
    console.log('[ExternalAgentAdapter] Shutdown complete')
  }
}

// Singleton instance
let adapterInstance: ExternalAgentAdapter | null = null

/**
 * Get singleton ExternalAgentAdapter instance
 */
export function getExternalAgentAdapter(): ExternalAgentAdapter {
  if (!adapterInstance) {
    adapterInstance = new ExternalAgentAdapter()
    // Initialize asynchronously (don't block)
    adapterInstance.initialize().catch(console.error)
  }
  return adapterInstance
}

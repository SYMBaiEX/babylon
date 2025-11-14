/**
 * Protocol Bridge
 * 
 * Synchronizes state and events between MCP, A2A, and Agent0 protocols.
 * Ensures agents see consistent state regardless of which protocol they use.
 */

import { EventEmitter } from 'events'
import type { A2AWebSocketServer } from '@/a2a/server/websocket-server'
import type { Agent0Client } from '@/agents/agent0/Agent0Client'
import { getAgentLifecycleManager } from '@/lib/agents/lifecycle/AgentLifecycleManager'
import {
  AgentLifecycleEvent,
  type AgentRegisteredEvent,
  type Agent0RegisteredEvent,
  type ReputationUpdatedEvent
} from '@/lib/agents/lifecycle/events'
import { logger } from '@/lib/logger'
import { broadcastToChannel } from '@/lib/sse/event-broadcaster'

export interface MCPToolExecutionEvent {
  tool: string
  args: Record<string, unknown>
  result: unknown
  agentId: string
  timestamp: number
}

export interface A2AMessageEvent {
  method: string
  params: unknown
  agentId: string
  timestamp: number
}

export class ProtocolBridge extends EventEmitter {
  private static instance: ProtocolBridge | null = null
  private a2aServer: A2AWebSocketServer | null = null
  private agent0Client: Agent0Client | null = null
  private lifecycleManager = getAgentLifecycleManager()
  
  private constructor() {
    super()
    this.setupLifecycleHandlers()
  }
  
  static getInstance(): ProtocolBridge {
    if (!ProtocolBridge.instance) {
      ProtocolBridge.instance = new ProtocolBridge()
    }
    return ProtocolBridge.instance
  }
  
  /**
   * Initialize bridge with protocol servers
   */
  initialize(config: {
    a2aServer?: A2AWebSocketServer
    agent0Client?: Agent0Client
  }): void {
    this.a2aServer = config.a2aServer || null
    this.agent0Client = config.agent0Client || null
    
    logger.info('Protocol bridge initialized', {
      hasA2A: !!this.a2aServer,
      hasAgent0: !!this.agent0Client
    }, 'ProtocolBridge')
  }
  
  /**
   * Setup lifecycle event handlers
   */
  private setupLifecycleHandlers(): void {
    // Agent registered -> Notify A2A subscribers
    this.lifecycleManager.on(AgentLifecycleEvent.REGISTERED, async (event: AgentRegisteredEvent) => {
      if (this.a2aServer) {
        await this.broadcastToA2A({
          method: 'a2a.agentRegistered',
          params: {
            agentId: event.agentId,
            tokenId: event.tokenId,
            timestamp: event.timestamp
          }
        })
      }
    })
    
    // Agent0 registered -> Update local state
    this.lifecycleManager.on(AgentLifecycleEvent.AGENT0_REGISTERED, async (event: Agent0RegisteredEvent) => {
      logger.info('Agent0 registration detected', { agentId: event.agentId }, 'ProtocolBridge')
      // Could trigger metadata sync, cache invalidation, etc.
    })
    
    // Reputation updated -> Sync to Agent0
    this.lifecycleManager.on(AgentLifecycleEvent.REPUTATION_UPDATED, async (event: ReputationUpdatedEvent) => {
      if (this.agent0Client && process.env.AGENT0_ENABLED === 'true') {
        // Could submit feedback to Agent0 reflecting reputation change
        logger.debug('Reputation update detected', { 
          agentId: event.agentId,
          oldScore: event.oldScore,
          newScore: event.newScore
        }, 'ProtocolBridge')
      }
    })
  }
  
  /**
   * Handle MCP tool execution -> Broadcast to A2A
   */
  async onMCPToolExecuted(event: MCPToolExecutionEvent): Promise<void> {
    this.emit('mcp:toolExecuted', event)
    
    // Broadcast relevant events to A2A subscribers
    if (this.shouldBroadcastToA2A(event.tool)) {
      await this.broadcastToolExecutionToA2A(event)
    }
    
    logger.debug('MCP tool executed', { 
      tool: event.tool, 
      agentId: event.agentId 
    }, 'ProtocolBridge')
  }
  
  /**
   * Handle A2A message -> Update MCP context
   */
  async onA2AMessage(event: A2AMessageEvent): Promise<void> {
    this.emit('a2a:message', event)
    
    // Store message in context for MCP tools to access
    // This would be used by MCPContextManager
    
    logger.debug('A2A message received', { 
      method: event.method, 
      agentId: event.agentId 
    }, 'ProtocolBridge')
  }
  
  /**
   * Determine if tool execution should be broadcast to A2A
   */
  private shouldBroadcastToA2A(tool: string): boolean {
    const broadcastTools = [
      'place_bet',
      'close_position',
      'create_post',
      'create_comment'
    ]
    return broadcastTools.includes(tool)
  }
  
  /**
   * Broadcast tool execution to A2A subscribers
   */
  private async broadcastToolExecutionToA2A(event: MCPToolExecutionEvent): Promise<void> {
    if (!this.a2aServer) return
    
    const a2aMethod = this.mcpToolToA2AMethod(event.tool)
    if (!a2aMethod) return
    
    try {
      // Broadcast to relevant subscribers
      if (event.tool === 'place_bet' && typeof event.args.marketId === 'string') {
        await this.broadcastToA2A({
          method: 'a2a.marketUpdate',
          params: {
            marketId: event.args.marketId,
            event: 'new_bet',
            agentId: event.agentId,
            timestamp: event.timestamp
          }
        })
      }
    } catch (error) {
      logger.error('Failed to broadcast tool execution to A2A', error, 'ProtocolBridge')
    }
  }
  
  /**
   * Broadcast message to all A2A connections
   * Uses existing SSE broadcaster for cross-instance support
   */
  private async broadcastToA2A(message: { method: string; params: unknown }): Promise<void> {
    // Broadcast via A2A WebSocket server if available
    if (this.a2aServer) {
      await this.a2aServer.broadcast(message)
    }
    
    // Also broadcast via SSE for web clients
    broadcastToChannel('agents', {
      type: message.method,
      data: message.params as Record<string, unknown>,
      timestamp: Date.now()
    })
    
    this.emit('broadcast:a2a', message)
  }
  
  /**
   * Map MCP tool to A2A method
   */
  private mcpToolToA2AMethod(tool: string): string | null {
    const mapping: Record<string, string> = {
      'get_markets': 'a2a.getMarketData',
      'place_bet': 'a2a.buyShares',
      'get_balance': 'a2a.getBalance',
      'get_positions': 'a2a.getPositions',
      'close_position': 'a2a.closePosition',
      'query_feed': 'a2a.getFeed',
      'create_post': 'a2a.createPost',
      'create_comment': 'a2a.createComment'
    }
    return mapping[tool] || null
  }
  
  /**
   * Map A2A method to MCP tool
   */
  a2aMethodToMCPTool(method: string): string | null {
    const mapping: Record<string, string> = {
      'a2a.getMarketData': 'get_markets',
      'a2a.buyShares': 'place_bet',
      'a2a.getBalance': 'get_balance',
      'a2a.getPositions': 'get_positions',
      'a2a.closePosition': 'close_position',
      'a2a.getFeed': 'query_feed',
      'a2a.createPost': 'create_post',
      'a2a.createComment': 'create_comment'
    }
    return mapping[method] || null
  }
}

/**
 * Get singleton protocol bridge
 */
export function getProtocolBridge(): ProtocolBridge {
  return ProtocolBridge.getInstance()
}


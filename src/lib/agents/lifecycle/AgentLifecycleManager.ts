/**
 * Agent Lifecycle Manager
 * 
 * Central event system for tracking agent state changes across protocols.
 * Coordinates updates between Agent0, A2A, MCP, and local database.
 */

import { EventEmitter } from 'events'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import {
  AgentLifecycleEvent,
  type AgentRegisteredEvent,
  type Agent0RegisteredEvent,
  type AgentConnectedA2AEvent,
  type AgentTransferredEvent,
  type ReputationUpdatedEvent,
  type FeedbackReceivedEvent
} from './events'

export class AgentLifecycleManager extends EventEmitter {
  private static instance: AgentLifecycleManager | null = null
  
  private constructor() {
    super()
    this.setMaxListeners(100) // Support many listeners
  }
  
  static getInstance(): AgentLifecycleManager {
    if (!AgentLifecycleManager.instance) {
      AgentLifecycleManager.instance = new AgentLifecycleManager()
    }
    return AgentLifecycleManager.instance
  }
  
  /**
   * Agent registered (local database)
   */
  async onAgentRegistered(event: AgentRegisteredEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.REGISTERED, event)
    
    await this.logEvent(AgentLifecycleEvent.REGISTERED, event.agentId, {
      tokenId: event.tokenId,
      walletAddress: event.walletAddress
    })
    
    logger.info(`Agent registered: ${event.agentId}`, { tokenId: event.tokenId }, 'AgentLifecycle')
  }
  
  /**
   * Agent registered on Agent0 network
   */
  async onAgent0Registered(event: Agent0RegisteredEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.AGENT0_REGISTERED, event)
    
    await this.logEvent(AgentLifecycleEvent.AGENT0_REGISTERED, event.agentId, {
      agent0TokenId: event.agent0TokenId,
      metadataCID: event.metadataCID,
      txHash: event.txHash
    })
    
    logger.info(`Agent registered on Agent0: ${event.agentId}`, { 
      agent0TokenId: event.agent0TokenId 
    }, 'AgentLifecycle')
    
    // Sync metadata to Agent0 if needed
    if (process.env.AGENT0_ENABLED === 'true') {
      await this.syncToAgent0(event.agentId, event.agent0TokenId)
    }
  }
  
  /**
   * Agent connected via A2A
   */
  async onAgentConnectedA2A(event: AgentConnectedA2AEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.CONNECTED_A2A, event)
    
    await this.logEvent(AgentLifecycleEvent.CONNECTED_A2A, event.agentId, {
      endpoint: event.endpoint,
      sessionToken: event.sessionToken.substring(0, 20) + '...'
    })
    
    // Update last seen timestamp
    await prisma.user.update({
      where: { username: event.agentId },
      data: { agentLastTickAt: new Date() }
    }).catch(() => {
      // Agent might not exist in local DB (external agent)
    })
    
    logger.info(`Agent connected via A2A: ${event.agentId}`, undefined, 'AgentLifecycle')
  }
  
  /**
   * Agent disconnected from A2A
   */
  async onAgentDisconnectedA2A(agentId: string): Promise<void> {
    this.emit(AgentLifecycleEvent.DISCONNECTED_A2A, { agentId, timestamp: Date.now() })
    
    await this.logEvent(AgentLifecycleEvent.DISCONNECTED_A2A, agentId, {})
    
    logger.info(`Agent disconnected from A2A: ${agentId}`, undefined, 'AgentLifecycle')
  }
  
  /**
   * Agent authenticated via MCP
   */
  async onAgentAuthenticatedMCP(agentId: string, userId: string): Promise<void> {
    this.emit(AgentLifecycleEvent.AUTHENTICATED_MCP, { agentId, userId, timestamp: Date.now() })
    
    await this.logEvent(AgentLifecycleEvent.AUTHENTICATED_MCP, agentId, { userId })
    
    logger.debug(`Agent authenticated via MCP: ${agentId}`, undefined, 'AgentLifecycle')
  }
  
  /**
   * Agent transferred (ownership change)
   */
  async onAgentTransferred(event: AgentTransferredEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.TRANSFERRED, event)
    
    await this.logEvent(AgentLifecycleEvent.TRANSFERRED, event.agentId, {
      fromOwner: event.fromOwner,
      toOwner: event.toOwner,
      txHash: event.txHash
    })
    
    logger.info(`Agent transferred: ${event.agentId}`, {
      from: event.fromOwner,
      to: event.toOwner
    }, 'AgentLifecycle')
  }
  
  /**
   * Agent reputation updated
   */
  async onReputationUpdated(event: ReputationUpdatedEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.REPUTATION_UPDATED, event)
    
    await this.logEvent(AgentLifecycleEvent.REPUTATION_UPDATED, event.agentId, {
      oldScore: event.oldScore,
      newScore: event.newScore,
      source: event.source
    })
    
    logger.debug(`Reputation updated: ${event.agentId}`, {
      oldScore: event.oldScore,
      newScore: event.newScore
    }, 'AgentLifecycle')
  }
  
  /**
   * Agent received feedback
   */
  async onFeedbackReceived(event: FeedbackReceivedEvent): Promise<void> {
    this.emit(AgentLifecycleEvent.FEEDBACK_RECEIVED, event)
    
    await this.logEvent(AgentLifecycleEvent.FEEDBACK_RECEIVED, event.agentId, {
      feedbackId: event.feedbackId,
      rating: event.rating,
      fromAgent: event.fromAgent
    })
    
    logger.debug(`Feedback received: ${event.agentId}`, {
      rating: event.rating,
      from: event.fromAgent
    }, 'AgentLifecycle')
  }
  
  /**
   * Log event to database
   */
  private async logEvent(
    eventType: AgentLifecycleEvent,
    agentId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.agentLifecycleEvent.create({
        data: {
          id: await generateSnowflakeId(),
          agentId,
          eventType,
          metadata,
          timestamp: new Date()
        }
      })
    } catch (error) {
      logger.error('Failed to log lifecycle event', error, 'AgentLifecycle')
    }
  }
  
  /**
   * Sync agent metadata to Agent0 network
   */
  private async syncToAgent0(agentId: string, agent0TokenId: number): Promise<void> {
    try {
      // This would update Agent0 metadata when agent state changes
      // Implementation depends on Agent0Client.updateAgentMetadata()
      logger.debug(`Would sync ${agentId} to Agent0 (token: ${agent0TokenId})`, undefined, 'AgentLifecycle')
    } catch (error) {
      logger.error('Failed to sync to Agent0', error, 'AgentLifecycle')
    }
  }
  
  /**
   * Get lifecycle events for an agent
   */
  async getAgentEvents(agentId: string, limit: number = 100): Promise<Array<{
    id: string
    agentId: string
    eventType: string
    metadata: Record<string, unknown> | null
    timestamp: Date
  }>> {
    return await prisma.agentLifecycleEvent.findMany({
      where: { agentId },
      orderBy: { timestamp: 'desc' },
      take: limit
    })
  }
}

/**
 * Get singleton lifecycle manager
 */
export function getAgentLifecycleManager(): AgentLifecycleManager {
  return AgentLifecycleManager.getInstance()
}


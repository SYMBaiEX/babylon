/**
 * Agent Repository
 * 
 * Specialized queries for AI agents, A2A operations, and agent management.
 */

import { BaseRepository, CacheTTL } from './base.repository'
import type { User, Prisma, PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export class AgentRepository extends BaseRepository<User, Prisma.UserCreateInput, Prisma.UserUpdateInput> {
  constructor(prismaClient?: PrismaClient) {
    super(prismaClient || prisma, 'user', {
      defaultTTL: CacheTTL.MEDIUM,
      enableCache: true
    })
  }
  
  /**
   * Find all registered agents
   * Note: Agents are users with onChainRegistered=true or agent0MetadataCID set
   */
  async findAllAgents(options?: {
    onChainOnly?: boolean
    agent0Only?: boolean
    active?: boolean
    limit?: number
    offset?: number
  }): Promise<User[]> {
    const where: Prisma.UserWhereInput = {
      // TODO: Add agent0MetadataCID field when implementing Agent0 integration
      onChainRegistered: true,
      isActor: false // Exclude NPCs
    }
    
    if (options?.onChainOnly) {
      delete where.OR
      where.onChainRegistered = true
    }
    
    if (options?.agent0Only) {
      // TODO: Add agent0MetadataCID field to enable Agent0-only filtering
      // For now, treat same as onChainOnly
      delete where.OR
      where.onChainRegistered = true
    }
    
    if (options?.active) {
      // TODO: Add agent0LastSync field to enable activity filtering
      // For now, just filter by onChainRegistered
      where.onChainRegistered = true
    }
    
    return this.prisma.user.findMany({
      where,
      take: options?.limit || 100,
      skip: options?.offset || 0,
      orderBy: { reputationPoints: 'desc' } // Use reputationPoints instead of agent0TrustScore
    })
  }
  
  /**
   * Find agents by capabilities (from metadata)
   */
  async findByCapabilities(filters: {
    markets?: string[]
    strategies?: string[]
    minTrustScore?: number
  }): Promise<User[]> {
    // TODO: Implement capabilities filtering when Agent0 metadata is stored
    // Note: Capabilities will be stored in IPFS metadata
    const where: Prisma.UserWhereInput = {
      onChainRegistered: true,
      isActor: false // Exclude NPCs
    }
    
    if (filters.minTrustScore !== undefined && filters.minTrustScore !== null) {
      where.reputationPoints = { gte: filters.minTrustScore }
    }
    
    const agents = await this.prisma.user.findMany({
      where,
      orderBy: { reputationPoints: 'desc' },
      take: 100
    })
    
    // TODO: Filter by actual capabilities once we parse metadata
    // For now, return all registered agents above trust threshold
    
    return agents
  }
  
  /**
   * Update agent endpoints
   */
  async updateEndpoints(
    userId: string,
    endpoints: {
      mcpEndpoint?: string
      a2aEndpoint?: string
    }
  ): Promise<User> {
    // TODO: Add mcpEndpoint and a2aEndpoint fields to Prisma schema
    // For now, just fetch and return the user without updating endpoints
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      throw new Error(`User ${userId} not found`)
    }
    
    await this.invalidateAgentCache(userId)
    
    logger.info(`Endpoint update requested for agent ${userId} (fields not yet in schema)`, endpoints, 'AgentRepository')
    
    return user
  }
  
  /**
   * Record agent activity (bump lastSync)
   */
  async recordActivity(userId: string): Promise<void> {
    // TODO: Add agent0LastSync field to track agent activity
    // For now, just invalidate cache
    await this.invalidateAgentCache(userId)
  }
  
  /**
   * Get agent statistics for monitoring
   */
  async getAgentStats(): Promise<{
    total: number
    onChain: number
    agent0: number
    activeLastWeek: number
  }> {
    const cacheKey = this.getCacheKey('stats:agents')
    
    return this.withCache(cacheKey, async () => {
      // TODO: Add agent0MetadataCID and agent0LastSync fields for accurate stats
      // For now, use onChainRegistered as proxy for agent registration
      const [total, onChain, agent0, activeLastWeek] = await Promise.all([
        this.prisma.user.count({ 
          where: { 
            onChainRegistered: true,
            isActor: false
          }
        }),
        this.prisma.user.count({ 
          where: { 
            onChainRegistered: true,
            isActor: false
          }
        }),
        this.prisma.user.count({ 
          where: { 
            onChainRegistered: true,
            isActor: false
          }
        }),
        this.prisma.user.count({ 
          where: { 
            onChainRegistered: true,
            isActor: false
          }
        })
      ])
      
      return { total, onChain, agent0, activeLastWeek }
    }, 300) // 5 minute cache
  }
  
  /**
   * Get top performing agents by reputation
   */
  async getTopAgents(limit: number = 20): Promise<User[]> {
    const cacheKey = this.getCacheKey(`top:${limit}`)
    
    return this.withCache(cacheKey, async () => {
      // TODO: Use agent0TrustScore when Agent0 integration is complete
      return this.prisma.user.findMany({
        where: {
          onChainRegistered: true,
          isActor: false
        },
        orderBy: [
          { reputationPoints: 'desc' },
          { lifetimePnL: 'desc' }
        ],
        take: limit
      })
    }, 60) // 1 minute cache
  }
  
  /**
   * Bulk update agent trust scores (from Agent0 sync)
   */
  async bulkUpdateTrustScores(updates: Array<{
    userId: string
    trustScore: number
    feedbackCount: number
  }>): Promise<number> {
    // TODO: Add agent0TrustScore, agent0FeedbackCount, agent0LastSync fields
    // For now, update reputationPoints as a fallback
    let updated = 0
    
    for (const update of updates) {
      try {
        await this.prisma.user.update({
          where: { id: update.userId },
          data: {
            reputationPoints: Math.floor(update.trustScore)
          }
        })
        await this.invalidateCache(update.userId)
        updated++
      } catch (error) {
        logger.warn(`Failed to update trust score for ${update.userId}`, { error }, 'AgentRepository')
      }
    }
    
    logger.info(`Bulk updated ${updated}/${updates.length} agent trust scores`, undefined, 'AgentRepository')
    
    return updated
  }
  
  /**
   * Helper to invalidate agent-specific cache
   */
  private async invalidateAgentCache(userId: string): Promise<void> {
    this.cache?.delete(this.getCacheKey(userId))
  }
}

/**
 * Singleton instance
 */
let agentRepositoryInstance: AgentRepository | null = null

export function getAgentRepository(): AgentRepository {
  if (!agentRepositoryInstance) {
    agentRepositoryInstance = new AgentRepository()
  }
  return agentRepositoryInstance
}


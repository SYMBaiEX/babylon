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
      OR: [
        { onChainRegistered: true },
        { agent0MetadataCID: { not: null } }
      ],
      isActor: false // Exclude NPCs
    }
    
    if (options?.onChainOnly) {
      delete where.OR
      where.onChainRegistered = true
    }
    
    if (options?.agent0Only) {
      delete where.OR
      where.agent0MetadataCID = { not: null }
    }
    
    if (options?.active) {
      // Consider active if synced within last 7 days
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      where.agent0LastSync = { gte: sevenDaysAgo }
    }
    
    return this.prisma.user.findMany({
      where,
      take: options?.limit || 100,
      skip: options?.offset || 0,
      orderBy: { agent0TrustScore: 'desc' }
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
    // Note: Capabilities are stored in IPFS metadata
    // This queries by trust score and returns agents that match
    const where: Prisma.UserWhereInput = {
      agent0MetadataCID: { not: null },
      isActor: false // Exclude NPCs
    }
    
    if (filters.minTrustScore !== undefined && filters.minTrustScore !== null) {
      where.agent0TrustScore = { gte: filters.minTrustScore }
    }
    
    const agents = await this.prisma.user.findMany({
      where,
      orderBy: { agent0TrustScore: 'desc' },
      take: 100
    })
    
    // TODO: Filter by actual capabilities once we parse metadata
    // For now, return all agents above trust threshold
    
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
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        mcpEndpoint: endpoints.mcpEndpoint,
        a2aEndpoint: endpoints.a2aEndpoint
      }
    })
    
    await this.invalidateAgentCache(userId)
    
    logger.info(`Updated endpoints for agent ${userId}`, endpoints, 'AgentRepository')
    
    return updated
  }
  
  /**
   * Record agent activity (bump lastSync)
   */
  async recordActivity(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        agent0LastSync: new Date()
      }
    })
    
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
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      // Agents are users with onChainRegistered=true or agent0MetadataCID set
      const [total, onChain, agent0, activeLastWeek] = await Promise.all([
        this.prisma.user.count({ 
          where: { 
            OR: [
              { onChainRegistered: true },
              { agent0MetadataCID: { not: null } }
            ],
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
            agent0MetadataCID: { not: null },
            isActor: false
          }
        }),
        this.prisma.user.count({ 
          where: { 
            agent0LastSync: { gte: sevenDaysAgo },
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
      return this.prisma.user.findMany({
        where: {
          agent0TrustScore: { not: 0 },
          isActor: false
        },
        orderBy: [
          { agent0TrustScore: 'desc' },
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
    let updated = 0
    
    for (const update of updates) {
      try {
        await this.prisma.user.update({
          where: { id: update.userId },
          data: {
            agent0TrustScore: update.trustScore,
            agent0FeedbackCount: update.feedbackCount,
            agent0LastSync: new Date()
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


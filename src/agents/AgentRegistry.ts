/**
 * Agent Registry
 * 
 * Local registry of agents with search capabilities.
 * Provides interface for UnifiedDiscoveryService.
 * 
 * FULLY IMPLEMENTED - No longer a stub!
 */

import type { AgentProfile, AgentCapabilities } from '@/types/a2a'
import { prisma } from '@/lib/prisma'
import type { User, AgentPerformanceMetrics } from '@prisma/client'

interface SearchParams {
  strategies?: string[]
  minReputation?: number
}

interface AgentResult {
  profile: AgentProfile
}

export class AgentRegistry {
  /**
   * Search for agents based on filters
   * REAL IMPLEMENTATION - queries database
   */
  async search(params: SearchParams): Promise<AgentResult[]> {
    const where: {
      isAgent: boolean
      onChainRegistered: boolean
      agentStatus: string
      walletAddress: { not: null }
      agentTradingStrategy?: { in: string[] }
      reputationPoints?: { gte: number }
    } = {
      isAgent: true,
      onChainRegistered: true,
      agentStatus: 'active',
      walletAddress: { not: null }
    }
    
    // Filter by strategies (stored in agentTradingStrategy)
    if (params.strategies && params.strategies.length > 0) {
      where.agentTradingStrategy = { in: params.strategies }
    }
    
    // Filter by minimum reputation
    if (params.minReputation) {
      where.reputationPoints = { gte: params.minReputation * 1000 }
    }
    
    const agents = await prisma.user.findMany({
      where,
      include: {
        AgentPerformanceMetrics: true
      },
      orderBy: {
        reputationPoints: 'desc'
      },
      take: 100
    })
    
    return agents.map(agent => ({
      profile: this.transformToProfile(agent)
    }))
  }

  /**
   * Get a single agent by ID
   * Handles multiple ID formats: "local-{id}", raw "{id}", username, tokenId
   */
  async getAgent(agentId: string): Promise<AgentResult | null> {
    // Handle different ID formats
    const id = agentId.replace('local-', '').replace('agent-', '')
    const numericId = parseInt(id, 10)
    
    const agent = await prisma.user.findFirst({
      where: {
        OR: [
          { id },
          { username: agentId },
          { username: id },
          ...(isNaN(numericId) ? [] : [{ nftTokenId: numericId }])
        ],
        isAgent: true
      },
      include: {
        AgentPerformanceMetrics: true
      }
    })
    
    if (!agent) return null
    
    return { profile: this.transformToProfile(agent) }
  }

  /**
   * Get all registered agents
   */
  async getAllAgents(): Promise<AgentResult[]> {
    const agents = await prisma.user.findMany({
      where: {
        isAgent: true,
        onChainRegistered: true,
        walletAddress: { not: null }
      },
      include: {
        AgentPerformanceMetrics: true
      },
      orderBy: {
        reputationPoints: 'desc'
      },
      take: 100
    })

    return agents.map(agent => ({
      profile: this.transformToProfile(agent)
    }))
  }
  
  /**
   * Transform database User to AgentProfile
   */
  private transformToProfile(agent: User & { AgentPerformanceMetrics?: AgentPerformanceMetrics | null }): AgentProfile {
    const capabilities = this.parseCapabilities(agent)
    const reputation = this.buildReputation(agent)
    
    return {
      agentId: `local-${agent.id}`,
      tokenId: agent.nftTokenId || 0,
      address: agent.walletAddress!,
      name: agent.displayName || agent.username || 'Agent',
      endpoint: this.buildA2AEndpoint(),
      capabilities,
      reputation,
      isActive: agent.agentStatus === 'active'
    }
  }
  
  /**
   * Parse agent capabilities from database fields
   */
  private parseCapabilities(agent: User): AgentCapabilities {
    const strategies: string[] = []
    
    // Parse from agentTradingStrategy
    if (agent.agentTradingStrategy) {
      strategies.push(agent.agentTradingStrategy)
    }
    
    // Add default strategies based on permissions
    if (agent.autonomousTrading) {
      strategies.push('autonomous-trading', 'prediction-markets')
    }
    if (agent.autonomousPosting) {
      strategies.push('social-interaction')
    }
    
    const markets = ['prediction', 'perpetuals', 'pools']
    
    const actions = [
      'analyze', 'predict',
      ...(agent.autonomousTrading ? ['trade', 'buy_prediction', 'sell_prediction'] : []),
      ...(agent.autonomousPosting ? ['post', 'comment', 'share'] : []),
      'get_balance', 'get_positions'
    ]
    
    return {
      strategies: [...new Set(strategies)],
      markets,
      actions,
      version: '1.0.0',
      platform: 'babylon',
      userType: 'agent',
      autonomousTrading: agent.autonomousTrading || false,
      autonomousPosting: agent.autonomousPosting || false
    }
  }
  
  /**
   * Build reputation from database fields
   */
  private buildReputation(agent: User & { AgentPerformanceMetrics?: AgentPerformanceMetrics | null }) {
    const metrics = agent.AgentPerformanceMetrics
    
    return {
      totalBets: Number(metrics?.totalTrades || 0),
      winningBets: Number(metrics?.profitableTrades || 0),
      accuracyScore: Number(metrics?.winRate || 0),
      trustScore: agent.reputationPoints / 1000,
      totalVolume: agent.lifetimePnL?.toString() || '0',
      profitLoss: parseFloat(agent.lifetimePnL?.toString() || '0'),
      isBanned: agent.agentStatus === 'banned'
    }
  }
  
  /**
   * Build A2A endpoint URL
   */
  private buildA2AEndpoint(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.market'
    return `${baseUrl}/a2a`
  }
}

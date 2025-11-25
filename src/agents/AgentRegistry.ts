/**
 * Agent Registry
 * 
 * Local registry of agents with search capabilities.
 * Provides interface for AgentDiscoveryService (Agent0 SDK compatibility).
 * 
 * @deprecated This class is maintained for Agent0 SDK compatibility.
 * For new code, use AgentRegistryService from @/lib/services/agent-registry.service
 */

import type { AgentProfile } from '@/types/a2a'
import { db } from '@/db'

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
   * 
   * @description Implements Agent0 SDK IAgentDiscoveryService interface.
   * Currently returns agents from database. For more advanced filtering,
   * use AgentRegistryService.discoverAgents() instead.
   */
  search(_params: SearchParams): AgentResult[] {
    // Note: This is synchronous for Agent0 SDK compatibility, but limits functionality
    // For async search with full filtering, use AgentRegistryService.discoverAgents()
    // For now, return empty array - AgentDiscoveryService will use getAllAgents() instead
    return []
  }

  /**
   * Get a single agent by ID
   * 
   * @description Implements Agent0 SDK IAgentDiscoveryService interface.
   * Currently returns null. Use AgentRegistryService.getAgentById() for actual lookups.
   */
  getAgent(_agentId: string): AgentResult | null {
    // Note: This is synchronous for Agent0 SDK compatibility, but limits functionality
    // For async lookups, use AgentRegistryService.getAgentById() instead
    return null
  }

  /**
   * Get all registered agents
   */
  async getAllAgents(): Promise<AgentResult[]> {
    const agents = await db.user.findMany({
      where: {
        isAgent: true,
        managedBy: { not: null },
      },
    })

    // Get performance metrics for all agents
    const agentIds = agents.map(a => a.id)
    const performanceMetrics = await db.agentPerformanceMetrics.findMany({
      where: { userId: { in: agentIds } },
    })
    const metricsMap = new Map(performanceMetrics.map(m => [m.userId, m]))

    return agents.map((agent) => {
      const metrics = metricsMap.get(agent.id)
      const compositeScore = metrics?.reputationScore ?? 0
      const trustScore = metrics?.onChainTrustScore ?? compositeScore

      return {
        profile: {
          agentId: agent.id,
          tokenId: agent.nftTokenId ?? 0,
          address: agent.walletAddress ?? '',
          name: agent.displayName ?? agent.username ?? 'Unknown agent',
          endpoint: '',
          capabilities: {
            strategies: [],
            markets: [],
            actions: [],
            version: '1.0.0',
            skills: [],
            domains: [],
          },
          reputation: {
            totalBets: metrics?.gamesPlayed ?? 0,
            winningBets: metrics?.gamesWon ?? 0,
            accuracyScore: metrics?.onChainAccuracyScore ?? compositeScore,
            trustScore,
            totalVolume: (metrics?.gamesPlayed ?? 0).toString(),
            profitLoss: metrics?.averageFeedbackScore ?? 0,
            isBanned: false,
          },
          isActive: true,
        },
      }
    })
  }
}

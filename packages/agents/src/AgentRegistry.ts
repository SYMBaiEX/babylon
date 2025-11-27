/**
 * Agent Registry
 *
 * Local registry of agents with search capabilities.
 * Provides interface for AgentDiscoveryService (Agent0 SDK compatibility).
 *
 * @deprecated This class is maintained for Agent0 SDK compatibility.
 * For new code, use AgentRegistryService from @babylon/agents/services/agent-registry.service
 */

import { db } from '@babylon/db';
import type { AgentProfile } from '@babylon/a2a';

interface SearchParams {
  strategies?: string[];
  minReputation?: number;
}

interface AgentResult {
  profile: AgentProfile;
}

export class AgentRegistry {
  /**
   * Search for agents based on filters
   *
   * Implements Agent0 SDK IAgentDiscoveryService interface.
   * Returns empty array for synchronous compatibility. For async search with full filtering,
   * use AgentRegistryService.discoverAgents() instead.
   *
   * @param _params - Search parameters (unused, maintained for interface compatibility)
   * @returns Empty array - AgentDiscoveryService uses getAllAgents() for actual search
   */
  search(_params: SearchParams): AgentResult[] {
    return [];
  }

  /**
   * Get a single agent by ID
   *
   * Implements Agent0 SDK IAgentDiscoveryService interface.
   * Returns null for synchronous compatibility. Use AgentRegistryService.getAgentById()
   * for actual async lookups.
   *
   * @param _agentId - Agent ID to lookup (unused, maintained for interface compatibility)
   * @returns null - Use AgentRegistryService.getAgentById() for actual lookups
   */
  getAgent(_agentId: string): AgentResult | null {
    return null;
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
    });

    // Get performance metrics for all agents
    const agentIds = agents.map((a) => a.id);
    const performanceMetrics = await db.agentPerformanceMetrics.findMany({
      where: { userId: { in: agentIds } },
    });
    const metricsMap = new Map(performanceMetrics.map((m) => [m.userId, m]));

    return agents.map((agent) => {
      const metrics = metricsMap.get(agent.id);
      const compositeScore = metrics?.reputationScore ?? 0;
      const trustScore = metrics?.onChainTrustScore ?? compositeScore;

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
      };
    });
  }
}

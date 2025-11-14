/**
 * Unified Discovery Service
 * 
 * Merges local agent registry with Agent0 network discovery
 * to provide comprehensive agent search.
 */

import type { AgentProfile } from '@/types/a2a'
import { AgentRegistry } from '../AgentRegistry'
import { ReputationBridge } from './ReputationBridge'
import { SubgraphClient, type SubgraphAgent } from './SubgraphClient'
import type { DiscoveryFilters, IReputationBridge, IUnifiedDiscoveryService } from './types'
import { z } from 'zod'

const CapabilitiesSchema = z.object({
  strategies: z.array(z.string()).optional(),
  markets: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  version: z.string().optional(),
});

export class UnifiedDiscoveryService implements IUnifiedDiscoveryService {
  private localRegistry: AgentRegistry
  private subgraphClient: SubgraphClient
  private reputationBridge: IReputationBridge | null
  
  constructor(
    localRegistry: AgentRegistry,
    subgraphClient: SubgraphClient,
    reputationBridge?: IReputationBridge | null
  ) {
    this.localRegistry = localRegistry
    this.subgraphClient = subgraphClient
    this.reputationBridge = reputationBridge || null
  }
  
  /**
   * Discover agents from both local registry and Agent0 network
   */
  async discoverAgents(filters: DiscoveryFilters): Promise<AgentProfile[]> {
    const results: AgentProfile[] = []
    
    const localAgents = await this.localRegistry.search({
      strategies: filters.strategies,
      minReputation: filters.minReputation
    })
    
    results.push(...localAgents.map((r: { profile: AgentProfile }) => r.profile))
    
    if (filters.includeExternal && process.env.AGENT0_ENABLED === 'true') {
      const externalAgents = await this.subgraphClient.searchAgents({
        strategies: filters.strategies,
        markets: filters.markets,
        minTrustScore: filters.minReputation
      })
      
      for (const agent0Data of externalAgents) {
        const profile = await this.transformAgent0Profile(agent0Data, this.reputationBridge)
        results.push(profile)
      }
    }
    
    return this.deduplicateAndSort(results)
  }
  
  /**
   * Transform Agent0 subgraph data to Babylon AgentProfile format
   */
  private async transformAgent0Profile(
    agent0Data: SubgraphAgent,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile> {
    // Safely parse capabilities
    let capabilities = {
      strategies: [] as string[],
      markets: [] as string[],
      actions: [] as string[],
      version: '1.0.0',
    }
    
    if (agent0Data.capabilities) {
      try {
        const parsed = JSON.parse(agent0Data.capabilities)
        const validation = CapabilitiesSchema.safeParse(parsed)
        if (validation.success) {
          capabilities = {
            strategies: validation.data.strategies ?? [],
            markets: validation.data.markets ?? [],
            actions: [],
            version: validation.data.version ?? '1.0.0',
          }
        }
      } catch {
        // Invalid capabilities, use defaults
      }
    }
    
    let reputation
    if (reputationBridge) {
      const aggregated = await reputationBridge.getAggregatedReputation(agent0Data.tokenId)
      reputation = {
        totalBets: aggregated.totalBets,
        winningBets: aggregated.winningBets,
        accuracyScore: aggregated.accuracyScore,
        trustScore: aggregated.trustScore,
        totalVolume: aggregated.totalVolume,
        profitLoss: aggregated.profitLoss,
        isBanned: aggregated.isBanned
      }
    } else if (agent0Data.reputation) {
      reputation = {
        totalBets: agent0Data.reputation.totalBets,
        winningBets: agent0Data.reputation.winningBets,
        accuracyScore: agent0Data.reputation.accuracyScore / 100,
        trustScore: agent0Data.reputation.trustScore / 100,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false
      }
    } else {
      // Default reputation if none available
      reputation = {
        totalBets: 0,
        winningBets: 0,
        accuracyScore: 0,
        trustScore: 0,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false
      }
    }
    
    return {
      agentId: `agent0-${agent0Data.tokenId}`,
      tokenId: agent0Data.tokenId,
      address: agent0Data.walletAddress,
      name: agent0Data.name,
      endpoint: agent0Data.a2aEndpoint || '',
      capabilities,
      reputation,
      isActive: true
    }
  }
  
  /**
   * Deduplicate agents by address and sort by reputation
   */
  private deduplicateAndSort(agents: AgentProfile[]): AgentProfile[] {
    // Deduplicate by address, prefer local agents (those without 'agent0-' prefix)
    const seen = new Map<string, AgentProfile>()
    
    for (const agent of agents) {
      const address = agent.address.toLowerCase()
      const existing = seen.get(address)
      
      if (!existing || (agent.agentId && !agent.agentId.startsWith('agent0-'))) {
        seen.set(address, agent)
      }
    }
    
    // Sort by trust score (descending)
    return Array.from(seen.values()).sort(
      (a, b) => b.reputation.trustScore - a.reputation.trustScore
    )
  }
  
  /**
   * Get agent by ID (searches both local and external)
   */
  async getAgent(agentId: string): Promise<AgentProfile | null> {
    if (agentId.startsWith('agent0-')) {
      const tokenId = parseInt(agentId.replace('agent0-', ''), 10)
      const agent0Data = await this.subgraphClient.getAgent(tokenId)
      if (!agent0Data) {
        return null
      }
      return this.transformAgent0Profile(agent0Data, this.reputationBridge)
    }

    const localAgent = await this.localRegistry.getAgent(agentId)
    return localAgent?.profile || null
  }
}

/**
 * Get or create singleton UnifiedDiscoveryService instance
 */
let unifiedDiscoveryInstance: UnifiedDiscoveryService | null = null

export function getUnifiedDiscoveryService(): UnifiedDiscoveryService {
  if (!unifiedDiscoveryInstance) {
    const localRegistry = new AgentRegistry()
    const subgraphClient = new SubgraphClient()
    
    let reputationBridge: ReputationBridge | null = null
    if (process.env.AGENT0_ENABLED === 'true') {
      reputationBridge = new ReputationBridge(undefined)
    }
    
    unifiedDiscoveryInstance = new UnifiedDiscoveryService(
      localRegistry,
      subgraphClient,
      reputationBridge
    )
  }
  
  return unifiedDiscoveryInstance
}


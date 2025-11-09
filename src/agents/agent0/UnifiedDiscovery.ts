/**
 * Unified Discovery Service
 * 
 * Merges local agent registry with Agent0 network discovery
 * to provide comprehensive agent search.
 */

import type { AgentProfile } from '@/a2a/types'
import { AgentRegistry } from '../AgentRegistry'
import { ReputationBridge } from './ReputationBridge'
import { getAgent0Client } from './Agent0Client'
import type { Agent0SearchResult } from './types'
import type { DiscoveryFilters, IReputationBridge, IUnifiedDiscoveryService } from './types'
import { logger } from '@/lib/logger'

/**
 * Unified Discovery Service
 * 
 * Uses Agent0 SDK directly - the SDK automatically queries the subgraph internally.
 * No need for separate SubgraphClient - cleaner code using SDK as intended.
 */
export class UnifiedDiscoveryService implements IUnifiedDiscoveryService {
  private localRegistry: AgentRegistry
  private reputationBridge: IReputationBridge | null
  
  constructor(
    localRegistry: AgentRegistry,
    reputationBridge?: IReputationBridge | null
  ) {
    this.localRegistry = localRegistry
    this.reputationBridge = reputationBridge || null
  }
  
  /**
   * Discover agents from both local registry and Agent0 network
   * Uses Agent0 SDK which automatically queries the subgraph
   */
  async discoverAgents(filters: DiscoveryFilters): Promise<AgentProfile[]> {
    const results: AgentProfile[] = []
    
    // Search local registry
    const localAgents = this.localRegistry.search({
      strategies: filters.strategies,
      minReputation: filters.minReputation
    })
    
    results.push(...localAgents.map(r => r.profile))
    
    // Search Agent0 network using SDK (subgraph is queried automatically)
    if (filters.includeExternal && process.env.AGENT0_ENABLED === 'true') {
      try {
        const agent0Client = getAgent0Client()
        const externalAgents = await agent0Client.searchAgents({
          strategies: filters.strategies,
          markets: filters.markets,
          minReputation: filters.minReputation
        })
        
        for (const agent0Data of externalAgents) {
          const profile = await this.transformAgent0SearchResult(agent0Data, this.reputationBridge)
          if (profile) {
            results.push(profile)
          }
        }
        
        logger.info('Discovered agents from Agent0 network', {
          externalCount: externalAgents.length,
          totalCount: results.length
        }, 'UnifiedDiscovery')
      } catch (error) {
        logger.error('Failed to discover external agents', { error }, 'UnifiedDiscovery')
        // Continue with local agents only
      }
    }
    
    return this.deduplicateAndSort(results)
  }
  
  /**
   * Transform Agent0 SDK search result to Babylon AgentProfile format
   */
  private async transformAgent0SearchResult(
    agent0Data: Agent0SearchResult,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile | null> {
    let reputation
    if (reputationBridge) {
      try {
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
      } catch {
        // Fall back to search result reputation
        reputation = {
          totalBets: 0,
          winningBets: 0,
          accuracyScore: agent0Data.reputation.accuracyScore / 100,
          trustScore: agent0Data.reputation.trustScore / 100,
          totalVolume: '0',
          profitLoss: 0,
          isBanned: false
        }
      }
    } else {
      reputation = {
        totalBets: 0,
        winningBets: 0,
        accuracyScore: agent0Data.reputation.accuracyScore / 100,
        trustScore: agent0Data.reputation.trustScore / 100,
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
      endpoint: '', // Would need full profile for endpoints
      capabilities: agent0Data.capabilities,
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
      
      // Prefer local agents over external ones
      if (!existing || agent.agentId && !agent.agentId.startsWith('agent0-')) {
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
   * Uses Agent0 SDK which automatically handles subgraph queries
   */
  async getAgent(agentId: string): Promise<AgentProfile | null> {
    // Check if it's an external agent ID
    if (agentId.startsWith('agent0-')) {
      const tokenId = parseInt(agentId.replace('agent0-', ''), 10)
      if (isNaN(tokenId)) {
        return null
      }
      
      try {
        const agent0Client = getAgent0Client()
        const profile = await agent0Client.getAgentProfile(tokenId)
        
        if (!profile) {
          return null
        }
        
        // Transform to AgentProfile format
        let reputation
        if (this.reputationBridge) {
          const aggregated = await this.reputationBridge.getAggregatedReputation(tokenId)
          reputation = {
            totalBets: aggregated.totalBets,
            winningBets: aggregated.winningBets,
            accuracyScore: aggregated.accuracyScore,
            trustScore: aggregated.trustScore,
            totalVolume: aggregated.totalVolume,
            profitLoss: aggregated.profitLoss,
            isBanned: aggregated.isBanned
          }
        } else {
          reputation = {
            totalBets: 0,
            winningBets: 0,
            accuracyScore: profile.reputation.accuracyScore / 100,
            trustScore: profile.reputation.trustScore / 100,
            totalVolume: '0',
            profitLoss: 0,
            isBanned: false
          }
        }
        
        return {
          agentId: `agent0-${tokenId}`,
          tokenId,
          address: profile.walletAddress,
          name: profile.name,
          endpoint: '',
          capabilities: profile.capabilities,
          reputation,
          isActive: true
        }
      } catch (error) {
        logger.error('Failed to get agent from Agent0', { agentId, error }, 'UnifiedDiscovery')
        return null
      }
    }
    
    // Check local registry
    const localAgent = this.localRegistry.getAgent(agentId)
    return localAgent?.profile || null
  }
}

/**
 * Get or create singleton UnifiedDiscoveryService instance
 */
let unifiedDiscoveryInstance: UnifiedDiscoveryService | null = null

/**
 * Get or create singleton UnifiedDiscoveryService instance
 * Uses Agent0 SDK (no separate subgraph client needed)
 */
export function getUnifiedDiscoveryService(): UnifiedDiscoveryService {
  if (!unifiedDiscoveryInstance) {
    const localRegistry = new AgentRegistry()
    
    let reputationBridge: ReputationBridge | null = null
    if (process.env.AGENT0_ENABLED === 'true') {
      reputationBridge = new ReputationBridge(null)
    }
    
    unifiedDiscoveryInstance = new UnifiedDiscoveryService(
      localRegistry,
      reputationBridge
    )
  }
  
  return unifiedDiscoveryInstance
}


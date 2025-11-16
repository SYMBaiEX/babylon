/**
 * Agent Discovery Service
 * 
 * @module agents/agent0/AgentDiscovery
 * 
 * @description
 * Unified agent discovery service that merges results from:
 * - Local agent registry (Babylon's internal agents)
 * - Agent0 network (external agents via subgraph)
 * - Optional reputation aggregation from multiple sources
 * 
 * Provides comprehensive agent search with deduplication and reputation-based sorting.
 * Enables discovering both internal Babylon agents and external Agent0 network agents.
 * 
 * @example
 * ```typescript
 * const discovery = getAgentDiscoveryService()
 * 
 * // Find prediction market agents (local + external)
 * const agents = await discovery.discoverAgents({
 *   strategies: ['prediction-markets'],
 *   minReputation: 50,
 *   includeExternal: true
 * })
 * 
 * // Get specific agent by ID
 * const agent = await discovery.getAgent('agent0-123')
 * ```
 */

import type { AgentProfile } from '@/types/a2a'
import { AgentRegistry } from '../AgentRegistry'
// Agent0Client available if needed for future enhancements
import type { DiscoveryFilters, IAgentDiscoveryService, IReputationBridge } from './types'
import { SubgraphClient, type SubgraphAgent } from './SubgraphClient'
import { ReputationBridge } from './ReputationBridge'
import { parseCapabilities } from './capabilities-schema'

/**
 * Agent Discovery Service Class
 * 
 * @class AgentDiscoveryService
 * @implements {IAgentDiscoveryService}
 * 
 * @description
 * Coordinates agent discovery across local and external sources with
 * reputation aggregation and result deduplication.
 */
export class AgentDiscoveryService implements IAgentDiscoveryService {
  private localRegistry: AgentRegistry
  private subgraphClient: SubgraphClient
  private reputationBridge: IReputationBridge | null
  
  /**
   * Creates AgentDiscoveryService instance
   * 
   * @param localRegistry - Local Babylon agent registry
   * @param subgraphClient - Agent0 subgraph client for external agents
   * @param reputationBridge - Optional reputation aggregation bridge
   */
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
   * Discover agents from local registry and Agent0 network
   * 
   * @param filters - Discovery filters
   * @param filters.strategies - Filter by strategy names
   * @param filters.markets - Filter by market types
   * @param filters.minReputation - Minimum reputation threshold
   * @param filters.includeExternal - Include external Agent0 agents (requires AGENT0_ENABLED=true)
   * @returns Promise resolving to deduplicated and sorted agent profiles
   * 
   * @description
   * Searches both local and external agent sources, merges results,
   * deduplicates by address (preferring local), and sorts by reputation.
   * 
   * @example
   * ```typescript
   * // Find high-reputation prediction agents
   * const agents = await service.discoverAgents({
   *   strategies: ['prediction-markets'],
   *   minReputation: 100,
   *   includeExternal: true
   * })
   * ```
   * 
   * @remarks
   * - External agents only included if AGENT0_ENABLED env var is 'true'
   * - Results deduplicated by wallet address (local agents take precedence)
   * - Sorted by trust score descending
   */
  async discoverAgents(filters: DiscoveryFilters): Promise<AgentProfile[]> {
    const results: AgentProfile[] = []
    
    const localAgents = this.localRegistry.search({
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
   * 
   * @private
   * @param agent0Data - Raw agent data from Agent0 subgraph
   * @param reputationBridge - Optional reputation bridge for aggregated scores
   * @returns Promise resolving to Babylon AgentProfile
   * 
   * @description
   * Converts Agent0 agent format to Babylon's AgentProfile format.
   * If reputation bridge provided, uses aggregated reputation from multiple sources.
   * Otherwise, uses reputation data directly from subgraph.
   */
  private async transformAgent0Profile(
    agent0Data: SubgraphAgent,
    reputationBridge?: IReputationBridge | null
  ): Promise<AgentProfile> {
    const parsed = JSON.parse(agent0Data.capabilities!)
    const capabilities = parseCapabilities(parsed)
    
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
    } else {
      reputation = {
        totalBets: agent0Data.reputation!.totalBets,
        winningBets: agent0Data.reputation!.winningBets,
        accuracyScore: agent0Data.reputation!.accuracyScore / 100,
        trustScore: agent0Data.reputation!.trustScore / 100,
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
      endpoint: agent0Data.a2aEndpoint!,
      capabilities,
      reputation,
      isActive: true
    }
  }
  
  /**
   * Deduplicate agents by address and sort by reputation
   * 
   * @private
   * @param agents - Array of agent profiles (potentially with duplicates)
   * @returns Deduplicated and sorted agent profiles
   * 
   * @description
   * Removes duplicate agents by wallet address, preferring local agents
   * (those without 'agent0-' prefix in agentId). Sorts results by trust score descending.
   * 
   * @remarks
   * - Case-insensitive address comparison
   * - Local agents take precedence over external agents with same address
   * - Final sort by trustScore descending (highest reputation first)
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
   * Get agent by ID from local or external sources
   * 
   * @param agentId - Agent identifier (local ID or 'agent0-{tokenId}' for external)
   * @returns Promise resolving to agent profile
   * @throws {Error} If agent not found
   * 
   * @description
   * Fetches agent profile by ID. Routes to external Agent0 network if ID has
   * 'agent0-' prefix, otherwise queries local registry.
   * 
   * @example
   * ```typescript
   * // Get external agent
   * const externalAgent = await service.getAgent('agent0-123')
   * 
   * // Get local agent
   * const localAgent = await service.getAgent('babylon-agent-456')
   * ```
   */
  async getAgent(agentId: string): Promise<AgentProfile> {
    if (agentId.startsWith('agent0-')) {
      const tokenId = parseInt(agentId.replace('agent0-', ''), 10)
      const agent0Data = await this.subgraphClient.getAgent(tokenId)
      return this.transformAgent0Profile(agent0Data, this.reputationBridge)
    }
    
    const localAgent = this.localRegistry.getAgent(agentId)
    return localAgent!.profile
  }
}

/**
 * Singleton AgentDiscoveryService instance
 * @internal
 */
let agentDiscoveryInstance: AgentDiscoveryService | null = null

/**
 * Get or create singleton AgentDiscoveryService instance
 * 
 * @returns Singleton AgentDiscoveryService instance
 * 
 * @description
 * Factory function providing singleton access to AgentDiscoveryService.
 * Automatically creates and wires together:
 * - Local agent registry
 * - Agent0 subgraph client
 * - Reputation bridge (if AGENT0_ENABLED=true)
 * 
 * @example
 * ```typescript
 * const discovery = getAgentDiscoveryService()
 * const agents = await discovery.discoverAgents({ includeExternal: true })
 * ```
 */
export function getAgentDiscoveryService(): AgentDiscoveryService {
  if (!agentDiscoveryInstance) {
    const localRegistry = new AgentRegistry()
    const subgraphClient = new SubgraphClient()
    
    let reputationBridge: ReputationBridge | null = null
    if (process.env.AGENT0_ENABLED === 'true') {
      reputationBridge = new ReputationBridge(undefined)
    }
    
    agentDiscoveryInstance = new AgentDiscoveryService(
      localRegistry,
      subgraphClient,
      reputationBridge
    )
  }
  
  return agentDiscoveryInstance
}


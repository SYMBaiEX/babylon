/**
 * Agent Registry Service
 * 
 * @module agents/AgentRegistry
 * 
 * @description
 * Local registry for managing and discovering agents within the Babylon ecosystem.
 * Provides search capabilities and agent profile retrieval from the database.
 * This serves as the internal agent directory before querying external Agent0 networks.
 * 
 * @example
 * ```typescript
 * const registry = new AgentRegistry()
 * const agents = registry.search({ strategies: ['prediction-markets'], minReputation: 100 })
 * const allAgents = await registry.getAllAgents()
 * ```
 */

import type { AgentProfile } from '@/types/a2a'
import { prisma } from '@/lib/prisma'

/**
 * Search parameters for agent filtering
 * 
 * @interface SearchParams
 */
interface SearchParams {
  /** List of strategy names to filter by (e.g., 'prediction-markets', 'perpetuals') */
  strategies?: string[]
  /** Minimum reputation threshold (in reputation points) */
  minReputation?: number
}

/**
 * Agent search result wrapper
 * 
 * @interface AgentResult
 */
interface AgentResult {
  /** Complete agent profile including capabilities and reputation */
  profile: AgentProfile
}

/**
 * Agent Registry Class
 * 
 * @class AgentRegistry
 * @description Manages the local agent database with search and retrieval capabilities
 */
export class AgentRegistry {
  /**
   * Search for agents based on filters
   * 
   * @param _params - Search parameters including strategies and reputation filters
   * @returns Array of matching agent results
   * 
   * @remarks
   * Currently returns empty array as stub. Will be populated with database queries
   * to filter agents by strategies, reputation, and other criteria.
   */
  search(_params: SearchParams): AgentResult[] {
    // For now return empty array - this will be populated with actual DB queries later
    // This is a stub to satisfy the AgentDiscovery interface
    return []
  }

  /**
   * Get a single agent by ID
   * 
   * @param _agentId - The unique identifier of the agent
   * @returns Agent result if found, null otherwise
   * 
   * @remarks
   * Currently returns null as stub. Will be populated with database query
   * to fetch agent profile by ID.
   */
  getAgent(_agentId: string): AgentResult | null {
    // For now return null - this will be populated with actual DB queries later
    // This is a stub to satisfy the AgentDiscovery interface
    return null
  }

  /**
   * Get all registered agents from the database
   * 
   * @returns Promise resolving to array of all agent results
   * 
   * @description
   * Queries the database for all users marked as agents (isAgent=true) with a manager.
   * Transforms database records into AgentProfile format with capabilities and reputation.
   * 
   * @remarks
   * - Filters for agents with managedBy field set (autonomous agents)
   * - Calculates trust score from reputation points (points / 1000)
   * - Returns empty capabilities arrays as they're not yet stored in the user table
   */
  async getAllAgents(): Promise<AgentResult[]> {
    const agents = await prisma.user.findMany({
      where: {
        isAgent: true,
        managedBy: { not: null }
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        walletAddress: true,
        reputationPoints: true
      }
    })

    return agents.map(agent => ({
      profile: {
        agentId: agent.id,
        tokenId: 0,
        address: agent.walletAddress!,
        name: agent.displayName!,
        endpoint: '',
        capabilities: {
          strategies: [],
          markets: [],
          actions: [],
          version: '1.0.0'
        },
        reputation: {
          totalBets: 0,
          winningBets: 0,
          accuracyScore: 0,
          trustScore: agent.reputationPoints / 1000,
          totalVolume: '0',
          profitLoss: 0,
          isBanned: false
        },
        isActive: true
      }
    }))
  }
}

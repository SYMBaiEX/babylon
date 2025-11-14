/**
 * Agent0 Subgraph Client
 * 
 * Queries the Agent0 subgraph for fast agent discovery and search.
 * Updated to match the actual Agent0 subgraph schema (agentId, metadata key-value pairs).
 */

import { GraphQLClient } from 'graphql-request'
import { z } from 'zod'

const CapabilitiesSchema = z.object({
  strategies: z.array(z.string()).optional(),
  markets: z.array(z.string()).optional(),
});

// Raw subgraph response structure
interface RawSubgraphAgent {
  id: string
  chainId: string
  agentId: string
  agentURI: string
  owner: string
  createdAt: string
  totalFeedback: number
  metadata: Array<{
    key: string
    value: string
  }>
}

// Transformed agent structure (backward compatible)
export interface SubgraphAgent {
  id: string
  tokenId: number
  name: string
  type?: string
  metadataCID: string
  walletAddress: string
  mcpEndpoint?: string
  a2aEndpoint?: string
  capabilities?: string  // JSON string
  reputation?: {
    totalBets: number
    winningBets: number
    trustScore: number
    accuracyScore: number
  }
  feedbacks?: Array<{
    from: string
    rating: number
    comment: string
    timestamp: number
  }>
}

export class SubgraphClient {
  private client: GraphQLClient | null = null
  private subgraphUrl: string | null = null

  constructor() {
    const subgraphUrl = process.env.AGENT0_SUBGRAPH_URL
    
    // Only initialize if Agent0 is enabled and subgraph URL is provided
    // This allows the client to exist but be lazy-initialized
    if (subgraphUrl) {
      this.subgraphUrl = subgraphUrl
      this.client = new GraphQLClient(subgraphUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
    } else if (process.env.AGENT0_ENABLED === 'true') {
      // Only throw if Agent0 is explicitly enabled but subgraph URL is missing
      throw new Error('AGENT0_SUBGRAPH_URL environment variable is required when AGENT0_ENABLED=true')
    }
    // Otherwise, client remains null and methods will handle gracefully
  }
  
  private ensureClient(): void {
    if (!this.client || !this.subgraphUrl) {
      throw new Error('SubgraphClient not initialized. AGENT0_SUBGRAPH_URL is required when using Agent0 features.')
    }
  }

  /**
   * Parse metadata key-value pairs into an object
   */
  private parseMetadata(metadata: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {}
    
    for (const item of metadata) {
      let decoded = item.value
      if (item.value.startsWith('0x')) {
        decoded = Buffer.from(item.value.slice(2), 'hex').toString('utf8')
      }
      result[item.key] = decoded
    }
    
    return result
  }

  /**
   * Transform raw subgraph agent to SubgraphAgent format
   */
  private transformAgent(raw: RawSubgraphAgent): SubgraphAgent {
    const meta = this.parseMetadata(raw.metadata)
    
    const capabilities = meta.capabilities
      ? CapabilitiesSchema.safeParse(JSON.parse(meta.capabilities)).success
        ? meta.capabilities
        : undefined
      : undefined

    // Extract reputation from metadata if available
    // The subgraph may store reputation data in metadata or we may need to calculate from totalFeedback
    let reputation: SubgraphAgent['reputation'] = undefined
    if (meta.reputation) {
      try {
        const repData = JSON.parse(meta.reputation)
        reputation = {
          totalBets: repData.totalBets || 0,
          winningBets: repData.winningBets || 0,
          trustScore: repData.trustScore || 0,
          accuracyScore: repData.accuracyScore || 0
        }
      } catch {
        // Invalid reputation data, leave as undefined
      }
    } else if (raw.totalFeedback > 0) {
      // If we have feedback count but no explicit reputation, provide a basic structure
      // Actual reputation calculation would need to query feedbacks separately
      reputation = {
        totalBets: raw.totalFeedback,
        winningBets: 0,
        trustScore: 0,
        accuracyScore: 0
      }
    }

    return {
      id: raw.id,
      tokenId: parseInt(raw.agentId, 10),
      name: meta.name || `Agent ${raw.agentId}`,
      type: meta.type,
      metadataCID: raw.agentURI,
      walletAddress: raw.owner,
      mcpEndpoint: meta.mcpEndpoint,
      a2aEndpoint: meta.a2aEndpoint,
      capabilities,
      reputation,
      feedbacks: []
    }
  }
  
  /**
   * Get agent by token ID
   */
  async getAgent(tokenId: number): Promise<SubgraphAgent> {
    this.ensureClient()
    
    const query = `
      query GetAgent($agentId: String!) {
        agents(where: { agentId: $agentId }) {
          id
          chainId
          agentId
          agentURI
          owner
          createdAt
          totalFeedback
          metadata {
            key
            value
          }
        }
      }
    `
    
    const data = await this.client!.request(query, { 
      agentId: tokenId.toString() 
    }) as { agents: RawSubgraphAgent[] }
    
    if (!data.agents || data.agents.length === 0) {
      throw new Error(`Agent with tokenId ${tokenId} not found`)
    }
    
    return this.transformAgent(data.agents[0]!)
  }
  
  /**
   * Search agents by filters
   */
  async searchAgents(filters: {
    type?: string
    strategies?: string[]
    markets?: string[]
    minTrustScore?: number
    limit?: number
  }): Promise<SubgraphAgent[]> {
    this.ensureClient()
    
    const limit = filters.limit || 100
    
    // Query all agents, we'll filter in-memory since metadata is key-value
    const query = `
      query SearchAgents($limit: Int!) {
        agents(
          first: $limit
          orderBy: agentId
          orderDirection: desc
        ) {
          id
          chainId
          agentId
          agentURI
          owner
          createdAt
          totalFeedback
          metadata {
            key
            value
          }
        }
      }
    `
    
    const data = await this.client!.request(query, { limit }) as { agents: RawSubgraphAgent[] }
    let results = data.agents.map(raw => this.transformAgent(raw))
    
    // Filter by type
    if (filters.type) {
      results = results.filter(agent => agent.type === filters.type)
    }
    
    // Filter by strategies - safely handle missing capabilities
    if (filters.strategies && filters.strategies.length > 0) {
      results = results.filter(agent => {
        if (!agent.capabilities) {
          return false
        }
        try {
          const caps = JSON.parse(agent.capabilities)
          const validation = CapabilitiesSchema.safeParse(caps)
          if (!validation.success) {
            return false
          }
          const agentStrategies = validation.data.strategies ?? []
          return filters.strategies!.some(s => agentStrategies.includes(s))
        } catch {
          return false
        }
      })
    }
    
    // Filter by markets - safely handle missing capabilities
    if (filters.markets && filters.markets.length > 0) {
      results = results.filter(agent => {
        if (!agent.capabilities) {
          return false
        }
        try {
          const caps = JSON.parse(agent.capabilities)
          const validation = CapabilitiesSchema.safeParse(caps)
          if (!validation.success) {
            return false
          }
          const agentMarkets = validation.data.markets ?? []
          return filters.markets!.some(m => agentMarkets.includes(m))
        } catch {
          return false
        }
      })
    }
    
    // Filter by minTrustScore if reputation is available
    if (filters.minTrustScore !== undefined) {
      results = results.filter(agent => {
        if (!agent.reputation) {
          return false
        }
        return agent.reputation.trustScore >= filters.minTrustScore!
      })
    }
    
    return results
  }
  
  /**
   * Get all game platforms
   */
  async getGamePlatforms(filters?: {
    markets?: string[]
    minTrustScore?: number
  }): Promise<SubgraphAgent[]> {
    return this.searchAgents({
      type: 'game-platform',
      markets: filters?.markets,
      minTrustScore: filters?.minTrustScore,
      limit: 50
    })
  }
  
  /**
   * Get agent feedback
   */
  async getAgentFeedback(tokenId: number): Promise<Array<{
    from: string
    rating: number
    comment: string
    timestamp: number
  }>> {
    this.ensureClient()
    const agent = await this.getAgent(tokenId)
    return agent.feedbacks || []
  }
  
  /**
   * Check if the subgraph client is available
   */
  isAvailable(): boolean {
    return this.client !== null && this.subgraphUrl !== null
  }
}


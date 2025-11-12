/**
 * Agent0 Subgraph Client
 * 
 * Queries the Agent0 subgraph for fast agent discovery and search.
 * Updated to match the actual Agent0 subgraph schema (agentId, metadata key-value pairs).
 */

import { GraphQLClient } from 'graphql-request'

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
  private client: GraphQLClient

  constructor() {
    const subgraphUrl = process.env.AGENT0_SUBGRAPH_URL
    
    if (!subgraphUrl) {
      throw new Error('AGENT0_SUBGRAPH_URL environment variable is required')
    }
    
    this.client = new GraphQLClient(subgraphUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Parse metadata key-value pairs into an object
   */
  private parseMetadata(metadata: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {}
    
    for (const item of metadata) {
      // Try to decode hex-encoded values
      let decoded = item.value
      if (item.value.startsWith('0x')) {
        try {
          decoded = Buffer.from(item.value.slice(2), 'hex').toString('utf8')
        } catch {
          decoded = item.value
        }
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
    
    // Parse capabilities if present
    let capabilities: string | undefined
    if (meta.capabilities) {
      try {
        // Validate it's valid JSON
        JSON.parse(meta.capabilities)
        capabilities = meta.capabilities
      } catch {
        capabilities = undefined
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
      reputation: undefined, // Not available in current schema
      feedbacks: [] // Not available in current schema
    }
  }
  
  /**
   * Get agent by token ID
   */
  async getAgent(tokenId: number): Promise<SubgraphAgent | null> {
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
    
    const data = await this.client.request(query, { 
      agentId: tokenId.toString() 
    }) as { agents: RawSubgraphAgent[] }
    
    const agent = data.agents[0]
    if (!agent) {
      return null
    }
    
    return this.transformAgent(agent)
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
    
    const data = await this.client.request(query, { limit }) as { agents: RawSubgraphAgent[] }
    let results = data.agents.map(raw => this.transformAgent(raw))
    
    // Filter by type
    if (filters.type) {
      results = results.filter(agent => agent.type === filters.type)
    }
    
    // Filter by strategies
    if (filters.strategies && filters.strategies.length > 0) {
      results = results.filter(agent => {
        if (!agent.capabilities) return false
        try {
          const caps = JSON.parse(agent.capabilities)
          const agentStrategies = caps.strategies || []
          return filters.strategies!.some(s => agentStrategies.includes(s))
        } catch {
          return false
        }
      })
    }
    
    // Filter by markets
    if (filters.markets && filters.markets.length > 0) {
      results = results.filter(agent => {
        if (!agent.capabilities) return false
        try {
          const caps = JSON.parse(agent.capabilities)
          const agentMarkets = caps.markets || []
          return filters.markets!.some(m => agentMarkets.includes(m))
        } catch {
          return false
        }
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
    const agent = await this.getAgent(tokenId)
    return agent?.feedbacks || []
  }
}


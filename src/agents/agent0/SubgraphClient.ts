/**
 * Agent0 Subgraph Client
 * 
 * Queries the Agent0 subgraph for fast agent discovery and search.
 */

import { GraphQLClient } from 'graphql-request'
import { logger } from '@/lib/logger'

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
    
    // Agent0 SDK automatically resolves subgraph URL based on chainId
    // Default URLs are built into the SDK's DEFAULT_SUBGRAPH_URLS
    // Only override if you need a custom endpoint
    
    // Default for Sepolia (11155111)
    const defaultSepoliaSubgraph = 'https://gateway.thegraph.com/api/00a452ad3cd1900273ea62c1bf283f93/subgraphs/id/6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT'
    
    const endpoint = subgraphUrl || defaultSepoliaSubgraph
    
    logger.info('SubgraphClient initialized', {
      endpoint,
      isDefault: !subgraphUrl,
      note: subgraphUrl ? 'Using custom subgraph' : 'Using Agent0 default subgraph for Sepolia'
    }, 'SubgraphClient')
    
    this.client = new GraphQLClient(endpoint)
  }
  
  /**
   * Get agent by ID (chainId:tokenId format)
   */
  async getAgent(tokenId: number): Promise<SubgraphAgent | null> {
    // Agent0 subgraph uses chainId:tokenId format for ID
    const chainId = 11155111 // Sepolia
    const agentId = `${chainId}:${tokenId}`
    
    const query = `
      query GetAgent($id: ID!) {
        agent(id: $id) {
          id
          chainId
          agentId
          agentURI
          owner
          createdAt
          updatedAt
          registrationFile
          metadata
          totalFeedback
          lastActivity
        }
      }
    `
    
    try {
      const data = await this.client.request(query, { id: agentId }) as { agent: {
        id: string
        chainId: string
        agentId: string
        agentURI?: string
        owner: string
        createdAt: string
        updatedAt: string
        registrationFile?: string
        metadata?: string
        totalFeedback: number
        lastActivity?: string
      } | null }
      
      if (!data.agent) {
        return null
      }
      
      // Parse registration file to get agent details
      const regFile = data.agent.registrationFile ? JSON.parse(data.agent.registrationFile) : {}
      const metadata = data.agent.metadata ? JSON.parse(data.agent.metadata) : {}
      
      return {
        id: data.agent.id,
        tokenId,
        name: regFile.name || metadata.name || 'Unknown',
        type: regFile.type || metadata.type,
        metadataCID: data.agent.agentURI?.replace('ipfs://', '') || '',
        walletAddress: data.agent.owner || '',
        mcpEndpoint: regFile.mcpEndpoint || metadata.mcpEndpoint,
        a2aEndpoint: regFile.a2aEndpoint || metadata.a2aEndpoint,
        capabilities: regFile.capabilities ? JSON.stringify(regFile.capabilities) : undefined,
        reputation: {
          totalBets: data.agent.totalFeedback || 0,
          winningBets: 0,
          trustScore: 0,
          accuracyScore: 0,
        },
      }
    } catch (error) {
      logger.error('Failed to get agent from subgraph', { tokenId, error }, 'SubgraphClient')
      return null
    }
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
    
    // Agent0 subgraph schema uses agentId, owner, metadata, registrationFile
    const query = `
      query SearchAgents {
        agents(
          first: ${limit}
          orderBy: totalFeedback
          orderDirection: desc
        ) {
          id
          chainId
          agentId
          agentURI
          owner
          createdAt
          updatedAt
          registrationFile
          metadata
          totalFeedback
          lastActivity
        }
      }
    `
    
    try {
      const data = await this.client.request(query) as { agents: Array<{
        id: string
        chainId: string
        agentId: string
        agentURI?: string
        owner: string
        createdAt: string
        updatedAt: string
        registrationFile?: string
        metadata?: string
        totalFeedback: number
        lastActivity?: string
      }> }
      
      // Transform and filter results
      let results = data.agents.map((agent) => {
        const regFile = agent.registrationFile ? JSON.parse(agent.registrationFile) : {}
        const metadata = agent.metadata ? JSON.parse(agent.metadata) : {}
        
        // Extract token ID from agentId (format: "chainId:tokenId")
        const tokenId = parseInt(agent.agentId?.split(':')[1] || '0', 10)
        
        return {
          id: agent.id,
          tokenId,
          name: regFile.name || metadata.name || 'Unknown',
          type: regFile.type || metadata.type,
          metadataCID: agent.agentURI?.replace('ipfs://', '') || '',
          walletAddress: agent.owner || '',
          mcpEndpoint: regFile.mcpEndpoint || metadata.mcpEndpoint,
          a2aEndpoint: regFile.a2aEndpoint || metadata.a2aEndpoint,
          capabilities: regFile.capabilities ? JSON.stringify(regFile.capabilities) : undefined,
          reputation: {
            totalBets: agent.totalFeedback || 0,
            winningBets: 0,
            trustScore: 0,
            accuracyScore: 0,
          },
        }
      })
      
      // Client-side filtering (subgraph doesn't support all filters)
      if (filters.type) {
        results = results.filter(agent => agent.type === filters.type)
      }
      
      if (filters.strategies && filters.strategies.length > 0) {
        results = results.filter(agent => {
          const caps = agent.capabilities ? JSON.parse(agent.capabilities) : {}
          const agentStrategies = caps.strategies || []
          return filters.strategies!.some(s => agentStrategies.includes(s))
        })
      }
      
      if (filters.markets && filters.markets.length > 0) {
        results = results.filter(agent => {
          const caps = agent.capabilities ? JSON.parse(agent.capabilities) : {}
          const agentMarkets = caps.markets || []
          return filters.markets!.some(m => agentMarkets.includes(m))
        })
      }
      
      return results
    } catch (error) {
      logger.error('Failed to search agents in subgraph', { filters, error }, 'SubgraphClient')
      return []
    }
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


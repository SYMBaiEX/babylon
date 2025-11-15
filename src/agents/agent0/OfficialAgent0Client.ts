/**
 * Official Agent0 Client
 * 
 * Replaces custom implementation with official agent0-sdk
 * Provides proper integration with Agent0 ERC-8004 registry
 */

import { SDK } from 'agent0-sdk'
import type { AgentProfile, AgentCapabilities } from '@/types/a2a'
import { logger } from '@/lib/logger'

export interface Agent0SearchFilters {
  skills?: string[]
  minReputation?: number
  active?: boolean
  name?: string
}

/**
 * Official Agent0 client using agent0-sdk
 */
export class OfficialAgent0Client {
  private sdk: SDK
  private chainId: number = 84532  // Base Sepolia
  
  constructor() {
    // Initialize SDK for read-only queries (no signer needed)
    this.sdk = new SDK({
      chainId: this.chainId,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL
    })
    
    logger.info('Official Agent0 client initialized', {
      chainId: this.chainId,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ? 'configured' : 'default'
    })
  }
  
  /**
   * Search for agents on Agent0 registry
   */
  async searchAgents(filters: Agent0SearchFilters = {}): Promise<AgentProfile[]> {
    try {
      const results = await this.sdk.searchAgents({
        a2a: true,  // Only agents with A2A support
        a2aSkills: filters.skills,
        active: filters.active !== false,
        name: filters.name
      })
      
      logger.info('Agent0 search completed', {
        resultsCount: results.items.length,
        filters
      })
      
      // Transform to Babylon AgentProfile format
      return Promise.all(
        results.items.map(agent => this.transformToAgentProfile(agent))
      )
      
    } catch (error) {
      logger.error('Error searching Agent0 registry', error)
      return []
    }
  }
  
  /**
   * Get agent profile by tokenId
   */
  async getAgentProfile(tokenId: number): Promise<AgentProfile | null> {
    try {
      const agentId = `${this.chainId}:${tokenId}`
      const agent = await this.sdk.getAgent(agentId)
      
      if (!agent) {
        logger.warn('Agent not found in Agent0 registry', { tokenId })
        return null
      }
      
      return this.transformToAgentProfile(agent)
      
    } catch (error) {
      logger.error('Error fetching agent from Agent0', { error, tokenId })
      return null
    }
  }
  
  /**
   * Get agent by Agent0 ID (chainId:tokenId format)
   */
  async getAgent(agentId: string): Promise<AgentProfile | null> {
    try {
      const agent = await this.sdk.getAgent(agentId)
      
      if (!agent) {
        return null
      }
      
      return this.transformToAgentProfile(agent)
      
    } catch (error) {
      logger.error('Error fetching agent by ID', { error, agentId })
      return null
    }
  }
  
  /**
   * Transform Agent0 data to Babylon AgentProfile format
   */
  private transformToAgentProfile(agent: {
    agentId: string
    name: string
    walletAddress?: string
    a2aEndpoint?: string
    a2aSkills?: string[]
    a2aVersion?: string
    x402support?: boolean
    active?: boolean
    extras?: {
      averageScore?: number
    }
  }): AgentProfile {
    // Extract tokenId from agentId (format: "chainId:tokenId")
    const tokenId = parseInt(agent.agentId.split(':')[1] || '0', 10)
    
    // Parse capabilities
    const capabilities: AgentCapabilities = {
      strategies: [],
      markets: [],
      actions: agent.a2aSkills || [],
      version: agent.a2aVersion || '1.0.0',
      x402Support: agent.x402support || false
    }
    
    // Build reputation from Agent0 extras
    const reputation = {
      totalBets: 0,
      winningBets: 0,
      accuracyScore: agent.extras?.averageScore || 0,
      trustScore: agent.extras?.averageScore || 0,
      totalVolume: '0',
      profitLoss: 0,
      isBanned: false
    }
    
    return {
      agentId: agent.agentId,
      tokenId,
      address: agent.walletAddress || '0x0',
      name: agent.name,
      endpoint: agent.a2aEndpoint || '',
      capabilities,
      reputation,
      isActive: agent.active !== false
    }
  }
  
  /**
   * Get Babylon's own registration info
   */
  async getBabylonRegistration(): Promise<{
    agentId: string
    tokenId: number
    registered: boolean
  } | null> {
    try {
      const { prisma } = await import('@/lib/prisma')
      const config = await prisma.gameConfig.findUnique({
        where: { key: 'agent0_registration' }
      })
      
      if (!config?.value) {
        return null
      }
      
      const value = config.value as { agentId: string; tokenId: number }
      
      return {
        agentId: value.agentId,
        tokenId: value.tokenId,
        registered: true
      }
    } catch (error) {
      logger.error('Error getting Babylon registration', error)
      return null
    }
  }
}

/**
 * Singleton instance
 */
let officialAgent0Client: OfficialAgent0Client | null = null

export function getOfficialAgent0Client(): OfficialAgent0Client {
  if (!officialAgent0Client) {
    officialAgent0Client = new OfficialAgent0Client()
  }
  return officialAgent0Client
}


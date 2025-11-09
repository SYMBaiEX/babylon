/**
 * Game Discovery Service
 * 
 * Enables external agents to discover Babylon and other games
 * through the Agent0 registry.
 */

import { getAgent0Client } from './Agent0Client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export interface DiscoverableGame {
  tokenId: number
  name: string
  type: string
  metadataCID: string
  endpoints: {
    a2a: string
    mcp: string
    api: string
    docs?: string
    websocket?: string
  }
  capabilities: {
    markets: string[]
    actions: string[]
    protocols: string[]
    socialFeatures?: boolean
    realtime?: boolean
  }
  reputation?: {
    trustScore: number
    accuracyScore: number
  }
}

/**
 * Game Discovery Service
 * 
 * Uses Agent0 SDK directly - the SDK automatically queries the subgraph internally.
 * Clean implementation leveraging SDK's built-in functionality.
 */
export class GameDiscoveryService {
  // Uses Agent0Client singleton which handles all SDK interactions
  constructor() {
    // No initialization needed
  }
  
  /**
   * Discover games by type (prediction markets, trading games, etc.)
   * Uses Agent0 SDK which automatically queries the subgraph
   */
  async discoverGames(filters: {
    type?: string  // "game-platform", "prediction-market", etc.
    markets?: string[]  // ["prediction", "perpetuals"]
    minReputation?: number
  }): Promise<DiscoverableGame[]> {
    try {
      const agent0Client = getAgent0Client()
      
      // Use SDK's searchAgents - it automatically uses the subgraph
      const agents = await agent0Client.searchAgents({
        type: filters.type || 'game-platform',
        markets: filters.markets,
        minReputation: filters.minReputation
      })
      
      // Transform to DiscoverableGame format
      const games: DiscoverableGame[] = []
      
      for (const agent of agents) {
        games.push({
          tokenId: agent.tokenId,
          name: agent.name,
          type: filters.type || 'game-platform',
          metadataCID: agent.metadataCID,
          endpoints: {
            a2a: '', // Would be in metadata/registrationFile
            mcp: '', // Would be in metadata/registrationFile
            api: '', // Would be in metadata/registrationFile
          },
          capabilities: {
            markets: agent.capabilities.markets || [],
            actions: agent.capabilities.actions || [],
            protocols: ['a2a', 'mcp'], // Default protocols, could be extended from metadata
            socialFeatures: agent.capabilities.platform === 'babylon',
            realtime: agent.capabilities.platform === 'babylon'
          },
          reputation: {
            trustScore: agent.reputation.trustScore,
            accuracyScore: agent.reputation.accuracyScore
          }
        })
      }
      
      logger.info('Discovered games via Agent0 SDK', {
        count: games.length,
        filters
      }, 'GameDiscovery')
      
      return games
    } catch (error) {
      logger.error('Failed to discover games', { filters, error }, 'GameDiscovery')
      return []
    }
  }
  
  /**
   * Find Babylon specifically with retry logic
   */
  async findBabylon(maxRetries: number = 3): Promise<DiscoverableGame | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Discovering Babylon (attempt ${attempt}/${maxRetries})...`, undefined, 'GameDiscovery')
      
      const games = await this.discoverGames({
        type: 'game-platform',
        markets: ['prediction']
      })
      
      const babylon = games.find(g => 
        g.name.toLowerCase().includes('babylon') ||
        g.name.toLowerCase().includes('prediction market')
      )
      
      if (babylon) {
        const isValid = await this.validateEndpoints(babylon)
        if (isValid) {
          logger.info(`✅ Found and validated Babylon: ${babylon.name} (token: ${babylon.tokenId})`, undefined, 'GameDiscovery')
          return babylon
        }
        logger.warn(`Babylon found but endpoints failed validation (attempt ${attempt}/${maxRetries})`, undefined, 'GameDiscovery')
      } else {
        logger.warn(`Babylon not found in registry (attempt ${attempt}/${maxRetries})`, undefined, 'GameDiscovery')
      }
    
      // Fallback: Check database for Babylon's registration
      if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
          const config = await prisma.gameConfig.findUnique({
            where: { key: 'agent0_registration' }
          })
          
          if (config?.value && typeof config.value === 'object' && 'tokenId' in config.value) {
            const tokenId = Number(config.value.tokenId)
            const agent0Client = getAgent0Client()
            const profile = await agent0Client.getAgentProfile(tokenId)
            
            if (profile) {
              return {
                tokenId: profile.tokenId,
                name: profile.name,
                type: 'game-platform',
                metadataCID: profile.metadataCID,
                endpoints: {
                  a2a: '', // Would be in registrationFile
                  mcp: '', // Would be in registrationFile
                  api: '',
                },
                capabilities: {
                  markets: profile.capabilities.markets || [],
                  actions: profile.capabilities.actions || [],
                  protocols: ['a2a', 'mcp'], // Default protocols
                  socialFeatures: profile.capabilities.platform === 'babylon',
                  realtime: profile.capabilities.platform === 'babylon'
                },
                reputation: {
                  trustScore: profile.reputation.trustScore,
                  accuracyScore: profile.reputation.accuracyScore
                }
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to get Babylon from database', { error }, 'GameDiscovery')
        }
      }
      
      if (attempt < maxRetries) {
        const backoffMs = 1000 * attempt
        logger.info(`Retrying in ${backoffMs}ms...`, undefined, 'GameDiscovery')
        await this.sleep(backoffMs)
      }
    }
    
    return null
  }
  
  /**
   * Validate that game endpoints are accessible
   */
  private async validateEndpoints(game: DiscoverableGame): Promise<boolean> {
    logger.debug(`Validating endpoints for ${game.name}...`, undefined, 'GameDiscovery')
    
    const validations: Promise<boolean>[] = []
    
    if (game.endpoints.mcp) {
      validations.push(this.validateMCPEndpoint(game.endpoints.mcp))
    }
    
    if (game.endpoints.api) {
      validations.push(this.validateAPIEndpoint(game.endpoints.api))
    }
    
    const results = await Promise.all(validations)
    const anyValid = results.some(r => r)
    
    logger.debug(anyValid ? `✅ Endpoints validated for ${game.name}` : `❌ No valid endpoints found for ${game.name}`, undefined, 'GameDiscovery')
    
    return anyValid
  }
  
  /**
   * Validate MCP endpoint
   */
  private async validateMCPEndpoint(mcpUrl: string): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(mcpUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      return false
    }
    
    const data = await response.json()
    return !!(data && typeof data === 'object' && 'name' in data && 'tools' in data)
  }
  
  /**
   * Validate API endpoint
   */
  private async validateAPIEndpoint(apiUrl: string): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${apiUrl}/markets`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    
    clearTimeout(timeout)
    
    return response.ok || response.status === 401 || response.status === 403
  }
  
  /**
   * Sleep utility for retry backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * Get game metadata by token ID using Agent0 SDK
   */
  async getGameByTokenId(tokenId: number): Promise<DiscoverableGame | null> {
    try {
      const agent0Client = getAgent0Client()
      const profile = await agent0Client.getAgentProfile(tokenId)
      
      if (!profile) {
        return null
      }
      
      return {
        tokenId: profile.tokenId,
        name: profile.name,
        type: 'game-platform',
        metadataCID: profile.metadataCID,
        endpoints: {
          a2a: '', // Would be in registrationFile/metadata
          mcp: '', // Would be in registrationFile/metadata
          api: '',
        },
        capabilities: {
          markets: profile.capabilities.markets || [],
          actions: profile.capabilities.actions || [],
          protocols: ['a2a', 'mcp'], // Default protocols
          socialFeatures: profile.capabilities.platform === 'babylon',
          realtime: profile.capabilities.platform === 'babylon'
        },
        reputation: {
          trustScore: profile.reputation.trustScore,
          accuracyScore: profile.reputation.accuracyScore
        }
      }
    } catch (error) {
      logger.error('Failed to get game by token ID', { tokenId, error }, 'GameDiscovery')
      return null
    }
  }
}

/**
 * Get or create singleton GameDiscoveryService instance
 */
let gameDiscoveryInstance: GameDiscoveryService | null = null

export function getGameDiscoveryService(): GameDiscoveryService {
  if (!gameDiscoveryInstance) {
    gameDiscoveryInstance = new GameDiscoveryService()
  }
  return gameDiscoveryInstance
}


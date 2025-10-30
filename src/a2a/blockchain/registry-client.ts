/**
 * ERC-8004 Registry Client
 * Blockchain integration for agent identity and reputation
 */

import { ethers } from 'ethers'
import { AgentProfile, AgentReputation } from '../types'

export interface RegistryConfig {
  rpcUrl: string
  identityRegistryAddress: string
  reputationSystemAddress: string
}

export class RegistryClient {
  private provider: ethers.Provider
  private identityRegistry: ethers.Contract
  private reputationSystem: ethers.Contract

  constructor(config: RegistryConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)

    // ERC-8004 Identity Registry ABI (minimal)
    const identityABI = [
      'function tokenOfOwner(address owner) external view returns (uint256)',
      'function ownerOf(uint256 tokenId) external view returns (address)',
      'function getProfile(uint256 tokenId) external view returns (tuple(string name, string endpoint, bytes32 capabilitiesHash, uint256 registeredAt, bool isActive, string metadata))',
      'function isEndpointActive(string endpoint) external view returns (bool)',
      'function getAllActiveAgents() external view returns (uint256[] memory)'
    ]

    // Reputation System ABI (minimal)
    const reputationABI = [
      'function getReputation(uint256 tokenId) external view returns (tuple(uint256 totalBets, uint256 winningBets, uint256 accuracyScore, uint256 trustScore, string totalVolume, uint256 lastUpdated))',
      'function getAgentsByMinScore(uint256 minScore) external view returns (uint256[] memory)'
    ]

    this.identityRegistry = new ethers.Contract(
      config.identityRegistryAddress,
      identityABI,
      this.provider
    )

    this.reputationSystem = new ethers.Contract(
      config.reputationSystemAddress,
      reputationABI,
      this.provider
    )
  }

  /**
   * Get agent profile by token ID
   */
  async getAgentProfile(tokenId: number): Promise<AgentProfile | null> {
    try {
      const profile = await this.identityRegistry.getProfile(tokenId)
      const reputation = await this.getAgentReputation(tokenId)
      const address = await this.identityRegistry.ownerOf(tokenId)

      return {
        tokenId,
        address,
        name: profile.name,
        endpoint: profile.endpoint,
        capabilities: this.parseCapabilities(profile.metadata),
        reputation,
        isActive: profile.isActive
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get agent profile by address
   */
  async getAgentProfileByAddress(address: string): Promise<AgentProfile | null> {
    try {
      const tokenId = await this.identityRegistry.tokenOfOwner(address)
      if (tokenId === 0n) return null
      return this.getAgentProfile(Number(tokenId))
    } catch (error) {
      return null
    }
  }

  /**
   * Get agent reputation
   */
  async getAgentReputation(tokenId: number): Promise<AgentReputation> {
    try {
      const rep = await this.reputationSystem.getReputation(tokenId)

      return {
        totalBets: Number(rep.totalBets),
        winningBets: Number(rep.winningBets),
        accuracyScore: Number(rep.accuracyScore),
        trustScore: Number(rep.trustScore),
        totalVolume: rep.totalVolume.toString()
      }
    } catch (error) {
      return {
        totalBets: 0,
        winningBets: 0,
        accuracyScore: 0,
        trustScore: 0,
        totalVolume: '0'
      }
    }
  }

  /**
   * Discover agents by filters
   */
  async discoverAgents(filters?: {
    strategies?: string[]
    minReputation?: number
    markets?: string[]
  }): Promise<AgentProfile[]> {
    try {
      let tokenIds: bigint[]

      // Get agents by reputation if filter provided
      if (filters?.minReputation) {
        tokenIds = await this.reputationSystem.getAgentsByMinScore(filters.minReputation)
      } else {
        // Get all active agents
        tokenIds = await this.identityRegistry.getAllActiveAgents()
      }

      // Fetch profiles for each token ID
      const profiles: AgentProfile[] = []
      for (const tokenId of tokenIds) {
        const profile = await this.getAgentProfile(Number(tokenId))
        if (profile && this.matchesFilters(profile, filters)) {
          profiles.push(profile)
        }
      }

      return profiles
    } catch (error) {
      console.error('Error discovering agents:', error)
      return []
    }
  }

  /**
   * Check if agent matches discovery filters
   */
  private matchesFilters(
    profile: AgentProfile,
    filters?: {
      strategies?: string[]
      minReputation?: number
      markets?: string[]
    }
  ): boolean {
    if (!filters) return true

    // Check strategies
    if (filters.strategies && filters.strategies.length > 0) {
      const hasStrategy = filters.strategies.some(s =>
        profile.capabilities.strategies.includes(s)
      )
      if (!hasStrategy) return false
    }

    // Check markets
    if (filters.markets && filters.markets.length > 0) {
      const hasMarket = filters.markets.some(m =>
        profile.capabilities.markets.includes(m)
      )
      if (!hasMarket) return false
    }

    // Check reputation (already filtered in query if provided)
    if (filters.minReputation) {
      if (profile.reputation.trustScore < filters.minReputation) {
        return false
      }
    }

    return true
  }

  /**
   * Parse capabilities from metadata JSON
   */
  private parseCapabilities(metadata: string): {
    strategies: string[]
    markets: string[]
    actions: string[]
    version: string
  } {
    try {
      const parsed = JSON.parse(metadata)
      return {
        strategies: parsed.strategies || [],
        markets: parsed.markets || [],
        actions: parsed.actions || [],
        version: parsed.version || '1.0.0'
      }
    } catch (error) {
      return {
        strategies: [],
        markets: [],
        actions: [],
        version: '1.0.0'
      }
    }
  }

  /**
   * Verify agent address owns the token ID
   */
  async verifyAgent(address: string, tokenId: number): Promise<boolean> {
    try {
      const owner = await this.identityRegistry.ownerOf(tokenId)
      return owner.toLowerCase() === address.toLowerCase()
    } catch (error) {
      return false
    }
  }

  /**
   * Check if endpoint is active
   */
  async isEndpointActive(endpoint: string): Promise<boolean> {
    try {
      return await this.identityRegistry.isEndpointActive(endpoint)
    } catch (error) {
      return false
    }
  }
}

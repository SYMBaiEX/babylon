/**
 * ERC-8004 Registry Client
 * Blockchain integration for agent identity and reputation
 */

import { ethers } from 'ethers'
import { AgentProfile, AgentReputation } from '../types'

// ERC-8004 Identity Registry ABI (minimal)
const IDENTITY_ABI = [
  'function getTokenId(address _address) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function getAgentProfile(uint256 _tokenId) external view returns (string memory name, string memory endpoint, bytes32 capabilitiesHash, uint256 registeredAt, bool isActive, string memory metadata)',
  'function isRegistered(address _address) external view returns (bool)',
  'function getAllActiveAgents() external view returns (uint256[] memory)',
  'function isEndpointActive(string memory endpoint) external view returns (bool)',
  'function getAgentsByCapability(bytes32 capabilityHash) external view returns (uint256[] memory)',
]

// Reputation System ABI (minimal)
const REPUTATION_ABI = [
  'function getReputation(uint256 _tokenId) external view returns (uint256 totalBets, uint256 winningBets, uint256 totalVolume, uint256 profitLoss, uint256 accuracyScore, uint256 trustScore, bool isBanned)',
  'function getFeedbackCount(uint256 _tokenId) external view returns (uint256)',
  'function getFeedback(uint256 _tokenId, uint256 _index) external view returns (address from, int8 rating, string memory comment, uint256 timestamp)',
  'function getAgentsByMinScore(uint256 minScore) external view returns (uint256[] memory)',
]

export interface RegistryConfig {
  rpcUrl: string
  identityRegistryAddress: string
  reputationSystemAddress: string
}

export class RegistryClient {
  private readonly provider: ethers.Provider
  private readonly identityRegistry: ethers.Contract
  private readonly reputationSystem: ethers.Contract

  constructor(config: RegistryConfig) {
    // Initialize all properties in constructor to satisfy strictPropertyInitialization
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)

    this.identityRegistry = new ethers.Contract(
      config.identityRegistryAddress,
      IDENTITY_ABI,
      this.provider
    )

    this.reputationSystem = new ethers.Contract(
      config.reputationSystemAddress,
      REPUTATION_ABI,
      this.provider
    )
  }

  /**
   * Get agent profile by token ID
   */
  async getAgentProfile(tokenId: number): Promise<AgentProfile | null> {
    // Ensure contracts are initialized and assign to local variables for type narrowing
    const identityRegistry = this.identityRegistry
    const reputationSystem = this.reputationSystem

    if (!identityRegistry || !reputationSystem) {
      throw new Error('Registry client not properly initialized')
    }

    try {
      // Contract methods are dynamically added from ABI, use type assertion
      const profile = await (identityRegistry as any).getAgentProfile(tokenId)
      const reputation = await this.getAgentReputation(tokenId)
      const address = await (identityRegistry as any).ownerOf(tokenId)

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
    // Ensure contracts are initialized and assign to local variable for type narrowing
    const identityRegistry = this.identityRegistry

    if (!identityRegistry) {
      throw new Error('Registry client not properly initialized')
    }

    try {
      // Contract methods are dynamically added from ABI, use type assertion
      const tokenId = await (identityRegistry as any).getTokenId(address)
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
    // Ensure contracts are initialized and assign to local variable for type narrowing
    const reputationSystem = this.reputationSystem

    if (!reputationSystem) {
      throw new Error('Registry client not properly initialized')
    }

    try {
      // Contract methods are dynamically added from ABI, use type assertion
      const rep = await (reputationSystem as any).getReputation(tokenId) as [
        bigint, // totalBets
        bigint, // winningBets
        bigint, // totalVolume
        bigint, // profitLoss
        bigint, // accuracyScore
        bigint, // trustScore
        boolean // isBanned
      ]

      return {
        totalBets: Number(rep[0] || 0),
        winningBets: Number(rep[1] || 0),
        totalVolume: rep[2]?.toString() || '0',
        profitLoss: Number(rep[3] || 0),
        accuracyScore: Number(rep[4] || 0),
        trustScore: Number(rep[5] || 0),
        isBanned: rep[6] || false,
      }
    } catch (error) {
      return {
        totalBets: 0,
        winningBets: 0,
        accuracyScore: 0,
        trustScore: 0,
        totalVolume: '0',
        profitLoss: 0,
        isBanned: false,
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
    // Ensure contracts are initialized and assign to local variables for type narrowing
    const identityRegistry = this.identityRegistry
    const reputationSystem = this.reputationSystem

    if (!identityRegistry || !reputationSystem) {
      throw new Error('Registry client not properly initialized')
    }

    try {
      let tokenIds: bigint[]

      // Get agents by reputation if filter provided
      if (filters?.minReputation) {
        tokenIds = await (reputationSystem as any).getAgentsByMinScore(filters.minReputation)
      } else {
        // Get all active agents
        tokenIds = await (identityRegistry as any).getAllActiveAgents()
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
    // Ensure contract is initialized and assign to local variable for type narrowing
    const identityRegistry = this.identityRegistry

    if (!identityRegistry) {
      return false
    }

    try {
      // Contract methods are dynamically added from ABI, use type assertion
      const owner = await (identityRegistry as any).ownerOf(tokenId)
      return owner.toLowerCase() === address.toLowerCase()
    } catch (error) {
      return false
    }
  }

  /**
   * Check if endpoint is active
   */
  async isEndpointActive(endpoint: string): Promise<boolean> {
    // Ensure contract is initialized and assign to local variable for type narrowing
    const identityRegistry = this.identityRegistry

    if (!identityRegistry) {
      return false
    }

    try {
      // Contract methods are dynamically added from ABI, use type assertion
      return await (identityRegistry as any).isEndpointActive(endpoint)
    } catch (error) {
      return false
    }
  }
}

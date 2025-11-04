/**
 * Agent0 SDK Client Wrapper
 * 
 * Wrapper around Agent0 SDK for agent registration, search, and feedback.
 */

// Agent0 SDK temporarily disabled due to module resolution issues
// import { SDK, type SDKConfig, type AgentSummary, type SearchParams } from 'agent0-sdk'
type SDK = unknown;
// type SDKConfig = unknown;
// type AgentSummary = unknown;
// type SearchParams = unknown;

import { logger } from '@/lib/logger'
import type {
  IAgent0Client,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0SearchFilters,
  Agent0SearchResult,
  Agent0FeedbackParams,
  Agent0AgentProfile
} from './types'

export class Agent0Client implements IAgent0Client {
  // private sdk: SDK  // Disabled
  // private chainId: number  // Disabled
  
  constructor(_config: {
    network: 'sepolia' | 'mainnet'
    rpcUrl: string
    privateKey: string
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata'
    ipfsNodeUrl?: string
    pinataJwt?: string
    filecoinPrivateKey?: string
    subgraphUrl?: string
  }) {
    // Agent0 SDK temporarily disabled - module resolution issues
    logger.warn('Agent0Client: SDK disabled - using stub implementation', undefined, 'Agent0Client')
  }
  
  /**
   * Register an agent with Agent0 SDK (currently disabled)
   */
  async registerAgent(_params: Agent0RegistrationParams): Promise<Agent0RegistrationResult> {
    throw new Error('Agent0 SDK is temporarily disabled due to module resolution issues')
  }
  
  /**
   * Search for agents using Agent0 SDK (currently disabled)
   */
  async searchAgents(_filters: Agent0SearchFilters): Promise<Agent0SearchResult[]> {
    return [] // SDK disabled - return empty array
  }
  
  /**
   * Submit feedback for an agent (currently disabled)
   */
  async submitFeedback(_params: Agent0FeedbackParams): Promise<void> {
    throw new Error('Agent0 SDK is temporarily disabled due to module resolution issues')
  }
  
  /**
   * Get agent profile from Agent0 network (currently disabled)
   */
  async getAgentProfile(_tokenId: number): Promise<Agent0AgentProfile | null> {
    return null // SDK disabled - return null
  }
  
  /**
   * Check if Agent0 SDK is available
   */
  isAvailable(): boolean {
    return false // SDK is disabled
  }
  
  /**
   * Get the underlying SDK instance (currently disabled)
   */
  getSDK(): SDK {
    throw new Error('Agent0 SDK is temporarily disabled due to module resolution issues')
  }
}

/**
 * Get or create singleton Agent0Client instance
 */
let agent0ClientInstance: Agent0Client | null = null

export function getAgent0Client(): Agent0Client {
  if (!agent0ClientInstance) {
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL
    const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || process.env.AGENT0_PRIVATE_KEY
    
    if (!rpcUrl || !privateKey) {
      throw new Error(
        'Agent0Client requires BASE_SEPOLIA_RPC_URL and BABYLON_GAME_PRIVATE_KEY environment variables'
      )
    }
    
    agent0ClientInstance = new Agent0Client({
      network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
      rpcUrl,
      privateKey,
      ipfsProvider: (process.env.AGENT0_IPFS_PROVIDER as 'node' | 'filecoinPin' | 'pinata') || 'node',
      ipfsNodeUrl: process.env.AGENT0_IPFS_API,
      pinataJwt: process.env.PINATA_JWT,
      filecoinPrivateKey: process.env.FILECOIN_PRIVATE_KEY,
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL
    })
  }
  
  return agent0ClientInstance
}


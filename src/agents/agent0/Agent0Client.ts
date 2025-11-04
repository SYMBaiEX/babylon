/**
 * Agent0 SDK Client Wrapper
 * 
 * Wrapper around Agent0 SDK for agent registration, search, and feedback.
 */

import { SDK, type SDKConfig, type AgentSummary, type SearchParams } from 'agent0-sdk'
import { logger } from '@/lib/logger'
import type { AgentCapabilities } from '@/a2a/types'
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
  private sdk: SDK
  private chainId: number
  
  constructor(config: {
    network: 'sepolia' | 'mainnet'
    rpcUrl: string
    privateKey: string
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata'
    ipfsNodeUrl?: string
    pinataJwt?: string
    filecoinPrivateKey?: string
    subgraphUrl?: string
  }) {
    // Map network to chain ID
    // Note: Agent0 SDK currently supports Ethereum Sepolia (11155111)
    // If using Base Sepolia (84532), you may need to check SDK support or use Ethereum Sepolia
    // For now, we use Ethereum Sepolia as that's what Agent0 SDK supports
    this.chainId = config.network === 'sepolia' ? 11155111 : 1
    
    const sdkConfig: SDKConfig = {
      chainId: this.chainId,
      rpcUrl: config.rpcUrl,
      signer: config.privateKey,
      ipfs: config.ipfsProvider || 'node',
      ipfsNodeUrl: config.ipfsNodeUrl,
      pinataJwt: config.pinataJwt,
      filecoinPrivateKey: config.filecoinPrivateKey,
      subgraphUrl: config.subgraphUrl
    }
    
    try {
      this.sdk = new SDK(sdkConfig)
      logger.info('Agent0Client initialized', undefined, 'Agent0Client')
    } catch (error) {
      logger.error('Failed to initialize Agent0Client:', error, 'Agent0Client')
      throw error
    }
  }
  
  /**
   * Register an agent with Agent0 SDK
   * 
   * This will:
   * 1. Register on-chain (ERC-8004)
   * 2. Publish metadata to IPFS
   * 3. Index in Agent0 subgraph
   */
  async registerAgent(params: Agent0RegistrationParams): Promise<Agent0RegistrationResult> {
    if (this.sdk.isReadOnly) {
      throw new Error('Agent0Client not properly initialized with signer')
    }
    
    logger.info(`Registering agent: ${params.name}`, undefined, 'Agent0Client [registerAgent]')
    
    try {
      // Create agent instance
      const agent = this.sdk.createAgent(
        params.name,
        params.description,
        params.imageUrl
      )
      
      // Set wallet address if provided
      if (params.walletAddress) {
        agent.setAgentWallet(params.walletAddress as `0x${string}`, this.chainId)
      }
      
      // Set endpoints
      if (params.mcpEndpoint) {
        await agent.setMCP(params.mcpEndpoint, undefined, false)
      }
      
      if (params.a2aEndpoint) {
        await agent.setA2A(params.a2aEndpoint, undefined, false)
      }
      
      // Set capabilities in metadata
      agent.setMetadata({
        capabilities: params.capabilities,
        version: params.capabilities.version || '1.0.0'
      })
      
      // Register on-chain with IPFS
      const registrationFile = await agent.registerIPFS()
      
      // Extract token ID from agentId (format: chainId:tokenId)
      const agentId = registrationFile.agentId
      if (!agentId) {
        throw new Error('Registration succeeded but agentId not returned')
      }
      
      const tokenId = parseInt(agentId.split(':')[1] || '0', 10)
      if (isNaN(tokenId)) {
        throw new Error(`Invalid agentId format: ${agentId}`)
      }
      
      logger.info(`Agent registered successfully: ${agentId}`, undefined, 'Agent0Client [registerAgent]')
      
      return {
        tokenId,
        txHash: '', // SDK doesn't return txHash directly, would need to extract from registration
        metadataCID: registrationFile.agentURI?.replace('ipfs://', '') || undefined
      }
    } catch (error) {
      logger.error('Failed to register agent:', error, 'Agent0Client [registerAgent]')
      throw error
    }
  }
  
  /**
   * Search for agents using Agent0 SDK
   */
  async searchAgents(filters: Agent0SearchFilters): Promise<Agent0SearchResult[]> {
    logger.info('Searching agents with filters:', filters, 'Agent0Client [searchAgents]')
    
    try {
      const searchParams: SearchParams = {}
      
      // Map strategies to MCP tools or A2A skills
      if (filters.strategies && filters.strategies.length > 0) {
        // Strategies could be MCP tools or stored in metadata
        // For now, we'll search by name/description containing strategy terms
        searchParams.name = filters.strategies[0] // Use first strategy as name filter
      }
      
      // Map markets to A2A skills
      if (filters.markets && filters.markets.length > 0) {
        searchParams.a2aSkills = filters.markets
      }
      
      if (filters.type) {
        searchParams.name = filters.type
      }
      
      if (filters.hasX402) {
        searchParams.x402support = true
      }
      
      const result = await this.sdk.searchAgents(searchParams)
      
      return result.items.map((agent: AgentSummary) => {
        // Extract token ID from agentId (format: chainId:tokenId)
        const tokenId = parseInt(agent.agentId.split(':')[1] || '0', 10)
        
        return {
          tokenId,
          name: agent.name,
          walletAddress: agent.walletAddress || '',
          metadataCID: agent.agentId, // Use agentId as identifier
          capabilities: {
            strategies: agent.extras?.capabilities?.strategies || [],
            markets: agent.extras?.capabilities?.markets || [],
            actions: agent.extras?.capabilities?.actions || [],
            version: agent.extras?.capabilities?.version || '1.0.0'
          } as AgentCapabilities,
          reputation: {
            trustScore: 0, // Would need to query reputation separately
            accuracyScore: 0
          }
        }
      })
    } catch (error) {
      logger.error('Failed to search agents:', error, 'Agent0Client [searchAgents]')
      return []
    }
  }
  
  /**
   * Submit feedback for an agent
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<void> {
    if (this.sdk.isReadOnly) {
      throw new Error('Agent0Client not properly initialized with signer')
    }
    
    logger.info(`Submitting feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [submitFeedback]')
    
    try {
      // Convert token ID to agentId format (chainId:tokenId)
      const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
      
      // Convert rating from -5 to +5 scale to 0-100 scale used by Agent0 SDK
      // Agent0 SDK uses 0-100, so we map: -5=-100, 0=50, +5=100
      const agent0Score = Math.max(0, Math.min(100, (params.rating + 5) * 10))
      
      // Prepare feedback using SDK's prepareFeedback method
      // Signature: prepareFeedback(agentId, score, tags?, text?, capability?, name?, skill?)
      const feedbackFile = this.sdk.prepareFeedback(
        agentId,
        agent0Score, // Score: 0-100 (mandatory)
        [], // Tags (optional)
        params.comment || undefined, // Text (optional)
        undefined, // Capability (optional)
        undefined, // Name (optional)
        undefined  // Skill (optional)
      )
      
      // Submit feedback using SDK's giveFeedback method
      await this.sdk.giveFeedback(agentId, feedbackFile)
      
      logger.info(`Feedback submitted successfully for agent ${agentId}`, undefined, 'Agent0Client [submitFeedback]')
    } catch (error) {
      logger.error('Failed to submit feedback:', error, 'Agent0Client [submitFeedback]')
      throw error
    }
  }
  
  /**
   * Get agent profile from Agent0 network
   */
  async getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null> {
    logger.info(`Getting agent profile for token ${tokenId}`, undefined, 'Agent0Client [getAgentProfile]')
    
    try {
      // Convert token ID to agentId format (chainId:tokenId)
      const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
      
      const agent = await this.sdk.getAgent(agentId)
      
      if (!agent) {
        return null
      }
      
      return {
        tokenId,
        name: agent.name,
        walletAddress: agent.walletAddress || '',
        metadataCID: agent.agentId,
        capabilities: {
          strategies: agent.extras?.capabilities?.strategies || [],
          markets: agent.extras?.capabilities?.markets || [],
          actions: agent.extras?.capabilities?.actions || [],
          version: agent.extras?.capabilities?.version || '1.0.0'
        } as AgentCapabilities,
        reputation: {
          trustScore: 0, // Would need to query reputation separately
          accuracyScore: 0
        }
      }
    } catch (error) {
      logger.error(`Failed to get agent profile for token ${tokenId}:`, error, 'Agent0Client [getAgentProfile]')
      return null
    }
  }
  
  /**
   * Check if Agent0 SDK is available
   */
  isAvailable(): boolean {
    return this.sdk !== null && !this.sdk.isReadOnly
  }
  
  /**
   * Get the underlying SDK instance
   */
  getSDK(): SDK {
    return this.sdk
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


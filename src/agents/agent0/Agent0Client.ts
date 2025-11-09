/**
 * Agent0 SDK Client Wrapper
 * 
 * Wrapper around Agent0 SDK for agent registration, search, and feedback.
 * Uses dynamic imports to handle CommonJS/ESM interop.
 */

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
import {
  Agent0RegistrationError,
  Agent0FeedbackError,
  Agent0ReputationError,
  Agent0SearchError,
} from '@/lib/errors/agent0.errors'
import { withMetrics } from '@/lib/metrics/agent0-metrics'
import { agent0CircuitBreaker, agent0RateLimiter, agent0FeedbackRateLimiter } from '@/lib/resilience/agent0-resilience'

// Import SDK and types from agent0-sdk
import { SDK } from 'agent0-sdk'
import type { 
  SDKConfig, 
  AgentSummary, 
  SearchParams,
  RegistrationFile
} from 'agent0-sdk'

export class Agent0Client implements IAgent0Client {
  private sdk: SDK | null
  private chainId: number
  private config: {
    network: 'sepolia' | 'mainnet'
    rpcUrl: string
    privateKey: string
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata'
    ipfsNodeUrl?: string
    pinataJwt?: string
    filecoinPrivateKey?: string
    subgraphUrl?: string
  }
  private initPromise: Promise<void> | null = null
  
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
    this.chainId = config.network === 'sepolia' ? 11155111 : 1
    this.config = config
    this.sdk = null
  }
  
  /**
   * Initialize SDK lazily
   */
  private async ensureSDK(): Promise<void> {
    if (this.sdk) return
    
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      await this.initPromise
      return
    }
    
    this.initPromise = (async () => {
      try {
        const sdkConfig: SDKConfig = {
          chainId: this.chainId,
          rpcUrl: this.config.rpcUrl,
          signer: this.config.privateKey,
          ipfs: this.config.ipfsProvider || 'node',
          ipfsNodeUrl: this.config.ipfsNodeUrl,
          pinataJwt: this.config.pinataJwt,
          filecoinPrivateKey: this.config.filecoinPrivateKey,
          // subgraphUrl is optional - SDK auto-resolves based on chainId
          ...(this.config.subgraphUrl && { subgraphUrl: this.config.subgraphUrl })
        }
        
        this.sdk = new SDK(sdkConfig)
        logger.info('Agent0Client initialized successfully', { 
          chainId: this.chainId, 
          rpcUrl: this.config.rpcUrl 
        }, 'Agent0Client')
      } catch (error) {
        logger.error('Failed to initialize Agent0Client', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          config: { chainId: this.chainId, rpcUrl: this.config.rpcUrl, network: this.config.network }
        }, 'Agent0Client')
        throw error
      }
    })()
    
    await this.initPromise
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
    return withMetrics('register', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0RegistrationError('SDK not initialized', params.name)
      }
      
      if (this.sdk.isReadOnly) {
        throw new Agent0RegistrationError(
          'Agent0Client not properly initialized with signer',
          params.name
        )
      }
      
      logger.info(`Registering agent: ${params.name}`, undefined, 'Agent0Client [registerAgent]')
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          // Create agent instance
          const agent = this.sdk!.createAgent(
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
        // Use semantic version for Babylon's MCP implementation
        await agent.setMCP(params.mcpEndpoint, '1.0.0', false)
      }
      
      if (params.a2aEndpoint) {
        // Use semantic version for Babylon's A2A implementation
        await agent.setA2A(params.a2aEndpoint, '1.0.0', false)
      }
      
      // Set capabilities in metadata
      agent.setMetadata({
        capabilities: params.capabilities,
        version: params.capabilities.version || '1.0.0'
      })
      
      // Set agent as active (required for proper registration)
      agent.setActive(true)
      
      // Set X402 support if applicable
      if (params.capabilities.x402Support !== undefined) {
        agent.setX402Support(params.capabilities.x402Support)
      }
      
      // Register on-chain with IPFS
      const registrationFile: RegistrationFile = await agent.registerIPFS()
      
      // Debug: Log the full registration file to see what the SDK returned
      logger.info('Registration file returned from SDK:', {
        agentId: registrationFile.agentId,
        agentURI: registrationFile.agentURI,
        active: registrationFile.active,
        x402support: registrationFile.x402support
      }, 'Agent0Client [registerAgent]')
      
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
        })
      } catch (error) {
        logger.error('Failed to register agent:', error, 'Agent0Client [registerAgent]')
        
        throw new Agent0RegistrationError(
          `Failed to register agent: ${error instanceof Error ? error.message : String(error)}`,
          params.name,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { agentName: params.name })
  }
  
  /**
   * Search for agents using Agent0 SDK
   */
  async searchAgents(filters: Agent0SearchFilters): Promise<Agent0SearchResult[]> {
    return withMetrics('search', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0SearchError('SDK not initialized', filters as Record<string, unknown>)
      }
      
      logger.info('Searching agents with filters:', filters, 'Agent0Client [searchAgents]')
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          const searchParams: SearchParams = {}
      
      // Map strategies to MCP tools or A2A skills
      if (filters.strategies && filters.strategies.length > 0) {
        // Strategies could be MCP tools or stored in metadata
        searchParams.a2aSkills = filters.strategies
      }
      
      if (filters.name) {
        searchParams.name = filters.name
      }
      
      if (filters.x402Support !== undefined) {
        searchParams.x402support = filters.x402Support
      }
      
          const { items } = await this.sdk!.searchAgents(searchParams)
      
          // Map SDK results to our format
          return items.map((agent: AgentSummary) => ({
            tokenId: parseInt(agent.agentId.split(':')[1] || '0', 10),
            name: agent.name,
            walletAddress: agent.walletAddress || '',
            metadataCID: agent.agentId,
            capabilities: {
              strategies: (agent.extras?.capabilities as { strategies?: string[] })?.strategies || [],
              markets: (agent.extras?.capabilities as { markets?: string[] })?.markets || [],
              actions: (agent.extras?.capabilities as { actions?: string[] })?.actions || [],
              version: (agent.extras?.capabilities as { version?: string })?.version || '1.0.0'
            },
            reputation: {
              trustScore: 0, // Would need to query reputation separately
              accuracyScore: 0
            }
          }))
        })
      } catch (error) {
        logger.error('Failed to search agents:', error, 'Agent0Client [searchAgents]')
        
        throw new Agent0SearchError(
          `Failed to search agents: ${error instanceof Error ? error.message : String(error)}`,
          filters as Record<string, unknown>,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { filters: JSON.stringify(filters) })
  }
  
  /**
   * Submit feedback for an agent
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<void> {
    return withMetrics('feedback', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0FeedbackError(
          'SDK not initialized',
          params.transactionId,
          params.targetAgentId
        )
      }
      
      if (this.sdk.isReadOnly) {
        throw new Agent0FeedbackError(
          'Agent0Client not properly initialized with signer',
          params.transactionId,
          params.targetAgentId
        )
      }
      
      logger.info(`Submitting feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [submitFeedback]')
      
      try {
        // Check rate limit for feedback submissions
        await agent0FeedbackRateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          // Convert token ID to agentId format (chainId:tokenId)
          const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
      
      // Validate and clamp rating to 0-100 scale (SDK requirement)
      const agent0Score = Math.max(0, Math.min(100, params.rating))
      
          // Prepare feedback using SDK's prepareFeedback method
          // Signature: prepareFeedback(agentId, score, tags?, text?, capability?, name?, skill?)
          const feedbackFile = this.sdk!.prepareFeedback(
        agentId,
        agent0Score, // Score: 0-100 (mandatory)
        params.tags || [], // Tags (optional)
        params.comment || undefined, // Text (optional)
        params.capability || undefined, // Capability (optional)
        undefined, // Name (optional - not used)
        params.skill || undefined  // Skill (optional)
      )
      
          // Validate feedback file before submission
          if (!feedbackFile || typeof feedbackFile !== 'object') {
            throw new Agent0FeedbackError(
              'Invalid feedback file returned from prepareFeedback',
              params.transactionId,
              params.targetAgentId,
              'INVALID_FEEDBACK_FILE'
            )
          }
          
          // Submit feedback using SDK's giveFeedback method
          // SDK signature: giveFeedback(agentId, feedbackFile)
          // Authentication is handled internally by SDK when signer is configured
          await this.sdk!.giveFeedback(agentId, feedbackFile)
          
          logger.info(`Feedback submitted successfully for agent ${agentId}`, {
            agentId,
            score: agent0Score,
            tags: params.tags?.length || 0,
            capability: params.capability,
            skill: params.skill
          }, 'Agent0Client [submitFeedback]')
        })
      } catch (error) {
        logger.error('Failed to submit feedback:', error, 'Agent0Client [submitFeedback]')
        
        throw new Agent0FeedbackError(
          `Failed to submit feedback: ${error instanceof Error ? error.message : String(error)}`,
          params.transactionId,
          params.targetAgentId,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, {
      feedbackId: params.transactionId,
      targetAgentId: params.targetAgentId,
      score: params.rating,
    })
  }
  
  /**
   * Get reputation summary from Agent0 network
   * Returns trustScore, accuracyScore, and totalFeedback count
   */
  async getReputationSummary(tokenId: number): Promise<{
    trustScore: number
    accuracyScore: number
    totalFeedback: number
  } | null> {
    return withMetrics('reputation.summary', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0ReputationError('SDK not initialized', tokenId)
      }
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
          const summary = await this.sdk!.getReputationSummary(agentId) as unknown as {
            averageScore?: number
            trustScore?: number
            accuracyScore?: number
            count?: number
            totalFeedback?: number
          }
          
          if (!summary) {
            return null
          }
          
          // SDK returns { count, averageScore } - map to our expected format
          return {
            trustScore: Number(summary.averageScore || summary.trustScore || 0),
            accuracyScore: Number(summary.averageScore || summary.accuracyScore || 0),
            totalFeedback: Number(summary.count || summary.totalFeedback || 0),
          }
        })
      } catch (error) {
        logger.error(`Failed to get reputation summary for token ${tokenId}:`, error, 'Agent0Client [getReputationSummary]')
        
        throw new Agent0ReputationError(
          `Failed to get reputation summary: ${error instanceof Error ? error.message : String(error)}`,
          tokenId,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { tokenId })
  }

  /**
   * Get agent profile from Agent0 network
   */
  async getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null> {
    return withMetrics('reputation.profile', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0ReputationError('SDK not initialized', tokenId)
      }
      
      logger.info(`Getting agent profile for token ${tokenId}`, undefined, 'Agent0Client [getAgentProfile]')
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          // Convert token ID to agentId format (chainId:tokenId)
          const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
          
          const agent: AgentSummary | null = await this.sdk!.getAgent(agentId)
      
          if (!agent) {
            return null
          }
          
          return {
            tokenId,
            name: agent.name,
            walletAddress: agent.walletAddress || '',
            metadataCID: agent.agentId,
            capabilities: {
              strategies: (agent.extras?.capabilities as { strategies?: string[] })?.strategies || [],
              markets: (agent.extras?.capabilities as { markets?: string[] })?.markets || [],
              actions: (agent.extras?.capabilities as { actions?: string[] })?.actions || [],
              version: (agent.extras?.capabilities as { version?: string })?.version || '1.0.0'
            },
            reputation: {
              trustScore: 0, // Would need to query reputation separately
              accuracyScore: 0
            }
          }
        })
      } catch (error) {
        logger.error(`Failed to get agent profile for token ${tokenId}:`, error, 'Agent0Client [getAgentProfile]')
        
        throw new Agent0ReputationError(
          `Failed to get agent profile: ${error instanceof Error ? error.message : String(error)}`,
          tokenId,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { tokenId })
  }
  
  /**
   * Check if Agent0 SDK is available
   */
  isAvailable(): boolean {
    return this.sdk !== null && !this.sdk.isReadOnly
  }
  
  /**
   * Search feedback for an agent
   * 
   * @param tokenId - Agent token ID
   * @param filters - Optional filters (minScore, maxScore, tags, limit)
   * @returns Array of feedback items
   */
  async searchFeedback(
    tokenId: number,
    filters?: {
      minScore?: number
      maxScore?: number
      tags?: string[]
      limit?: number
    }
  ): Promise<Array<{
    id: string
    from: string
    score: number
    comment?: string
    tags?: string[]
    capability?: string
    skill?: string
    timestamp: number
  }>> {
    return withMetrics('feedback.search', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0ReputationError('SDK not initialized', tokenId)
      }
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
          
          // SDK signature: searchFeedback(agentId, tags?, capabilities?, skills?, minScore?, maxScore?)
          const results = await this.sdk!.searchFeedback(
            agentId,
            filters?.tags,
            undefined, // capabilities
            undefined, // skills
            filters?.minScore,
            filters?.maxScore
          )
          
          // Limit results if specified
          const limited = filters?.limit ? results.slice(0, filters.limit) : results
          
          return limited.map((item: unknown) => {
            const feedback = item as {
              id?: string
              from?: string
              fromAddress?: string
              score?: number
              rating?: number
              comment?: string
              text?: string
              tags?: string[]
              capability?: string
              skill?: string
              timestamp?: number
              createdAt?: number
            }
            
            return {
              id: String(feedback.id || ''),
              from: String(feedback.from || feedback.fromAddress || ''),
              score: Number(feedback.score || feedback.rating || 0),
              comment: feedback.comment || feedback.text ? String(feedback.comment || feedback.text) : undefined,
              tags: Array.isArray(feedback.tags) ? feedback.tags.map(String) : [],
              capability: feedback.capability ? String(feedback.capability) : undefined,
              skill: feedback.skill ? String(feedback.skill) : undefined,
              timestamp: Number(feedback.timestamp || feedback.createdAt || 0),
            }
          })
        })
      } catch (error) {
        logger.error(`Failed to search feedback for token ${tokenId}:`, error, 'Agent0Client [searchFeedback]')
        
        throw new Agent0ReputationError(
          `Failed to search feedback: ${error instanceof Error ? error.message : String(error)}`,
          tokenId,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { tokenId, filters: JSON.stringify(filters) })
  }

  /**
   * Get specific feedback by ID
   * 
   * @param tokenId - Agent token ID
   * @param feedbackId - Feedback ID
   * @returns Feedback details or null
   */
  async getFeedback(
    tokenId: number,
    feedbackId: string
  ): Promise<{
    id: string
    from: string
    score: number
    comment?: string
    tags?: string[]
    capability?: string
    skill?: string
    timestamp: number
  } | null> {
    return withMetrics('feedback.get', async () => {
      await this.ensureSDK()
      
      if (!this.sdk) {
        throw new Agent0ReputationError('SDK not initialized', tokenId)
      }
      
      try {
        // Check rate limit
        await agent0RateLimiter.consume()
        
        // Execute with circuit breaker
        return await agent0CircuitBreaker.execute(async () => {
          const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
          
          // SDK getFeedback signature: getFeedback(agentId, clientAddress, feedbackIndex)
          // feedbackId in our system is a UUID, but SDK uses clientAddress + index
          // For now, try to get feedback by index 0 (most common case)
          const feedbackIndex = 0
          const result = await this.sdk!.getFeedback(
            agentId,
            feedbackId, // Use as clientAddress (best effort)
            feedbackIndex
          ) as unknown as {
            id?: string
            from?: string
            fromAddress?: string
            client?: string
            score?: number
            rating?: number
            comment?: string
            text?: string
            tags?: string[]
            capability?: string
            skill?: string
            timestamp?: number
            createdAt?: number
          } | null
          
          const feedback = result
          
          if (!feedback) {
            return null
          }
          
          return {
            id: String(feedback.id || feedbackId),
            from: String(feedback.from || feedback.fromAddress || feedback.client || ''),
            score: Number(feedback.score || feedback.rating || 0),
            comment: feedback.comment || feedback.text ? String(feedback.comment || feedback.text) : undefined,
            tags: Array.isArray(feedback.tags) ? feedback.tags.map(String) : [],
            capability: feedback.capability ? String(feedback.capability) : undefined,
            skill: feedback.skill ? String(feedback.skill) : undefined,
            timestamp: Number(feedback.timestamp || feedback.createdAt || 0),
          }
        })
      } catch (error) {
        logger.error(`Failed to get feedback ${feedbackId} for token ${tokenId}:`, error, 'Agent0Client [getFeedback]')
        
        throw new Agent0ReputationError(
          `Failed to get feedback: ${error instanceof Error ? error.message : String(error)}`,
          tokenId,
          undefined,
          error instanceof Error ? error : undefined
        )
      }
    }, { tokenId, feedbackId })
  }

  /**
   * Get the underlying SDK instance
   */
  getSDK(): SDK | null {
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
    
    // Determine IPFS provider and configuration
    const ipfsProvider = (process.env.AGENT0_IPFS_PROVIDER as 'node' | 'filecoinPin' | 'pinata') || 
                         (process.env.PINATA_JWT ? 'pinata' : 
                          process.env.AGENT0_IPFS_API ? 'node' : 'pinata')
    
    agent0ClientInstance = new Agent0Client({
      network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
      rpcUrl,
      privateKey,
      ipfsProvider,
      ipfsNodeUrl: process.env.AGENT0_IPFS_API || 'https://ipfs.infura.io:5001',
      pinataJwt: process.env.PINATA_JWT,
      filecoinPrivateKey: process.env.FILECOIN_PRIVATE_KEY,
      // subgraphUrl is optional - SDK auto-resolves based on chainId if not provided
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL
    })
    
    logger.info('Agent0Client configured', {
      network: process.env.AGENT0_NETWORK || 'sepolia',
      ipfsProvider: process.env.AGENT0_IPFS_PROVIDER || 'node',
      subgraphOverride: !!process.env.AGENT0_SUBGRAPH_URL,
      note: 'Subgraph auto-resolves if not specified'
    }, 'Agent0Client')
  }
  
  return agent0ClientInstance
}


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
  Agent0PaginatedSearchResult,
  Agent0FeedbackParams,
  Agent0AgentProfile,
  Agent0Feedback,
  Agent0FeedbackAuthParams,
  Agent0FeedbackResponseParams,
  Agent0RevokeFeedbackParams,
  Agent0GetFeedbackParams,
  Agent0SearchFeedbackParams,
  Agent0ReputationSummaryParams,
  Agent0ReputationSummary,
  Agent0TransferParams,
  Agent0TransferResult,
  Agent0ReputationSearchParams,
  Agent0ReputationSearchResult,
  Agent0UpdateMetadataParams
} from './types'

// Import SDK and types from agent0-sdk
import { SDK, EndpointCrawler } from 'agent0-sdk'
import type {
  SDKConfig,
  AgentSummary,
  SearchParams,
  RegistrationFile
} from 'agent0-sdk'
import type { Agent } from 'agent0-sdk/dist/core/agent.js'
import { z } from 'zod';

const CapabilitiesSchema = z.object({
  strategies: z.array(z.string()).optional(),
  markets: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  version: z.string().optional(),
});

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
   * Initialize SDK - fails fast on any error
   */
  private async ensureSDK(): Promise<void> {
    if (this.sdk) return
    
    if (this.initPromise) {
      await this.initPromise
      return
    }
    
    this.initPromise = (async () => {
      const sdkConfig: SDKConfig = {
        chainId: this.chainId,
        rpcUrl: this.config.rpcUrl,
        signer: this.config.privateKey,
        ipfs: this.config.ipfsProvider || 'node',
        ipfsNodeUrl: this.config.ipfsNodeUrl,
        pinataJwt: this.config.pinataJwt,
        filecoinPrivateKey: this.config.filecoinPrivateKey,
        subgraphUrl: this.config.subgraphUrl
      }
      
      this.sdk = new SDK(sdkConfig)
      logger.info('Agent0Client initialized successfully', { 
        chainId: this.chainId, 
        rpcUrl: this.config.rpcUrl 
      }, 'Agent0Client')
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
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Registering agent: ${params.name}`, undefined, 'Agent0Client [registerAgent]')
    
    const agent = this.sdk.createAgent(
      params.name,
      params.description,
      params.imageUrl
    )
    
    if (params.walletAddress) {
      agent.setAgentWallet(params.walletAddress as `0x${string}`, this.chainId)
    }
    
    // Register MCP endpoint and crawl capabilities
    if (params.mcpEndpoint) {
      await agent.setMCP(params.mcpEndpoint, '1.0.0', false)
      
      // Crawl MCP endpoint to discover tools, prompts, resources
      // Note: Agent SDK auto-fetches capabilities when autoFetch=true
      // We'll store in metadata for now
      try {
        logger.info(`Crawling MCP endpoint: ${params.mcpEndpoint}`, undefined, 'Agent0Client [registerAgent]')
        const crawler = new EndpointCrawler(5000) // 5s timeout
        const mcpCaps = await crawler.fetchMcpCapabilities(params.mcpEndpoint)
        
        if (mcpCaps) {
          const metadata = agent.getMetadata()
          if (mcpCaps.mcpTools && mcpCaps.mcpTools.length > 0) {
            metadata.mcpTools = mcpCaps.mcpTools
            logger.info(`Discovered ${mcpCaps.mcpTools.length} MCP tools`, undefined, 'Agent0Client [registerAgent]')
          }
          if (mcpCaps.mcpPrompts && mcpCaps.mcpPrompts.length > 0) {
            metadata.mcpPrompts = mcpCaps.mcpPrompts
            logger.info(`Discovered ${mcpCaps.mcpPrompts.length} MCP prompts`, undefined, 'Agent0Client [registerAgent]')
          }
          if (mcpCaps.mcpResources && mcpCaps.mcpResources.length > 0) {
            metadata.mcpResources = mcpCaps.mcpResources
            logger.info(`Discovered ${mcpCaps.mcpResources.length} MCP resources`, undefined, 'Agent0Client [registerAgent]')
          }
          agent.setMetadata(metadata)
        }
      } catch (error) {
        logger.warn(`Failed to crawl MCP endpoint: ${params.mcpEndpoint}`, error, 'Agent0Client [registerAgent]')
        // Continue registration even if crawling fails
      }
    }
    
    // Register A2A endpoint and crawl capabilities
    if (params.a2aEndpoint) {
      await agent.setA2A(params.a2aEndpoint, '1.0.0', false)
      
      // Crawl A2A endpoint to discover skills
      // Store in metadata for now
      try {
        logger.info(`Crawling A2A endpoint: ${params.a2aEndpoint}`, undefined, 'Agent0Client [registerAgent]')
        const crawler = new EndpointCrawler(5000) // 5s timeout
        const a2aCaps = await crawler.fetchA2aCapabilities(params.a2aEndpoint)
        
        const metadata = agent.getMetadata()
        if (a2aCaps?.a2aSkills && a2aCaps.a2aSkills.length > 0) {
          metadata.a2aSkills = a2aCaps.a2aSkills
          logger.info(`Discovered ${a2aCaps.a2aSkills.length} A2A skills`, undefined, 'Agent0Client [registerAgent]')
        } else if (params.capabilities.strategies && params.capabilities.strategies.length > 0) {
          // Fallback: use strategies as skills
          metadata.a2aSkills = params.capabilities.strategies
          logger.info(`Using ${params.capabilities.strategies.length} strategies as A2A skills`, undefined, 'Agent0Client [registerAgent]')
        }
        agent.setMetadata(metadata)
      } catch (error) {
        logger.warn(`Failed to crawl A2A endpoint: ${params.a2aEndpoint}`, error, 'Agent0Client [registerAgent]')
        // Fallback: use strategies as skills
        if (params.capabilities.strategies && params.capabilities.strategies.length > 0) {
          const metadata = agent.getMetadata()
          metadata.a2aSkills = params.capabilities.strategies
          agent.setMetadata(metadata)
        }
      }
    }
    
    agent.setMetadata({
      capabilities: params.capabilities,
      version: params.capabilities.version || '1.0.0'
    })
    
    agent.setActive(true)
    
    if (params.capabilities.x402Support !== undefined) {
      agent.setX402Support(params.capabilities.x402Support)
    }
    
    // Gap 17: Add operators if provided (store in metadata)
    if (params.operators && params.operators.length > 0) {
      const metadata = agent.getMetadata()
      metadata.operators = params.operators
      agent.setMetadata(metadata)
      logger.info(`Added ${params.operators.length} operators to metadata`, undefined, 'Agent0Client [registerAgent]')
    }
    
    // Gap 14: Set trust models if provided
    if (params.trustModels && params.trustModels.length > 0) {
      // Use setTrust method with boolean flags
      const hasFeedback = params.trustModels.includes('feedback') || params.trustModels.includes('reputation')
      agent.setTrust(hasFeedback, false, false)

      const metadata = agent.getMetadata()
      metadata.trustModels = params.trustModels
      agent.setMetadata(metadata)
      logger.info(`Set trust models: ${params.trustModels.join(', ')}`, undefined, 'Agent0Client [registerAgent]')
    } else {
      // Default: reputation-based trust
      agent.setTrust(true, false, false)
    }

    // OASF Skills and Domains (v0.31)
    if (params.oasfSkills && params.oasfSkills.length > 0) {
      const validateOASF = params.validateOASF !== false  // Default to true
      for (const skill of params.oasfSkills) {
        agent.addSkill(skill, validateOASF)
        logger.info(`Added OASF skill: ${skill}`, undefined, 'Agent0Client [registerAgent]')
      }
    } else if (params.capabilities.strategies && params.capabilities.strategies.length > 0) {
      // Auto-map strategies to OASF skills
      const skillMappings: Record<string, string> = {
        'prediction-markets': 'advanced_reasoning_planning/strategic_planning',
        'autonomous-trading': 'data_engineering/data_transformation_pipeline',
        'social-interaction': 'natural_language_processing/conversational_agents',
        'reputation-tracking': 'data_engineering/data_analysis',
        'agent-discovery': 'information_retrieval/search_and_indexing',
        'chat': 'natural_language_processing/conversational_agents',
        'analysis': 'data_engineering/data_analysis'
      }

      for (const strategy of params.capabilities.strategies) {
        const oasfSkill = skillMappings[strategy]
        if (oasfSkill) {
          agent.addSkill(oasfSkill, false)  // Don't validate auto-mapped skills
          logger.info(`Auto-mapped strategy "${strategy}" to OASF skill: ${oasfSkill}`, undefined, 'Agent0Client [registerAgent]')
        }
      }
    }

    if (params.oasfDomains && params.oasfDomains.length > 0) {
      const validateOASF = params.validateOASF !== false  // Default to true
      for (const domain of params.oasfDomains) {
        agent.addDomain(domain, validateOASF)
        logger.info(`Added OASF domain: ${domain}`, undefined, 'Agent0Client [registerAgent]')
      }
    } else if (params.capabilities.markets && params.capabilities.markets.length > 0) {
      // Auto-map markets to OASF domains
      const domainMappings: Record<string, string> = {
        'prediction': 'finance_and_business/prediction_markets',
        'crypto': 'finance_and_business/cryptocurrency_and_blockchain',
        'sports': 'sports_and_recreation/sports_analytics',
        'politics': 'social_sciences_and_politics/political_analysis',
        'entertainment': 'entertainment_and_media/entertainment',
        'ai': 'technology/artificial_intelligence/machine_learning',
        'perp': 'finance_and_business/derivatives_trading'
      }

      for (const market of params.capabilities.markets) {
        const oasfDomain = domainMappings[market]
        if (oasfDomain) {
          agent.addDomain(oasfDomain, false)  // Don't validate auto-mapped domains
          logger.info(`Auto-mapped market "${market}" to OASF domain: ${oasfDomain}`, undefined, 'Agent0Client [registerAgent]')
        }
      }
    }

    // ENS and DID endpoints (v0.31)
    if (params.ensName) {
      agent.setENS(params.ensName)
      logger.info(`Set ENS name: ${params.ensName}`, undefined, 'Agent0Client [registerAgent]')
    }

    // Note: DID support would go here when SDK supports it
    // if (params.didIdentifier) {
    //   agent.setDID(params.didIdentifier)
    // }

    const registrationFile: RegistrationFile = await agent.registerIPFS()
    
    logger.info('Registration file returned from SDK:', {
      agentId: registrationFile.agentId,
      agentURI: registrationFile.agentURI,
      active: registrationFile.active,
      x402support: registrationFile.x402support
    }, 'Agent0Client [registerAgent]')
    
    if (!registrationFile.agentId) {
      throw new Error('Registration file missing agentId')
    }
    
    const agentId = registrationFile.agentId
    const parts = agentId.split(':')
    const tokenId = parseInt(parts[1]!, 10)
    
    logger.info(`Agent registered successfully: ${agentId}`, undefined, 'Agent0Client [registerAgent]')
    
    return {
      tokenId,
      txHash: '',
      metadataCID: registrationFile.agentURI?.replace('ipfs://', '')
    }
  }
  
  /**
   * Register Babylon game itself on agent0 (Ethereum)
   *
   * This registers the GAME as an agent in the agent0 ecosystem for:
   * - Cross-game discovery
   * - External agent onboarding
   * - Interoperability with agent0 network
   *
   * The game's metadata includes pointers to Base network where game operates
   */
  async registerBabylonGame(): Promise<Agent0RegistrationResult> {
    const baseChainId = parseInt(process.env.BASE_CHAIN_ID || '8453', 10) // Base mainnet by default
    const baseRegistryAddress = process.env.BASE_IDENTITY_REGISTRY_ADDRESS
    const baseReputationAddress = process.env.BASE_REPUTATION_SYSTEM_ADDRESS
    const baseMarketAddress = process.env.BASE_DIAMOND_ADDRESS

    if (!baseRegistryAddress) {
      throw new Error('BASE_IDENTITY_REGISTRY_ADDRESS required for game registration')
    }

    logger.info('Registering Babylon game on agent0', {
      baseChainId,
      baseRegistryAddress
    }, 'Agent0Client [registerBabylonGame]')

    return this.registerAgent({
      name: process.env.BABYLON_GAME_NAME || 'Babylon Prediction Game',
      description: process.env.BABYLON_GAME_DESCRIPTION || 'AI-powered prediction market game on Base network',
      imageUrl: process.env.BABYLON_LOGO_URL,
      walletAddress: process.env.BABYLON_GAME_WALLET || process.env.AGENT0_PRIVATE_KEY || '',
      mcpEndpoint: process.env.BABYLON_MCP_URL ? `${process.env.BABYLON_MCP_URL}/mcp` : undefined,
      a2aEndpoint: process.env.BABYLON_A2A_URL ? `${process.env.BABYLON_A2A_URL}/a2a` : undefined,
      capabilities: {
        strategies: ['prediction-markets', 'reputation-tracking', 'agent-discovery'],
        markets: ['sports', 'crypto', 'politics', 'entertainment', 'ai'],
        actions: ['register-player', 'create-market', 'place-bet', 'resolve-market', 'submit-feedback'],
        version: '1.0.0',
        platform: 'babylon',
        userType: 'game',
        x402Support: true,
        // Cross-chain game network info
        gameNetwork: {
          chainId: baseChainId,
          registryAddress: baseRegistryAddress,
          reputationAddress: baseReputationAddress,
          marketAddress: baseMarketAddress
        }
      }
    })
  }

  /**
   * Search for agents using Agent0 SDK
   */
  async searchAgents(filters: Agent0SearchFilters): Promise<Agent0PaginatedSearchResult> {
    await this.ensureSDK()

    logger.info('Searching agents with filters:', filters, 'Agent0Client [searchAgents]')

    const searchParams: SearchParams = {}

    // Basic filters
    if (filters.name) {
      searchParams.name = filters.name
    }

    if (filters.description) {
      searchParams.description = filters.description
    }

    if (filters.strategies && filters.strategies.length > 0) {
      searchParams.a2aSkills = filters.strategies
    }

    if (filters.x402Support !== undefined || filters.hasX402 !== undefined) {
      searchParams.x402support = filters.x402Support ?? filters.hasX402
    }

    // Advanced filters (Agent0 SDK v0.31)
    if (filters.active !== undefined) {
      searchParams.active = filters.active
    }

    if (filters.chains) {
      searchParams.chains = filters.chains
    }

    if (filters.mcpTools && filters.mcpTools.length > 0) {
      searchParams.mcpTools = filters.mcpTools
    }

    if (filters.mcpPrompts && filters.mcpPrompts.length > 0) {
      searchParams.mcpPrompts = filters.mcpPrompts
    }

    if (filters.mcpResources && filters.mcpResources.length > 0) {
      searchParams.mcpResources = filters.mcpResources
    }

    if (filters.a2aSkills && filters.a2aSkills.length > 0) {
      searchParams.a2aSkills = filters.a2aSkills
    }

    if (filters.supportedTrust && filters.supportedTrust.length > 0) {
      searchParams.supportedTrust = filters.supportedTrust
    }

    if (filters.owners && filters.owners.length > 0) {
      searchParams.owners = filters.owners
    }

    if (filters.walletAddress) {
      searchParams.walletAddress = filters.walletAddress
    }

    if (filters.mcp !== undefined) {
      searchParams.mcp = filters.mcp
    }

    if (filters.a2a !== undefined) {
      searchParams.a2a = filters.a2a
    }

    if (filters.ens) {
      searchParams.ens = filters.ens
    }

    // Pagination parameters are passed separately in SDK v0.31
    const pageSize = filters.pageSize
    const cursor = filters.cursor

    const result = await this.sdk!.searchAgents(searchParams, undefined, pageSize, cursor)
    const items = result.items || []
    const nextCursor = result.nextCursor
    const meta = result.meta
    // Determine if there are more results based on nextCursor presence
    const hasMore = nextCursor !== undefined && nextCursor !== null && nextCursor !== ''

    logger.info(`Found ${items.length} agents, hasMore: ${hasMore}`, undefined, 'Agent0Client [searchAgents]')

    const results = items.map((agent: AgentSummary) => {
      const capabilities = this.parseCapabilities(agent.extras);
      return {
        tokenId: parseInt(agent.agentId.split(':')[1] ?? '0', 10),
        chainId: parseInt(agent.agentId.split(':')[0] ?? `${this.chainId}`, 10),
        name: agent.name,
        walletAddress: agent.walletAddress ?? '',
        metadataCID: agent.agentId,
        capabilities,
        reputation: {
          trustScore: 0,
          accuracyScore: 0
        }
      };
    })

    return {
      items: results,
      nextCursor,
      hasMore,
      meta
    }
  }
  
  /**
   * Submit feedback for an agent with full SDK support
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Submitting feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [submitFeedback]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    const agent0Score = Math.max(0, Math.min(100, (params.rating + 5) * 10))
    
    // Prepare feedback with all SDK fields
    const feedbackFile = this.sdk.prepareFeedback(
      agentId,
      agent0Score,
      params.tags || [],
      params.comment || undefined,
      params.capability || undefined,
      params.name || undefined,
      params.skill || undefined,
      params.task || undefined,
      params.context || undefined,
      params.proofOfPayment || undefined
    )
    
    const feedback = await this.sdk.giveFeedback(agentId, feedbackFile)
    
    logger.info(`Feedback submitted successfully for agent ${agentId}`, undefined, 'Agent0Client [submitFeedback]')
    
    return feedback as Agent0Feedback
  }
  
  /**
   * Sign feedback authorization for a client
   */
  async signFeedbackAuth(params: Agent0FeedbackAuthParams): Promise<string> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Signing feedback auth for agent ${params.targetAgentId}`, undefined, 'Agent0Client [signFeedbackAuth]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const authSignature = await this.sdk.signFeedbackAuth(
      agentId,
      params.clientAddress as `0x${string}`,
      params.indexLimit,
      params.expiryHours
    )
    
    logger.info(`Feedback auth signed for agent ${agentId}`, undefined, 'Agent0Client [signFeedbackAuth]')
    
    return authSignature
  }
  
  /**
   * Append response to feedback
   */
  async appendFeedbackResponse(params: Agent0FeedbackResponseParams): Promise<string> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Appending response to feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [appendFeedbackResponse]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const txHash = await this.sdk.appendResponse(
      agentId,
      params.clientAddress as `0x${string}`,
      params.feedbackIndex,
      params.response
    )
    
    logger.info(`Response appended successfully for agent ${agentId}`, undefined, 'Agent0Client [appendFeedbackResponse]')
    
    return txHash
  }
  
  /**
   * Revoke feedback
   */
  async revokeFeedback(params: Agent0RevokeFeedbackParams): Promise<string> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Revoking feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [revokeFeedback]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const txHash = await this.sdk.revokeFeedback(agentId, params.feedbackIndex)
    
    logger.info(`Feedback revoked successfully for agent ${agentId}`, undefined, 'Agent0Client [revokeFeedback]')
    
    return txHash
  }
  
  /**
   * Get specific feedback
   */
  async getFeedback(params: Agent0GetFeedbackParams): Promise<Agent0Feedback> {
    await this.ensureSDK()
    
    logger.info(`Getting feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [getFeedback]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const feedback = await this.sdk!.getFeedback(
      agentId,
      params.clientAddress as `0x${string}`,
      params.feedbackIndex
    )
    
    return feedback as Agent0Feedback
  }
  
  /**
   * Search feedback with filters
   */
  async searchFeedback(params: Agent0SearchFeedbackParams): Promise<Agent0Feedback[]> {
    await this.ensureSDK()
    
    logger.info(`Searching feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [searchFeedback]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const feedbacks = await this.sdk!.searchFeedback(
      agentId,
      params.tags,
      params.capabilities,
      params.skills,
      params.minScore,
      params.maxScore
    )
    
    return feedbacks as Agent0Feedback[]
  }
  
  /**
   * Get reputation summary
   */
  async getReputationSummary(params: Agent0ReputationSummaryParams): Promise<Agent0ReputationSummary> {
    await this.ensureSDK()
    
    logger.info(`Getting reputation summary for agent ${params.targetAgentId}`, undefined, 'Agent0Client [getReputationSummary]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    
    const summary = await this.sdk!.getReputationSummary(
      agentId,
      params.tag1,
      params.tag2
    )
    
    return summary
  }
  
  /**
   * Get agent profile from Agent0 network
   */
  async getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null> {
    await this.ensureSDK()
    
    logger.info(`Getting agent profile for token ${tokenId}`, undefined, 'Agent0Client [getAgentProfile]')
    
    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent: AgentSummary | null = await this.sdk!.getAgent(agentId)
    
    if (!agent) {
      return null
    }
    
    const capabilities = this.parseCapabilities(agent.extras);
    
    // Extract IPFS CID from agentURI if available, otherwise use agentId as fallback
    // agentURI format: "ipfs://Qm..." or just the CID
    let metadataCID = agent.agentId
    if (agent.extras?.agentURI) {
      const uri = agent.extras.agentURI as string
      metadataCID = uri.replace('ipfs://', '')
    }

    return {
      tokenId,
      name: agent.name,
      walletAddress: agent.walletAddress ?? '',
      metadataCID,
      capabilities,
      reputation: {
        trustScore: 0,
        accuracyScore: 0
      }
    }
  }

  /**
   * Load an existing agent from on-chain/IPFS
   */
  async loadAgent(tokenId: number): Promise<Agent> {
    await this.ensureSDK()
    
    logger.info(`Loading agent ${tokenId}`, undefined, 'Agent0Client [loadAgent]')
    
    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk!.loadAgent(agentId)
    
    return agent
  }
  
  /**
   * Transfer agent ownership
   */
  async transferAgent(params: Agent0TransferParams): Promise<Agent0TransferResult> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Transferring agent ${params.tokenId} to ${params.newOwner}`, undefined, 'Agent0Client [transferAgent]')
    
    const agentId = `${this.chainId}:${params.tokenId}` as `${number}:${number}`
    
    const result = await this.sdk.transferAgent(agentId, params.newOwner as `0x${string}`)
    
    logger.info(`Agent ${params.tokenId} transferred successfully`, undefined, 'Agent0Client [transferAgent]')
    
    return result
  }
  
  /**
   * Check if address is agent owner
   */
  async isAgentOwner(tokenId: number, address: string): Promise<boolean> {
    await this.ensureSDK()
    
    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    
    return await this.sdk!.isAgentOwner(agentId, address as `0x${string}`)
  }
  
  /**
   * Get agent owner
   */
  async getAgentOwner(tokenId: number): Promise<string> {
    await this.ensureSDK()
    
    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    
    return await this.sdk!.getAgentOwner(agentId)
  }
  
  /**
   * Search agents by reputation
   */
  async searchAgentsByReputation(params: Agent0ReputationSearchParams): Promise<Agent0ReputationSearchResult> {
    await this.ensureSDK()
    
    logger.info('Searching agents by reputation', params, 'Agent0Client [searchAgentsByReputation]')
    
    // Convert tokenIds to agentIds
    const agents = params.agents?.map(tokenId => `${this.chainId}:${tokenId}` as `${number}:${number}`)
    const reviewers = params.reviewers?.map(addr => addr as `0x${string}`)
    
    const result = await this.sdk!.searchAgentsByReputation(
      agents,
      params.tags,
      reviewers,
      params.capabilities,
      params.skills,
      params.tasks,
      params.names,
      params.minAverageScore,
      params.includeRevoked,
      params.pageSize,
      params.cursor,
      params.sort
    )

    return {
      items: result.items.map((agent: AgentSummary) => {
        const capabilities = this.parseCapabilities(agent.extras);
        return {
          tokenId: parseInt(agent.agentId.split(':')[1] ?? '0', 10),
          name: agent.name,
          walletAddress: agent.walletAddress ?? '',
          metadataCID: agent.agentId,
          capabilities,
          reputation: {
            trustScore: 0,
            accuracyScore: 0
          }
        };
      }),
      nextCursor: result.nextCursor,
      meta: result.meta
    }
  }

  private parseCapabilities(extras: Record<string, unknown> | undefined): {
    strategies: string[];
    markets: string[];
    actions: string[];
    version: string;
  } {
    const defaultCapabilities = {
      strategies: [],
      markets: [],
      actions: [],
      version: '1.0.0',
    };

    if (!extras?.capabilities) {
      return defaultCapabilities;
    }

    const validation = CapabilitiesSchema.safeParse(extras.capabilities);
    if (!validation.success) {
      logger.warn('Invalid agent capabilities in search result', { error: validation.error, capabilities: extras.capabilities });
      return defaultCapabilities;
    }

    return {
      strategies: validation.data.strategies ?? [],
      markets: validation.data.markets ?? [],
      actions: validation.data.actions ?? [],
      version: validation.data.version ?? '1.0.0',
    };
  }
  
  /**
   * Check if Agent0 SDK is available
   */
  isAvailable(): boolean {
    return this.sdk !== null && !this.sdk.isReadOnly
  }
  
  /**
   * Get the default chain ID for this client
   */
  getDefaultChainId(): number {
    return this.chainId
  }
  
  /**
   * Get the underlying SDK instance
   */
  getSDK(): SDK | null {
    return this.sdk
  }
  
  /**
   * Update agent metadata (Gap 20)
   * Allows updating agent information after initial registration
   */
  async updateAgentMetadata(params: Agent0UpdateMetadataParams): Promise<void> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Updating agent metadata: ${params.tokenId}`, undefined, 'Agent0Client [updateAgentMetadata]')
    
    const agentId = `${this.chainId}:${params.tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)
    
    // Update basic info
    if (params.name || params.description || params.imageUrl) {
      agent.updateInfo(params.name, params.description, params.imageUrl)
    }
    
    if (params.mcpEndpoint) {
      await agent.setMCP(params.mcpEndpoint, '1.0.0', true) // autoFetch=true
    }
    
    if (params.a2aEndpoint) {
      await agent.setA2A(params.a2aEndpoint, '1.0.0', true) // autoFetch=true
    }
    
    if (params.capabilities) {
      const metadata = agent.getMetadata()
      metadata.capabilities = params.capabilities
      agent.setMetadata(metadata)
    }
    
    if (params.active !== undefined) {
      agent.setActive(params.active)
    }
    
    // Re-publish to IPFS
    await agent.registerIPFS()

    logger.info(`Agent metadata updated: ${params.tokenId}`, undefined, 'Agent0Client [updateAgentMetadata]')
  }

  /**
   * Add OASF skill to agent
   * OASF (Open Agentic Schema Framework) v0.31
   */
  async addSkillToAgent(tokenId: number, skill: string, validateOASF = true): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Adding OASF skill to agent ${tokenId}: ${skill}`, { validateOASF }, 'Agent0Client [addSkillToAgent]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    agent.addSkill(skill, validateOASF)
    await agent.registerIPFS()

    logger.info(`OASF skill added to agent ${tokenId}: ${skill}`, undefined, 'Agent0Client [addSkillToAgent]')
  }

  /**
   * Add OASF domain to agent
   * OASF (Open Agentic Schema Framework) v0.31
   */
  async addDomainToAgent(tokenId: number, domain: string, validateOASF = true): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Adding OASF domain to agent ${tokenId}: ${domain}`, { validateOASF }, 'Agent0Client [addDomainToAgent]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    agent.addDomain(domain, validateOASF)
    await agent.registerIPFS()

    logger.info(`OASF domain added to agent ${tokenId}: ${domain}`, undefined, 'Agent0Client [addDomainToAgent]')
  }

  /**
   * Remove OASF skill from agent
   * OASF (Open Agentic Schema Framework) v0.31
   */
  async removeSkillFromAgent(tokenId: number, skill: string): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Removing OASF skill from agent ${tokenId}: ${skill}`, undefined, 'Agent0Client [removeSkillFromAgent]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    agent.removeSkill(skill)
    await agent.registerIPFS()

    logger.info(`OASF skill removed from agent ${tokenId}: ${skill}`, undefined, 'Agent0Client [removeSkillFromAgent]')
  }

  /**
   * Remove OASF domain from agent
   * OASF (Open Agentic Schema Framework) v0.31
   */
  async removeDomainFromAgent(tokenId: number, domain: string): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Removing OASF domain from agent ${tokenId}: ${domain}`, undefined, 'Agent0Client [removeDomainFromAgent]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    agent.removeDomain(domain)
    await agent.registerIPFS()

    logger.info(`OASF domain removed from agent ${tokenId}: ${domain}`, undefined, 'Agent0Client [removeDomainFromAgent]')
  }

  /**
   * Add operator to agent
   * Operators can manage agent on behalf of owner
   * Agent0 SDK v0.31
   */
  async addOperator(tokenId: number, operatorAddress: string): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Adding operator to agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [addOperator]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    // Get existing metadata
    const metadata = agent.getMetadata()
    const operators = (metadata.operators as string[]) || []

    if (!operators.includes(operatorAddress)) {
      operators.push(operatorAddress)
      agent.setMetadata({ ...metadata, operators })
      await agent.registerIPFS()
      logger.info(`Operator added to agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [addOperator]')
    } else {
      logger.warn(`Operator already exists for agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [addOperator]')
    }
  }

  /**
   * Remove operator from agent
   * Agent0 SDK v0.31
   */
  async removeOperator(tokenId: number, operatorAddress: string): Promise<void> {
    await this.ensureSDK()

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }

    logger.info(`Removing operator from agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [removeOperator]')

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`
    const agent = await this.sdk.loadAgent(agentId)

    // Get existing metadata
    const metadata = agent.getMetadata()
    const operators = (metadata.operators as string[]) || []
    const index = operators.indexOf(operatorAddress)

    if (index > -1) {
      operators.splice(index, 1)
      agent.setMetadata({ ...metadata, operators })
      await agent.registerIPFS()
      logger.info(`Operator removed from agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [removeOperator]')
    } else {
      logger.warn(`Operator not found for agent ${tokenId}: ${operatorAddress}`, undefined, 'Agent0Client [removeOperator]')
    }
  }
}

/**
 * Get or create singleton Agent0Client instance
 */
let agent0ClientInstance: Agent0Client | null = null

export function getAgent0Client(): Agent0Client {
  if (!agent0ClientInstance) {
    // Prioritize AGENT0_RPC_URL (for Ethereum Sepolia/mainnet where Agent0 contracts are deployed)
    // Fall back to Base RPC only if explicitly configured for Base-based Agent0 deployment
    const rpcUrl = process.env.AGENT0_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL
    const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || process.env.AGENT0_PRIVATE_KEY
    
    if (!rpcUrl || !privateKey) {
      throw new Error(
        'Agent0Client requires AGENT0_RPC_URL (or BASE_SEPOLIA_RPC_URL) and BABYLON_GAME_PRIVATE_KEY (or AGENT0_PRIVATE_KEY) environment variables'
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

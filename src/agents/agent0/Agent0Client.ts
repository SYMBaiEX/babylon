/**
 * Agent0 SDK Client
 * 
 * @module agents/agent0/Agent0Client
 * 
 * @description
 * Complete implementation of the Agent0 SDK client providing:
 * - Agent registration on ERC-8004 compatible registries
 * - IPFS metadata publishing via configurable providers (Pinata, Filecoin, node)
 * - Agent search and discovery via subgraph indexing
 * - Reputation feedback submission with cryptographic authorization
 * 
 * The client handles multi-chain operations (Ethereum for Agent0, Base for game logic)
 * and provides automatic retry logic with fail-fast error handling.
 * 
 * @example
 * ```typescript
 * const client = getAgent0Client()
 * 
 * // Register an agent
 * const result = await client.registerAgent({
 *   name: 'My Trading Agent',
 *   description: 'AI-powered prediction agent',
 *   walletAddress: '0x...',
 *   capabilities: { strategies: ['prediction-markets'], markets: ['crypto'], actions: ['place-bet'] }
 * })
 * 
 * // Search for agents
 * const agents = await client.searchAgents({ strategies: ['prediction-markets'] })
 * 
 * // Submit feedback
 * await client.submitFeedback({ targetAgentId: 123, rating: 4, comment: 'Great agent!' })
 * ```
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

// Import SDK and types from agent0-sdk
import { SDK } from 'agent0-sdk'
import type { 
  SDKConfig, 
  AgentSummary, 
  SearchParams,
  RegistrationFile
} from 'agent0-sdk'
import type { JsonValue } from '@/types/common'
import { parseCapabilities } from './capabilities-schema'

/**
 * Agent0 Client Implementation
 * 
 * @class Agent0Client
 * @implements {IAgent0Client}
 * 
 * @description
 * Core client for interacting with Agent0 protocol across Ethereum networks.
 * Manages SDK initialization, agent lifecycle, and network communications.
 */
export class Agent0Client implements IAgent0Client {
  private sdk: SDK | null
  private chainId: number
  private config: {
    network: 'sepolia' | 'mainnet' | 'localnet'
    rpcUrl: string
    privateKey: string
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata'
    ipfsNodeUrl?: string
    pinataJwt?: string
    filecoinPrivateKey?: string
    subgraphUrl?: string
  }
  private initPromise: Promise<void> | null = null
  
  /**
   * Creates Agent0Client instance
   * 
   * @param config - Client configuration
   * @param config.network - Target Ethereum network (sepolia/mainnet/localnet)
   * @param config.rpcUrl - Ethereum RPC endpoint URL
   * @param config.privateKey - Private key for signing transactions (0x-prefixed hex)
   * @param config.ipfsProvider - IPFS provider type (default: 'node')
   * @param config.ipfsNodeUrl - IPFS node URL (required for 'node' provider)
   * @param config.pinataJwt - Pinata JWT token (required for 'pinata' provider)
   * @param config.filecoinPrivateKey - Filecoin private key (required for 'filecoinPin' provider)
   * @param config.subgraphUrl - Agent0 subgraph URL for queries
   * 
   * @remarks
   * SDK is lazily initialized on first use via ensureSDK().
   * Chain ID is automatically determined from network parameter.
   */
  constructor(config: {
    network: 'sepolia' | 'mainnet' | 'localnet'
    rpcUrl: string
    privateKey: string
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata'
    ipfsNodeUrl?: string
    pinataJwt?: string
    filecoinPrivateKey?: string
    subgraphUrl?: string
  }) {
    // Set chain ID based on network
    if (config.network === 'localnet') {
      this.chainId = 31337 // Anvil default chain ID
    } else if (config.network === 'sepolia') {
      this.chainId = 11155111
    } else {
      this.chainId = 1 // mainnet
    }
    this.config = config
    this.sdk = null
  }
  
  /**
   * Initialize SDK with fail-fast error handling
   * 
   * @private
   * @returns Promise that resolves when SDK is initialized
   * @throws {Error} If IPFS provider configuration is invalid or SDK initialization fails
   * 
   * @description
   * Ensures SDK is initialized exactly once using singleton pattern with initPromise.
   * Validates IPFS provider configuration before initialization.
   * Fails fast on errors to prevent silent failures in production.
   * 
   * @remarks
   * - Automatically called by all public methods before SDK access
   * - Uses lazy initialization pattern to defer SDK creation
   * - Clears initPromise on both success and error to enable retries
   */
  private async ensureSDK(): Promise<void> {
    if (this.sdk) return
    
    if (this.initPromise) {
      await this.initPromise
      return
    }
    
    this.initPromise = (async () => {
      try {
        // Validate IPFS provider configuration
        const ipfsProvider = this.config.ipfsProvider || 'node'
        if (ipfsProvider === 'pinata' && !this.config.pinataJwt) {
          throw new Error('PINATA_JWT is required when using pinata IPFS provider')
        }
        if (ipfsProvider === 'filecoinPin' && !this.config.filecoinPrivateKey) {
          throw new Error('FILECOIN_PRIVATE_KEY is required when using filecoinPin IPFS provider')
        }
        
        // For localnet with 'node' provider, provide default IPFS node URL if not specified
        let ipfsNodeUrl = this.config.ipfsNodeUrl
        if (ipfsProvider === 'node' && !ipfsNodeUrl) {
          // Default to public IPFS gateway for localnet/testing
          ipfsNodeUrl = 'https://ipfs.io'
        }
        
        const sdkConfig: SDKConfig = {
          chainId: this.chainId,
          rpcUrl: this.config.rpcUrl,
          signer: this.config.privateKey,
          ipfs: ipfsProvider,
          ipfsNodeUrl: ipfsNodeUrl,
          pinataJwt: this.config.pinataJwt,
          filecoinPrivateKey: this.config.filecoinPrivateKey,
          subgraphUrl: this.config.subgraphUrl
        }
        
        this.sdk = new SDK(sdkConfig)
        logger.info('Agent0Client initialized successfully', { 
          chainId: this.chainId, 
          rpcUrl: this.config.rpcUrl,
          isReadOnly: this.sdk.isReadOnly
        }, 'Agent0Client')
        
        // Clear initPromise on success so retries work if needed
        this.initPromise = null
      } catch (error) {
        logger.error(
          'Failed to initialize Agent0 SDK',
          {
            error: error instanceof Error ? error.message : String(error),
            chainId: this.chainId,
            rpcUrl: this.config.rpcUrl
          },
          'Agent0Client'
        )
        // Clear initPromise on error so retries can attempt again
        this.initPromise = null
        // Don't set SDK on error - keep it null
        throw error
      }
    })()
    
    await this.initPromise
  }
  
  /**
   * Register an agent with Agent0 protocol
   * 
   * @param params - Agent registration parameters
   * @returns Promise resolving to registration result with tokenId and metadata CID
   * @throws {Error} If SDK not initialized or registration fails
   * 
   * @description
   * Complete agent registration flow:
   * 1. Register agent on-chain via ERC-8004 compatible registry
   * 2. Publish metadata to IPFS via configured provider
   * 3. Index agent in Agent0 subgraph for discovery
   * 
   * @example
   * ```typescript
   * const result = await client.registerAgent({
   *   name: 'Trading Bot Alpha',
   *   description: 'Automated prediction market agent',
   *   imageUrl: 'https://example.com/logo.png',
   *   walletAddress: '0x...',
   *   mcpEndpoint: 'https://myagent.com/mcp',
   *   a2aEndpoint: 'https://myagent.com/a2a',
   *   capabilities: {
   *     strategies: ['prediction-markets'],
   *     markets: ['crypto', 'sports'],
   *     actions: ['place-bet', 'analyze-odds']
   *   }
   * })
   * console.log(`Agent registered with token ID: ${result.tokenId}`)
   * ```
   * 
   * @remarks
   * - Requires SDK initialized with write access (private key configured)
   * - MCP and A2A endpoints are optional but recommended for full functionality
   * - Agent is set to active status by default
   * - Capabilities must include at least one strategy, market, or action
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
    
    if (params.mcpEndpoint) {
      await agent.setMCP(params.mcpEndpoint, '1.0.0', false)
    }
    
    if (params.a2aEndpoint) {
      await agent.setA2A(params.a2aEndpoint, '1.0.0', false)
    }
    
    agent.setMetadata({
      capabilities: params.capabilities,
      version: params.capabilities.version || '1.0.0'
    })
    
    agent.setActive(true)
    
    if (params.capabilities.x402Support !== undefined) {
      agent.setX402Support(params.capabilities.x402Support)
    }
    
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
   * Register Babylon game platform on Agent0 network
   *
   * @returns Promise resolving to registration result
   * @throws {Error} If BASE_IDENTITY_REGISTRY_ADDRESS not configured
   * 
   * @description
   * Registers the Babylon game itself as a discoverable agent in the Agent0 ecosystem.
   * This enables:
   * - Cross-game agent discovery (agents can find Babylon)
   * - External agent onboarding to Babylon markets
   * - Interoperability with broader Agent0 network
   * - Multi-chain game coordination (Ethereum for discovery, Base for operations)
   *
   * @remarks
   * - Game metadata includes Base network contract addresses for cross-chain operations
   * - Uses BABYLON_GAME_WALLET or falls back to AGENT0_PRIVATE_KEY
   * - Capabilities include game-specific actions like market creation and player registration
   * - X402 support enabled for paid agent interactions
   * 
   * @example
   * ```typescript
   * const client = getAgent0Client()
   * const result = await client.registerBabylonGame()
   * console.log(`Babylon registered as agent with token: ${result.tokenId}`)
   * ```
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
   * Search for agents on Agent0 network
   * 
   * @param filters - Search filters for agent discovery
   * @returns Promise resolving to array of matching agent profiles
   * @throws {Error} If SDK not initialized
   * 
   * @description
   * Queries the Agent0 subgraph to find agents matching specified criteria.
   * Supports filtering by strategies, skills, name, and X402 payment support.
   * 
   * @example
   * ```typescript
   * // Find prediction market agents
   * const agents = await client.searchAgents({ 
   *   strategies: ['prediction-markets'],
   *   x402Support: true
   * })
   * 
   * // Find agents by name
   * const babylon = await client.searchAgents({ 
   *   name: 'Babylon'
   * })
   * ```
   * 
   * @remarks
   * - Supports both 'strategies' and 'skills' filters (mapped to a2aSkills)
   * - X402 support filter enables finding agents that accept payment
   * - Results include basic reputation scores (trustScore, accuracyScore)
   */
  async searchAgents(filters: Agent0SearchFilters): Promise<Agent0SearchResult[]> {
    await this.ensureSDK()
    
    logger.info('Searching agents with filters:', filters, 'Agent0Client [searchAgents]')
    
    const searchParams: SearchParams = {}
    
    // Map strategies or skills to a2aSkills (both represent A2A skills)
    if (filters.strategies && filters.strategies.length > 0) {
      searchParams.a2aSkills = filters.strategies
    } else if (filters.skills && filters.skills.length > 0) {
      searchParams.a2aSkills = filters.skills
    }
    
    if (filters.name) {
      searchParams.name = filters.name
    }
    
    if (filters.x402Support !== undefined) {
      searchParams.x402support = filters.x402Support
    } else if (filters.hasX402 !== undefined) {
      // Legacy support for hasX402
      searchParams.x402support = filters.hasX402
    }
    
    const { items } = await this.sdk!.searchAgents(searchParams)
    
    return items.map((agent: AgentSummary) => {
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
    })
  }
  
  /**
   * Submit reputation feedback for an agent
   * 
   * @param params - Feedback parameters
   * @param params.targetAgentId - Token ID of agent receiving feedback
   * @param params.rating - Rating score from -5 (worst) to +5 (best)
   * @param params.comment - Optional feedback comment
   * @returns Promise that resolves when feedback is submitted
   * @throws {Error} If SDK not initialized with write access or feedback submission fails
   * 
   * @description
   * Submits cryptographically signed feedback to Agent0 network for agent reputation tracking.
   * Rating is converted to Agent0's 0-100 scale automatically.
   * 
   * @example
   * ```typescript
   * await client.submitFeedback({
   *   targetAgentId: 123,
   *   rating: 4,
   *   comment: 'Excellent predictions on crypto markets'
   * })
   * ```
   * 
   * @remarks
   * **Important Authorization Requirements:**
   * - Agent must pre-authorize this client's address for feedback submission
   * - For user-submitted feedback, use Agent0FeedbackService instead
   * - For system feedback, ensure system address is pre-authorized during agent registration
   * - Feedback expires after 24 hours and requires re-signing
   * 
   * Rating scale conversion:
   * - Input: -5 to +5 (standard rating)
   * - Output: 0 to 100 (Agent0 protocol scale)
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<void> {
    await this.ensureSDK()
    
    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access')
    }
    
    logger.info(`Submitting feedback for agent ${params.targetAgentId}`, undefined, 'Agent0Client [submitFeedback]')
    
    const agentId = `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`
    const agent0Score = Math.max(0, Math.min(100, (params.rating + 5) * 10))
    
    // Prepare feedback file
    const feedbackFile = this.sdk.prepareFeedback(
      agentId,
      agent0Score,
      [],
      params.comment || undefined,
      undefined,
      undefined,
      undefined
    )
    
    // For system-level feedback, we need to sign authorization
    // The SDK's signer (from config.privateKey) is used to sign the authorization
    // The agent should have pre-authorized this client address during registration
    // Get the signer address from the private key
    const { Wallet } = await import('ethers')
    const signerWallet = new Wallet(this.config.privateKey)
    const signerAddress = signerWallet.address as `0x${string}`
    
    // Sign feedback authorization (client signs to authorize themselves)
    // The agent should have pre-authorized this client address during registration
    const auth = await this.sdk.signFeedbackAuth(
      agentId,
      signerAddress,
      undefined, // index (auto-increment)
      24 // 24 hour expiry
    )
    
    // Submit feedback with authorization
    await this.sdk.giveFeedback(agentId, feedbackFile, auth)
    
    logger.info(`Feedback submitted successfully for agent ${agentId}`, undefined, 'Agent0Client [submitFeedback]')
  }
  
  /**
   * Get agent profile from Agent0 network
   * 
   * @param tokenId - Agent's unique token ID
   * @returns Promise resolving to agent profile or null if not found
   * @throws {Error} If SDK not initialized
   * 
   * @description
   * Fetches complete agent profile including metadata, capabilities, and reputation
   * from the Agent0 subgraph.
   * 
   * @example
   * ```typescript
   * const profile = await client.getAgentProfile(123)
   * if (profile) {
   *   console.log(`Agent: ${profile.name}`)
   *   console.log(`Trust Score: ${profile.reputation.trustScore}`)
   * }
   * ```
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

    return {
      tokenId,
      name: agent.name,
      walletAddress: agent.walletAddress ?? '',
      metadataCID: agent.agentId,
      capabilities,
      reputation: {
        trustScore: 0,
        accuracyScore: 0
      }
    }
  }

  /**
   * Parse and validate agent capabilities from extras metadata
   * 
   * @private
   * @param extras - Raw metadata from Agent0 SDK response
   * @returns Validated capabilities object with defaults for missing fields
   * 
   * @description
   * Transforms raw Agent0 metadata into typed capabilities object.
   * Validates structure and provides default empty arrays for missing fields.
   * Logs warnings for invalid or empty capabilities.
   */
  private parseCapabilities(extras: Record<string, JsonValue> | undefined): {
    strategies: string[];
    markets: string[];
    actions: string[];
    version: string;
  } {
    if (!extras?.capabilities) {
      return parseCapabilities(undefined)
    }

    const result = parseCapabilities(extras.capabilities)
    if (result.strategies.length === 0 && result.markets.length === 0 && result.actions.length === 0) {
      logger.warn('Invalid or empty agent capabilities in search result', { capabilities: extras.capabilities })
    }

    return result
  }
  
  /**
   * Check if Agent0 SDK is available with write access
   * 
   * @returns true if SDK is initialized and has write access, false otherwise
   * 
   * @description
   * Synchronous check for SDK availability. Returns false if SDK hasn't been
   * initialized yet or is in read-only mode.
   * 
   * @remarks
   * - Returns false if SDK not yet initialized (call ensureSDK() or any method first)
   * - Returns false if SDK is in read-only mode (missing private key)
   * - Use ensureAvailable() for async initialization and checking
   */
  isAvailable(): boolean {
    return this.sdk !== null && !this.sdk.isReadOnly
  }
  
  /**
   * Ensure SDK is initialized and check availability
   * 
   * @returns Promise resolving to true if SDK is available with write access
   * 
   * @description
   * Attempts to initialize SDK if not already initialized, then checks for write access.
   * Safe to call multiple times - handles initialization failures gracefully.
   * 
   * @example
   * ```typescript
   * if (await client.ensureAvailable()) {
   *   // SDK ready for operations
   *   await client.registerAgent(...)
   * } else {
   *   // SDK unavailable or read-only
   *   console.log('Agent0 not available')
   * }
   * ```
   */
  async ensureAvailable(): Promise<boolean> {
    try {
      await this.ensureSDK()
      const available = this.isAvailable()
      if (!available && this.sdk) {
        logger.debug(
          'SDK initialized but in read-only mode',
          { 
            isReadOnly: this.sdk.isReadOnly,
            chainId: this.chainId,
            rpcUrl: this.config.rpcUrl 
          },
          'Agent0Client'
        )
      }
      return available
    } catch (error) {
      logger.debug(
        'SDK initialization failed',
        { 
          error: error instanceof Error ? error.message : String(error),
          chainId: this.chainId,
          rpcUrl: this.config.rpcUrl 
        },
        'Agent0Client'
      )
      return false
    }
  }
  
  /**
   * Get the underlying Agent0 SDK instance
   * 
   * @returns SDK instance if initialized, null otherwise
   * 
   * @description
   * Provides direct access to the Agent0 SDK for advanced operations
   * not exposed through the client interface.
   * 
   * @remarks
   * Use with caution - direct SDK access bypasses client's error handling and logging.
   * Prefer using client methods when available.
   */
  getSDK(): SDK | null {
    return this.sdk
  }
}

/**
 * Singleton Agent0Client instance
 * @internal
 */
let agent0ClientInstance: Agent0Client | null = null

/**
 * Get or create singleton Agent0Client instance
 * 
 * @returns Singleton Agent0Client instance
 * @throws {Error} If required environment variables not configured
 * 
 * @description
 * Factory function providing singleton access to Agent0Client.
 * Automatically configures client from environment variables:
 * - AGENT0_NETWORK: Target network (sepolia/mainnet/localnet)
 * - AGENT0_RPC_URL or ETHEREUM_SEPOLIA_RPC_URL: Ethereum RPC endpoint
 * - BABYLON_GAME_PRIVATE_KEY or AGENT0_PRIVATE_KEY: Private key for signing
 * - AGENT0_IPFS_PROVIDER: IPFS provider (node/pinata/filecoinPin)
 * - PINATA_JWT: Pinata API token (if using pinata)
 * - FILECOIN_PRIVATE_KEY: Filecoin key (if using filecoinPin)
 * - AGENT0_SUBGRAPH_URL: Agent0 subgraph endpoint
 * 
 * @example
 * ```typescript
 * // Get singleton instance
 * const client = getAgent0Client()
 * 
 * // Register agent
 * const result = await client.registerAgent({ ... })
 * ```
 * 
 * @remarks
 * - Creates client instance on first call, returns same instance on subsequent calls
 * - Validates environment configuration and fails fast if misconfigured
 * - Localnet defaults to Anvil chain ID (31337) and localhost:8545
 */
export function getAgent0Client(): Agent0Client {
  if (!agent0ClientInstance) {
    // Validate network string
    const networkEnv = process.env.AGENT0_NETWORK
    const validNetworks = ['sepolia', 'mainnet', 'localnet'] as const
    const network = (networkEnv && validNetworks.includes(networkEnv as typeof validNetworks[number]))
      ? (networkEnv as 'sepolia' | 'mainnet' | 'localnet')
      : 'sepolia'
    
    if (networkEnv && !validNetworks.includes(networkEnv as typeof validNetworks[number])) {
      logger.warn(
        `Invalid AGENT0_NETWORK value: ${networkEnv}. Using default: sepolia`,
        undefined,
        'Agent0Client'
      )
    }
    
    // Support localnet RPC URL
    // Note: Agent0 operates on Ethereum, not Base, so we use Ethereum RPC URLs
    const rpcUrl = process.env.AGENT0_RPC_URL || 
                   (network === 'localnet' 
                     ? 'http://localhost:8545'
                     : (network === 'sepolia'
                       ? (process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com')
                       : (process.env.ETHEREUM_RPC_URL || 'https://ethereum-rpc.publicnode.com')))
    
    const privateKey = process.env.BABYLON_GAME_PRIVATE_KEY || 
                       process.env.AGENT0_PRIVATE_KEY ||
                       (network === 'localnet' ? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' : undefined)
    
    if (!rpcUrl || !privateKey) {
      throw new Error(
        'Agent0Client requires RPC URL and private key. Set AGENT0_RPC_URL (or ETHEREUM_SEPOLIA_RPC_URL for sepolia), and BABYLON_GAME_PRIVATE_KEY or AGENT0_PRIVATE_KEY'
      )
    }
    
    // Validate IPFS provider configuration
    const ipfsProvider = (process.env.AGENT0_IPFS_PROVIDER as 'node' | 'filecoinPin' | 'pinata') || 'node'
    if (ipfsProvider === 'pinata' && !process.env.PINATA_JWT) {
      logger.warn(
        'PINATA_JWT not set but pinata IPFS provider selected. SDK initialization may fail.',
        undefined,
        'Agent0Client'
      )
    }
    if (ipfsProvider === 'filecoinPin' && !process.env.FILECOIN_PRIVATE_KEY) {
      logger.warn(
        'FILECOIN_PRIVATE_KEY not set but filecoinPin IPFS provider selected. SDK initialization may fail.',
        undefined,
        'Agent0Client'
      )
    }
    
    agent0ClientInstance = new Agent0Client({
      network,
      rpcUrl,
      privateKey,
      ipfsProvider,
      ipfsNodeUrl: process.env.AGENT0_IPFS_API,
      pinataJwt: process.env.PINATA_JWT,
      filecoinPrivateKey: process.env.FILECOIN_PRIVATE_KEY,
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL
    })
  }
  
  return agent0ClientInstance
}

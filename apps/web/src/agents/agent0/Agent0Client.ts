/**
 * Agent0 SDK Client
 *
 * Full implementation of Agent0 SDK client for agent registration, search, and feedback.
 * Implements IAgent0Client interface for complete Agent0 integration.
 * Uses dynamic imports to handle CommonJS/ESM interop.
 */

import type {
  AgentSummary,
  RegistrationFile,
  SDKConfig,
  SearchParams,
} from 'agent0-sdk';
// Import SDK and types from agent0-sdk
import { SDK } from 'agent0-sdk';
import { getContractAddresses } from '@/lib/deployment/addresses';
import { logger } from '@/lib/logger';
import type { JsonValue } from '@/types/common';
import { parseCapabilities } from './capabilities-schema';
import type {
  Agent0AgentProfile,
  Agent0FeedbackParams,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0SearchFilters,
  Agent0SearchResult,
  IAgent0Client,
} from './types';

export class Agent0Client implements IAgent0Client {
  private sdk: SDK | null;
  private chainId: number;
  private config: {
    network: 'sepolia' | 'mainnet' | 'localnet';
    rpcUrl: string;
    privateKey: string;
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata';
    ipfsNodeUrl?: string;
    pinataJwt?: string;
    filecoinPrivateKey?: string;
    subgraphUrl?: string;
  };
  private initPromise: Promise<void> | null = null;

  constructor(config: {
    network: 'sepolia' | 'mainnet' | 'localnet';
    rpcUrl: string;
    privateKey: string;
    ipfsProvider?: 'node' | 'filecoinPin' | 'pinata';
    ipfsNodeUrl?: string;
    pinataJwt?: string;
    filecoinPrivateKey?: string;
    subgraphUrl?: string;
  }) {
    // Set chain ID based on network
    if (config.network === 'localnet') {
      this.chainId = 31337; // Hardhat default chain ID
    } else if (config.network === 'sepolia') {
      this.chainId = 11155111;
    } else {
      this.chainId = 1; // mainnet
    }
    this.config = config;
    this.sdk = null;
  }

  /**
   * Initialize SDK - fails fast on any error
   */
  private async ensureSDK(): Promise<void> {
    if (this.sdk) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        // Validate IPFS provider configuration
        const ipfsProvider = this.config.ipfsProvider || 'node';
        if (ipfsProvider === 'pinata' && !this.config.pinataJwt) {
          throw new Error(
            'PINATA_JWT is required when using pinata IPFS provider'
          );
        }
        if (ipfsProvider === 'filecoinPin' && !this.config.filecoinPrivateKey) {
          throw new Error(
            'FILECOIN_PRIVATE_KEY is required when using filecoinPin IPFS provider'
          );
        }

        // For localnet with 'node' provider, provide default IPFS node URL if not specified
        let ipfsNodeUrl = this.config.ipfsNodeUrl;
        if (ipfsProvider === 'node' && !ipfsNodeUrl) {
          // Default to public IPFS gateway for localnet/testing
          ipfsNodeUrl = 'https://ipfs.io';
        }

        // Get contract addresses for registry overrides (needed for localnet)
        let registryOverrides: SDKConfig['registryOverrides'] | undefined;
        if (this.chainId === 31337) {
          // For localnet, provide reputation registry address from local deployment
          try {
            const contracts = getContractAddresses();
            if (
              contracts.reputationSystem &&
              contracts.reputationSystem !==
                '0x0000000000000000000000000000000000000000'
            ) {
              registryOverrides = {
                [this.chainId]: {
                  REPUTATION: contracts.reputationSystem as `0x${string}`,
                  IDENTITY: contracts.identityRegistry as `0x${string}`,
                },
              };
            }
          } catch (error) {
            logger.warn(
              'Failed to get contract addresses for registry overrides',
              { error: error instanceof Error ? error.message : String(error) },
              'Agent0Client'
            );
          }
        }

        const sdkConfig: SDKConfig = {
          chainId: this.chainId,
          rpcUrl: this.config.rpcUrl,
          signer: this.config.privateKey,
          ipfs: ipfsProvider,
          ipfsNodeUrl: ipfsNodeUrl,
          pinataJwt: this.config.pinataJwt,
          filecoinPrivateKey: this.config.filecoinPrivateKey,
          subgraphUrl: this.config.subgraphUrl,
          registryOverrides,
        };

        this.sdk = new SDK(sdkConfig);
        logger.info(
          'Agent0Client initialized successfully',
          {
            chainId: this.chainId,
            rpcUrl: this.config.rpcUrl,
            isReadOnly: this.sdk.isReadOnly,
          },
          'Agent0Client'
        );

        // Clear initPromise on success so retries work if needed
        this.initPromise = null;
      } catch (error) {
        logger.error(
          'Failed to initialize Agent0 SDK',
          {
            error: error instanceof Error ? error.message : String(error),
            chainId: this.chainId,
            rpcUrl: this.config.rpcUrl,
          },
          'Agent0Client'
        );
        // Clear initPromise on error so retries can attempt again
        this.initPromise = null;
        // Don't set SDK on error - keep it null
        throw error;
      }
    })();

    await this.initPromise;
  }

  /**
   * Register an agent with Agent0 SDK
   *
   * This will:
   * 1. Register on-chain (ERC-8004)
   * 2. Publish metadata to IPFS
   * 3. Index in Agent0 subgraph
   */
  async registerAgent(
    params: Agent0RegistrationParams
  ): Promise<Agent0RegistrationResult> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Registering agent: ${params.name}`,
      undefined,
      'Agent0Client [registerAgent]'
    );

    const agent = this.sdk.createAgent(
      params.name,
      params.description,
      params.imageUrl
    );

    if (params.walletAddress) {
      agent.setAgentWallet(params.walletAddress as `0x${string}`, this.chainId);
    }

    if (params.mcpEndpoint) {
      await agent.setMCP(params.mcpEndpoint, '1.0.0', false);
    }

    if (params.a2aEndpoint) {
      await agent.setA2A(params.a2aEndpoint, '1.0.0', false);
    }

    agent.setMetadata({
      capabilities: params.capabilities,
      version: params.capabilities.version || '1.0.0',
    });

    agent.setActive(true);

    if (params.capabilities.x402Support !== undefined) {
      agent.setX402Support(params.capabilities.x402Support);
    }

    const registrationFile: RegistrationFile = await agent.registerIPFS();

    logger.info(
      'Registration file returned from SDK:',
      {
        agentId: registrationFile.agentId,
        agentURI: registrationFile.agentURI,
        active: registrationFile.active,
        x402support: registrationFile.x402support,
      },
      'Agent0Client [registerAgent]'
    );

    if (!registrationFile.agentId) {
      throw new Error('Registration file missing agentId');
    }

    const agentId = registrationFile.agentId;
    const parts = agentId.split(':');
    const tokenId = Number.parseInt(parts[1]!, 10);

    logger.info(
      `Agent registered successfully: ${agentId}`,
      undefined,
      'Agent0Client [registerAgent]'
    );

    return {
      tokenId,
      txHash: '',
      metadataCID: registrationFile.agentURI?.replace('ipfs://', ''),
    };
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
    const baseChainId = Number.parseInt(
      process.env.BASE_CHAIN_ID || '8453',
      10
    ); // Base mainnet by default
    const baseRegistryAddress = process.env.BASE_IDENTITY_REGISTRY_ADDRESS;
    const baseReputationAddress = process.env.BASE_REPUTATION_SYSTEM_ADDRESS;
    const baseMarketAddress = process.env.BASE_DIAMOND_ADDRESS;

    if (!baseRegistryAddress) {
      throw new Error(
        'BASE_IDENTITY_REGISTRY_ADDRESS required for game registration'
      );
    }

    logger.info(
      'Registering Babylon game on agent0',
      {
        baseChainId,
        baseRegistryAddress,
      },
      'Agent0Client [registerBabylonGame]'
    );

    return this.registerAgent({
      name: process.env.BABYLON_GAME_NAME || 'Babylon Prediction Game',
      description:
        process.env.BABYLON_GAME_DESCRIPTION ||
        'AI-powered prediction market game on Base network',
      imageUrl: process.env.BABYLON_LOGO_URL,
      walletAddress:
        process.env.BABYLON_GAME_WALLET || process.env.AGENT0_PRIVATE_KEY || '',
      mcpEndpoint: process.env.BABYLON_MCP_URL
        ? `${process.env.BABYLON_MCP_URL}/mcp`
        : undefined,
      a2aEndpoint: process.env.BABYLON_A2A_URL
        ? `${process.env.BABYLON_A2A_URL}/a2a`
        : undefined,
      capabilities: {
        strategies: [
          'prediction-markets',
          'reputation-tracking',
          'agent-discovery',
        ],
        markets: ['sports', 'crypto', 'politics', 'entertainment', 'ai'],
        actions: [
          'register-player',
          'create-market',
          'place-bet',
          'resolve-market',
          'submit-feedback',
        ],
        version: '1.0.0',
        platform: 'babylon',
        userType: 'game',
        x402Support: true,
        skills: [],
        domains: [],
        // Cross-chain game network info
        gameNetwork: {
          chainId: baseChainId,
          registryAddress: baseRegistryAddress,
          reputationAddress: baseReputationAddress,
          marketAddress: baseMarketAddress,
        },
      },
    });
  }

  /**
   * Search for agents using Agent0 SDK
   */
  async searchAgents(
    filters: Agent0SearchFilters
  ): Promise<Agent0SearchResult[]> {
    await this.ensureSDK();

    logger.info(
      'Searching agents with filters:',
      filters,
      'Agent0Client [searchAgents]'
    );

    const searchParams: SearchParams = {};

    // Map strategies or skills to a2aSkills (both represent A2A skills)
    if (filters.strategies && filters.strategies.length > 0) {
      searchParams.a2aSkills = filters.strategies;
    } else if (filters.skills && filters.skills.length > 0) {
      searchParams.a2aSkills = filters.skills;
    }

    if (filters.name) {
      searchParams.name = filters.name;
    }

    if (filters.x402Support !== undefined) {
      searchParams.x402support = filters.x402Support;
    } else if (filters.hasX402 !== undefined) {
      // Legacy support for hasX402
      searchParams.x402support = filters.hasX402;
    }

    const { items } = await this.sdk!.searchAgents(searchParams);

    return items.map((agent: AgentSummary) => {
      const capabilities = this.parseCapabilities(agent.extras);
      return {
        tokenId: Number.parseInt(agent.agentId.split(':')[1] ?? '0', 10),
        name: agent.name,
        walletAddress: agent.walletAddress ?? '',
        metadataCID: agent.agentId,
        capabilities,
        reputation: {
          trustScore: 0,
          accuracyScore: 0,
        },
      };
    });
  }

  /**
   * Submit feedback for an agent
   *
   * Note: This method requires the agent to have pre-authorized feedback from the client address.
   * For user-submitted feedback, use Agent0FeedbackService which handles authorization properly.
   * For system-level reputation updates, ensure the agent has pre-authorized the system address.
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<void> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Submitting feedback for agent ${params.targetAgentId}`,
      undefined,
      'Agent0Client [submitFeedback]'
    );

    const agentId =
      `${this.chainId}:${params.targetAgentId}` as `${number}:${number}`;
    const agent0Score = Math.max(0, Math.min(100, (params.rating + 5) * 10));

    // Prepare feedback file
    const feedbackFile = this.sdk.prepareFeedback(
      agentId,
      agent0Score,
      [],
      params.comment || undefined,
      undefined,
      undefined,
      undefined
    );

    // For system-level feedback, we need to sign authorization
    // The SDK's signer (from config.privateKey) is used to sign the authorization
    // The agent should have pre-authorized this client address during registration
    // Get the signer address from the private key
    const { Wallet } = await import('ethers');
    const signerWallet = new Wallet(this.config.privateKey);
    const signerAddress = signerWallet.address as `0x${string}`;

    // Sign feedback authorization (client signs to authorize themselves)
    // The agent should have pre-authorized this client address during registration
    const auth = await this.sdk.signFeedbackAuth(
      agentId,
      signerAddress,
      undefined, // index (auto-increment)
      24 // 24 hour expiry
    );

    // Submit feedback with authorization
    await this.sdk.giveFeedback(agentId, feedbackFile, auth);

    logger.info(
      `Feedback submitted successfully for agent ${agentId}`,
      undefined,
      'Agent0Client [submitFeedback]'
    );
  }

  /**
   * Get agent profile from Agent0 network
   */
  async getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null> {
    await this.ensureSDK();

    logger.info(
      `Getting agent profile for token ${tokenId}`,
      undefined,
      'Agent0Client [getAgentProfile]'
    );

    const agentId = `${this.chainId}:${tokenId}` as `${number}:${number}`;
    const agent: AgentSummary | null = await this.sdk!.getAgent(agentId);

    if (!agent) {
      return null;
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
        accuracyScore: 0,
      },
    };
  }

  private parseCapabilities(extras: Record<string, JsonValue> | undefined): {
    strategies: string[];
    markets: string[];
    actions: string[];
    version: string;
    skills: string[];
    domains: string[];
  } {
    if (!extras?.capabilities) {
      return parseCapabilities(undefined);
    }

    const result = parseCapabilities(extras.capabilities);
    if (
      result.strategies.length === 0 &&
      result.markets.length === 0 &&
      result.actions.length === 0
    ) {
      logger.warn('Invalid or empty agent capabilities in search result', {
        capabilities: extras.capabilities,
      });
    }

    return result;
  }

  /**
   * Check if Agent0 SDK is available
   * Note: This will return false if SDK hasn't been initialized yet.
   * Call ensureSDK() or any method that uses the SDK to initialize it first.
   */
  isAvailable(): boolean {
    return this.sdk !== null && !this.sdk.isReadOnly;
  }

  /**
   * Initialize SDK synchronously if possible, or return current availability
   * For async initialization, use any method that calls ensureSDK()
   */
  async ensureAvailable(): Promise<boolean> {
    await this.ensureSDK();
    return this.isAvailable();
  }

  /**
   * Get the underlying SDK instance
   */
  getSDK(): SDK | null {
    return this.sdk;
  }
}

/**
 * Get or create singleton Agent0Client instance
 */
let agent0ClientInstance: Agent0Client | null = null;

export function getAgent0Client(): Agent0Client {
  if (!agent0ClientInstance) {
    // Validate network string
    const networkEnv = process.env.AGENT0_NETWORK;
    const validNetworks = ['sepolia', 'mainnet', 'localnet'] as const;
    const network =
      networkEnv &&
      validNetworks.includes(networkEnv as (typeof validNetworks)[number])
        ? (networkEnv as 'sepolia' | 'mainnet' | 'localnet')
        : 'sepolia';

    if (
      networkEnv &&
      !validNetworks.includes(networkEnv as (typeof validNetworks)[number])
    ) {
      logger.warn(
        `Invalid AGENT0_NETWORK value: ${networkEnv}. Using default: sepolia`,
        undefined,
        'Agent0Client'
      );
    }

    // Support localnet RPC URL
    // Note: Agent0 operates on Ethereum, not Base, so we use Ethereum RPC URLs
    const rpcUrl =
      process.env.AGENT0_RPC_URL ||
      (network === 'localnet'
        ? 'http://localhost:8545'
        : network === 'sepolia'
          ? process.env.ETHEREUM_SEPOLIA_RPC_URL ||
            'https://ethereum-sepolia-rpc.publicnode.com'
          : process.env.ETHEREUM_RPC_URL ||
            'https://ethereum-rpc.publicnode.com');

    const privateKey =
      process.env.BABYLON_GAME_PRIVATE_KEY ||
      process.env.AGENT0_PRIVATE_KEY ||
      (network === 'localnet'
        ? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        : undefined);

    if (!rpcUrl || !privateKey) {
      throw new Error(
        'Agent0Client requires RPC URL and private key. Set AGENT0_RPC_URL (or ETHEREUM_SEPOLIA_RPC_URL for sepolia), and BABYLON_GAME_PRIVATE_KEY or AGENT0_PRIVATE_KEY'
      );
    }

    // Validate IPFS provider configuration
    const ipfsProvider =
      (process.env.AGENT0_IPFS_PROVIDER as 'node' | 'filecoinPin' | 'pinata') ||
      'node';
    if (ipfsProvider === 'pinata' && !process.env.PINATA_JWT) {
      logger.warn(
        'PINATA_JWT not set but pinata IPFS provider selected. SDK initialization may fail.',
        undefined,
        'Agent0Client'
      );
    }
    if (ipfsProvider === 'filecoinPin' && !process.env.FILECOIN_PRIVATE_KEY) {
      logger.warn(
        'FILECOIN_PRIVATE_KEY not set but filecoinPin IPFS provider selected. SDK initialization may fail.',
        undefined,
        'Agent0Client'
      );
    }

    agent0ClientInstance = new Agent0Client({
      network,
      rpcUrl,
      privateKey,
      ipfsProvider,
      ipfsNodeUrl: process.env.AGENT0_IPFS_API,
      pinataJwt: process.env.PINATA_JWT,
      filecoinPrivateKey: process.env.FILECOIN_PRIVATE_KEY,
      subgraphUrl: process.env.AGENT0_SUBGRAPH_URL,
    });
  }

  return agent0ClientInstance;
}

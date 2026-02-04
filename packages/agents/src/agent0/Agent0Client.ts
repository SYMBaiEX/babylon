/**
 * Agent0 SDK Client
 *
 * Comprehensive implementation of Agent0 SDK client for agent lifecycle management,
 * search, feedback, reputation, and ownership operations.
 * Implements IAgent0Client interface for complete Agent0 integration.
 *
 * @remarks
 * Uses dynamic imports to handle CommonJS/ESM interop with the agent0-sdk package.
 *
 * @packageDocumentation
 */

import { logger } from '@babylon/shared';
import type {
  AgentSummary,
  Feedback,
  RegistrationFile,
  SDKConfig,
  SearchFilters,
} from 'agent0-sdk';
// Import SDK and types from agent0-sdk
import { SDK } from 'agent0-sdk';
import type { JsonValue } from '../types/common';

/**
 * Contract addresses for Agent0 integration
 * @internal
 */
interface ContractAddresses {
  identityRegistry: `0x${string}`;
  reputationSystem: `0x${string}`;
  chainId: number;
  network: string;
}

let contractAddressesProvider: (() => ContractAddresses) | null = null;

/**
 * Configures the contract addresses provider
 *
 * Must be called by the application layer (apps/web) to provide contract addresses.
 *
 * @param provider - Function that returns contract addresses
 */
export function setContractAddressesProvider(
  provider: () => ContractAddresses
): void {
  contractAddressesProvider = provider;
}

/**
 * Gets contract addresses using provider or fallback
 * @internal
 */
function getContractAddresses(): ContractAddresses {
  if (contractAddressesProvider) {
    return contractAddressesProvider();
  }
  return {
    identityRegistry: '0x0000000000000000000000000000000000000000',
    reputationSystem: '0x0000000000000000000000000000000000000000',
    chainId: 31337,
    network: 'localnet',
  };
}

import { parseCapabilities } from './capabilities-schema';
import type {
  Agent0AgentProfile,
  Agent0AgentUpdateParams,
  Agent0Feedback,
  Agent0FeedbackParams,
  Agent0FeedbackSearchParams,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0ReputationSummary,
  Agent0SearchFilters,
  Agent0SearchOptions,
  Agent0SearchResponse,
  Agent0SearchResult,
  Agent0TransferResult,
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
    if (config.network === 'localnet') {
      this.chainId = 31337;
    } else if (config.network === 'sepolia') {
      this.chainId = 11155111;
    } else {
      this.chainId = 1;
    }
    this.config = config;
    this.sdk = null;
  }

  /**
   * Initializes SDK - fails fast on any error
   * @internal
   */
  private async ensureSDK(): Promise<void> {
    if (this.sdk) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
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

        let ipfsNodeUrl = this.config.ipfsNodeUrl;
        if (ipfsProvider === 'node' && !ipfsNodeUrl) {
          ipfsNodeUrl = 'https://ipfs.io';
        }

        let registryOverrides: SDKConfig['registryOverrides'] | undefined;
        if (this.chainId === 31337) {
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
          } catch {
            // Ignore local contract lookup failures
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

        this.initPromise = null;
      } catch (error) {
        this.initPromise = null;
        throw error;
      }
    })();

    await this.initPromise;
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

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

  // ===========================================================================
  // Search & Discovery
  // ===========================================================================

  /**
   * Search for agents using Agent0 SDK v1.5.2 unified search API
   *
   * @remarks
   * v1.5.2 uses a unified search with feedback filters integrated.
   * Returns a flat array (no pagination).
   */
  async searchAgents(
    filters: Agent0SearchFilters,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResult[]> {
    await this.ensureSDK();

    logger.info(
      'Searching agents with filters:',
      { filters, options },
      'Agent0Client [searchAgents]'
    );

    const sdkFilters = this.mapToSdkFilters(filters);
    const sdkOptions = options?.sort ? { sort: options.sort } : undefined;

    const results = await this.sdk!.searchAgents(sdkFilters, sdkOptions);

    return results.map((agent: AgentSummary) =>
      this.mapAgentSummaryToSearchResult(agent)
    );
  }

  /**
   * Maps Babylon search filters to SDK v1.5.2 SearchFilters
   * @internal
   */
  private mapToSdkFilters(filters: Agent0SearchFilters): SearchFilters {
    const sdkFilters: SearchFilters = {};

    // Basic filters
    if (filters.name) {
      sdkFilters.name = filters.name;
    }

    if (filters.description) {
      sdkFilters.description = filters.description;
    }

    if (filters.x402Support !== undefined) {
      sdkFilters.x402support = filters.x402Support;
    }

    // Active status filter
    if (filters.active !== undefined) {
      sdkFilters.active = filters.active;
    }

    // Multi-chain search support
    if (filters.chains !== undefined) {
      sdkFilters.chains = filters.chains;
    }

    // Owner & operator filters
    if (filters.owners && filters.owners.length > 0) {
      sdkFilters.owners = filters.owners as `0x${string}`[];
    }

    if (filters.operators && filters.operators.length > 0) {
      sdkFilters.operators = filters.operators as `0x${string}`[];
    }

    // Protocol capability filters
    if (filters.mcp !== undefined) {
      sdkFilters.mcp = filters.mcp;
    }

    if (filters.a2a !== undefined) {
      sdkFilters.a2a = filters.a2a;
    }

    // Identity filters
    if (filters.ens) {
      sdkFilters.ens = filters.ens;
    }

    if (filters.did) {
      sdkFilters.did = filters.did;
    }

    if (filters.walletAddress) {
      sdkFilters.walletAddress = filters.walletAddress as `0x${string}`;
    }

    // Trust model filters
    if (filters.supportedTrust && filters.supportedTrust.length > 0) {
      sdkFilters.supportedTrust = filters.supportedTrust;
    }

    // Capability-specific filters
    if (filters.mcpTools && filters.mcpTools.length > 0) {
      sdkFilters.mcpTools = filters.mcpTools;
    }

    if (filters.mcpPrompts && filters.mcpPrompts.length > 0) {
      sdkFilters.mcpPrompts = filters.mcpPrompts;
    }

    if (filters.mcpResources && filters.mcpResources.length > 0) {
      sdkFilters.mcpResources = filters.mcpResources;
    }

    // OASF taxonomies (v1.5.2)
    if (filters.oasfSkills && filters.oasfSkills.length > 0) {
      sdkFilters.oasfSkills = filters.oasfSkills;
    }

    if (filters.oasfDomains && filters.oasfDomains.length > 0) {
      sdkFilters.oasfDomains = filters.oasfDomains;
    }

    // Map legacy skill filters to OASF or a2aSkills
    if (filters.a2aSkills && filters.a2aSkills.length > 0) {
      sdkFilters.a2aSkills = filters.a2aSkills;
    } else if (filters.strategies && filters.strategies.length > 0) {
      sdkFilters.a2aSkills = filters.strategies;
    } else if (filters.skills && filters.skills.length > 0) {
      sdkFilters.a2aSkills = filters.skills;
    }

    // Integrated feedback/reputation filters (v1.5.2)
    if (filters.feedback) {
      sdkFilters.feedback = {
        hasFeedback: filters.feedback.hasFeedback,
        minValue: filters.feedback.minValue,
        maxValue: filters.feedback.maxValue,
        minCount: filters.feedback.minCount,
        fromReviewers: filters.feedback.fromReviewers as `0x${string}`[] | undefined,
        tag: filters.feedback.tag,
        includeRevoked: filters.feedback.includeRevoked,
      };
    }

    // Legacy minReputation filter -> feedback.minValue
    if (filters.minReputation !== undefined && !filters.feedback) {
      sdkFilters.feedback = {
        minValue: filters.minReputation,
      };
    }

    return sdkFilters;
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

    return this.mapAgentSummaryToProfile(agent, tokenId);
  }

  // ===========================================================================
  // Agent Management
  // ===========================================================================

  /**
   * Load an existing agent for editing
   */
  async loadAgent(agentId: string): Promise<Agent0AgentProfile | null> {
    await this.ensureSDK();

    logger.info(
      `Loading agent: ${agentId}`,
      undefined,
      'Agent0Client [loadAgent]'
    );

    try {
      const agent = await this.sdk!.loadAgent(agentId as `${number}:${number}`);
      const registrationFile = agent.getRegistrationFile();
      const parts = agentId.split(':');
      const tokenId = Number.parseInt(parts[1] ?? '0', 10);

      const capabilities = this.parseCapabilities(
        registrationFile.metadata as Record<string, JsonValue> | undefined
      );

      return {
        tokenId,
        name: registrationFile.name,
        walletAddress: registrationFile.walletAddress ?? '',
        metadataCID: registrationFile.agentURI ?? agentId,
        capabilities,
        reputation: {
          trustScore: 0,
          accuracyScore: 0,
        },
        description: registrationFile.description,
        image: registrationFile.image,
        chainId: registrationFile.walletChainId,
        owners: registrationFile.owners,
        operators: registrationFile.operators,
        endpoints: registrationFile.endpoints.map((ep) => ({
          type: ep.type as 'MCP' | 'A2A' | 'ENS' | 'DID' | 'wallet' | 'OASF',
          value: ep.value,
          meta: ep.meta,
        })),
        trustModels: registrationFile.trustModels as string[],
        active: registrationFile.active,
        x402support: registrationFile.x402support,
        metadata: registrationFile.metadata,
        updatedAt: registrationFile.updatedAt,
      };
    } catch (error) {
      logger.warn(
        `Failed to load agent ${agentId}:`,
        { error: error instanceof Error ? error.message : String(error) },
        'Agent0Client [loadAgent]'
      );
      return null;
    }
  }

  /**
   * Update an existing agent's properties
   */
  async updateAgent(
    agentId: string,
    params: Agent0AgentUpdateParams
  ): Promise<Agent0RegistrationResult> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Updating agent: ${agentId}`,
      { params },
      'Agent0Client [updateAgent]'
    );

    const agent = await this.sdk.loadAgent(agentId as `${number}:${number}`);

    // Update basic info if provided
    if (params.name || params.description || params.image) {
      agent.updateInfo(params.name, params.description, params.image);
    }

    // Update wallet if provided
    if (params.walletAddress) {
      agent.setAgentWallet(
        params.walletAddress as `0x${string}`,
        params.walletChainId ?? this.chainId
      );
    }

    // Update endpoints if provided
    if (params.mcpEndpoint) {
      await agent.setMCP(params.mcpEndpoint, '1.0.0', false);
    }

    if (params.a2aEndpoint) {
      await agent.setA2A(params.a2aEndpoint, '1.0.0', false);
    }

    // Update skills
    if (params.skills) {
      for (const skill of params.skills) {
        agent.addSkill(skill, false);
      }
    }

    // Update domains
    if (params.domains) {
      for (const domain of params.domains) {
        agent.addDomain(domain, false);
      }
    }

    // Update status flags
    if (params.active !== undefined) {
      agent.setActive(params.active);
    }

    if (params.x402Support !== undefined) {
      agent.setX402Support(params.x402Support);
    }

    // Update trust models
    if (params.trustModels) {
      agent.setTrust(
        params.trustModels.reputation,
        params.trustModels.cryptoEconomic,
        params.trustModels.teeAttestation
      );
    }

    // Update metadata
    if (params.metadata) {
      agent.setMetadata(params.metadata);
    }

    // Re-register to IPFS with updated data
    const registrationFile: RegistrationFile = await agent.registerIPFS();

    const parts = agentId.split(':');
    const tokenId = Number.parseInt(parts[1]!, 10);

    logger.info(
      `Agent updated successfully: ${agentId}`,
      undefined,
      'Agent0Client [updateAgent]'
    );

    return {
      tokenId,
      txHash: '',
      metadataCID: registrationFile.agentURI?.replace('ipfs://', ''),
    };
  }

  /**
   * Transfer agent ownership to a new address
   */
  async transferAgent(
    agentId: string,
    newOwner: string
  ): Promise<Agent0TransferResult> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Transferring agent ${agentId} to ${newOwner}`,
      undefined,
      'Agent0Client [transferAgent]'
    );

    const result = await this.sdk.transferAgent(
      agentId as `${number}:${number}`,
      newOwner as `0x${string}`
    );

    logger.info(
      `Agent transferred successfully: ${agentId}`,
      { txHash: result.txHash },
      'Agent0Client [transferAgent]'
    );

    return {
      txHash: result.txHash,
      from: result.from,
      to: result.to,
      agentId: result.agentId,
    };
  }

  /**
   * Check if an address owns the specified agent
   */
  async isAgentOwner(agentId: string, address: string): Promise<boolean> {
    await this.ensureSDK();

    return this.sdk!.isAgentOwner(
      agentId as `${number}:${number}`,
      address as `0x${string}`
    );
  }

  /**
   * Get the owner address of an agent
   */
  async getAgentOwner(agentId: string): Promise<string> {
    await this.ensureSDK();

    return this.sdk!.getAgentOwner(agentId as `${number}:${number}`);
  }

  // ===========================================================================
  // Feedback & Reputation
  // ===========================================================================

  /**
   * Submits feedback for an agent
   *
   * @remarks
   * v1.5.2 API: giveFeedback(agentId, value, tag1?, tag2?, endpoint?, feedbackFile?)
   *
   * @param params - Feedback parameters
   * @throws Error if SDK not initialized or feedback submission fails
   */
  async submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback> {
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

    // Prepare feedback file with extended parameters (for off-chain data)
    const feedbackFile = {
      text: params.comment || '',
      context: params.context,
      proofOfPayment: params.proofOfPayment,
      capability: params.capability,
      skill: params.skill,
      task: params.task,
    };

    // v1.5.2 API: giveFeedback(agentId, value, tag1?, tag2?, endpoint?, feedbackFile?)
    const tag1 = params.tags?.[0];
    const tag2 = params.tags?.[1];

    const tx = await this.sdk.giveFeedback(
      agentId,
      agent0Score,
      tag1,
      tag2,
      undefined, // endpoint
      feedbackFile
    );

    // Wait for transaction confirmation
    const { result: feedback } = await tx.waitConfirmed();

    logger.info(
      `Feedback submitted successfully for agent ${agentId}`,
      undefined,
      'Agent0Client [submitFeedback]'
    );

    return this.mapFeedbackToAgent0Feedback(feedback);
  }

  /**
   * Get a specific feedback record
   */
  async getFeedback(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number
  ): Promise<Agent0Feedback> {
    await this.ensureSDK();

    logger.info(
      `Getting feedback for agent ${agentId}, client ${clientAddress}, index ${feedbackIndex}`,
      undefined,
      'Agent0Client [getFeedback]'
    );

    const feedback = await this.sdk!.getFeedback(
      agentId as `${number}:${number}`,
      clientAddress as `0x${string}`,
      feedbackIndex
    );

    return this.mapFeedbackToAgent0Feedback(feedback);
  }

  /**
   * Search feedback for an agent
   */
  async searchFeedback(
    agentId: string,
    params?: Partial<Agent0FeedbackSearchParams>
  ): Promise<Agent0Feedback[]> {
    await this.ensureSDK();

    logger.info(
      `Searching feedback for agent ${agentId}`,
      { params },
      'Agent0Client [searchFeedback]'
    );

    const feedbackList = await this.sdk!.searchFeedback(
      agentId as `${number}:${number}`,
      params?.tags,
      params?.capabilities,
      params?.skills,
      params?.minScore,
      params?.maxScore
    );

    return feedbackList.map((f) => this.mapFeedbackToAgent0Feedback(f));
  }

  /**
   * Revoke previously submitted feedback
   */
  async revokeFeedback(
    agentId: string,
    feedbackIndex: number
  ): Promise<string> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Revoking feedback for agent ${agentId}, index ${feedbackIndex}`,
      undefined,
      'Agent0Client [revokeFeedback]'
    );

    const txHash = await this.sdk.revokeFeedback(
      agentId as `${number}:${number}`,
      feedbackIndex
    );

    logger.info(
      `Feedback revoked successfully for agent ${agentId}`,
      { txHash },
      'Agent0Client [revokeFeedback]'
    );

    return txHash;
  }

  /**
   * Append a response to existing feedback
   */
  async appendFeedbackResponse(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ): Promise<string> {
    await this.ensureSDK();

    if (!this.sdk || this.sdk.isReadOnly) {
      throw new Error('SDK not initialized with write access');
    }

    logger.info(
      `Appending response to feedback for agent ${agentId}`,
      { clientAddress, feedbackIndex },
      'Agent0Client [appendFeedbackResponse]'
    );

    const txHash = await this.sdk.appendResponse(
      agentId as `${number}:${number}`,
      clientAddress as `0x${string}`,
      feedbackIndex,
      { uri: responseUri, hash: responseHash }
    );

    logger.info(
      `Response appended successfully for agent ${agentId}`,
      { txHash },
      'Agent0Client [appendFeedbackResponse]'
    );

    return txHash;
  }

  /**
   * Get reputation summary statistics for an agent
   */
  async getReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary> {
    await this.ensureSDK();

    logger.info(
      `Getting reputation summary for agent ${agentId}`,
      { tag1, tag2 },
      'Agent0Client [getReputationSummary]'
    );

    const summary = await this.sdk!.getReputationSummary(
      agentId as `${number}:${number}`,
      tag1,
      tag2
    );

    return {
      count: summary.count,
      averageScore: summary.averageScore,
    };
  }

  // ===========================================================================
  // Status & Utilities
  // ===========================================================================

  /**
   * Checks if Agent0 SDK is available
   *
   * @returns True if SDK is initialized and not in read-only mode
   * @remarks Returns false if SDK hasn't been initialized yet. Call ensureSDK()
   * or any method that uses the SDK to initialize it first.
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

  /**
   * Get the current chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Format a token ID as a full agent ID
   */
  formatAgentId(tokenId: number): string {
    return `${this.chainId}:${tokenId}`;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

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

  private mapAgentSummaryToSearchResult(
    agent: AgentSummary
  ): Agent0SearchResult {
    const capabilities = this.parseCapabilities(
      agent.extras as Record<string, JsonValue> | undefined
    );
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
      chainId: agent.chainId,
      description: agent.description,
      image: agent.image,
      owners: agent.owners,
      operators: agent.operators,
      mcp: agent.mcp,
      a2a: agent.a2a,
      ens: agent.ens,
      did: agent.did,
      supportedTrusts: agent.supportedTrusts,
      a2aSkills: agent.a2aSkills,
      mcpTools: agent.mcpTools,
      mcpPrompts: agent.mcpPrompts,
      mcpResources: agent.mcpResources,
      active: agent.active,
      x402support: agent.x402support,
    };
  }

  private mapAgentSummaryToProfile(
    agent: AgentSummary,
    tokenId: number
  ): Agent0AgentProfile {
    const capabilities = this.parseCapabilities(
      agent.extras as Record<string, JsonValue> | undefined
    );
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
      description: agent.description,
      image: agent.image,
      chainId: agent.chainId,
      owners: agent.owners,
      operators: agent.operators,
      trustModels: agent.supportedTrusts,
      active: agent.active,
      x402support: agent.x402support,
      metadata: agent.extras,
    };
  }

  private mapFeedbackToAgent0Feedback(feedback: Feedback): Agent0Feedback {
    return {
      id: feedback.id,
      agentId: feedback.agentId,
      reviewer: feedback.reviewer,
      score: feedback.score,
      tags: feedback.tags,
      text: feedback.text,
      context: feedback.context,
      proofOfPayment: feedback.proofOfPayment,
      fileURI: feedback.fileURI,
      createdAt: feedback.createdAt,
      answers: feedback.answers,
      isRevoked: feedback.isRevoked,
      capability: feedback.capability,
      name: feedback.name,
      skill: feedback.skill,
      task: feedback.task,
    };
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

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetAgent0Client(): void {
  agent0ClientInstance = null;
}

/**
 * Agent0 Integration Type Definitions
 *
 * Comprehensive type-safe interfaces for Agent0 SDK integration.
 * Covers all SDK features: registration, search, feedback, reputation, and agent management.
 */

import type { AgentProfile } from '@babylon/a2a';
import type { AgentCapabilities } from '@babylon/shared';

// =============================================================================
// Search & Pagination Types
// =============================================================================

/**
 * Agent0 Search Filters
 * Maps to Agent0 SDK SearchParams interface with full parameter support
 */
export interface Agent0SearchFilters {
  // Basic filters
  name?: string;
  description?: string;

  // Babylon-specific filters (mapped to SDK params)
  skills?: string[]; // Maps to a2aSkills
  strategies?: string[]; // Maps to a2aSkills
  markets?: string[]; // Babylon market categories
  minReputation?: number; // For reputation-based filtering
  type?: string; // Agent type classification

  // SDK direct mappings
  active?: boolean;
  x402Support?: boolean;
  hasX402?: boolean; // Legacy, use x402Support instead

  /**
   * Chain IDs to search across (Agent0 SDK v0.31.0 multi-chain support)
   * - Array of chain IDs: [11155111, 84532, 80002] for ETH Sepolia, Base Sepolia, Polygon Amoy
   * - 'all': Search all configured chains
   * - undefined: Use SDK's default chain
   */
  chains?: number[] | 'all';

  // Owner & operator filters
  owners?: string[];
  operators?: string[];

  // Protocol capability filters
  mcp?: boolean;
  a2a?: boolean;

  // Identity filters
  ens?: string;
  did?: string;
  walletAddress?: string;

  // Trust model filters
  supportedTrust?: string[];

  // Capability-specific filters
  mcpTools?: string[];
  mcpPrompts?: string[];
  mcpResources?: string[];
  a2aSkills?: string[]; // Direct SDK mapping
}

/**
 * Pagination and sorting options for search operations
 */
export interface Agent0SearchOptions {
  /** Maximum number of results per page (default: 50) */
  pageSize?: number;
  /** Cursor for pagination (from previous response) */
  cursor?: string;
  /** Sort fields (e.g., ['name', '-createdAt']) */
  sort?: string[];
}

/**
 * Metadata about multi-chain search results
 */
export interface Agent0SearchResultMeta {
  /** All chains that were queried */
  chains: number[];
  /** Chains that returned results successfully */
  successfulChains: number[];
  /** Chains that failed to respond */
  failedChains: number[];
  /** Total number of results across all chains */
  totalResults: number;
  /** Timing information */
  timing: {
    totalMs: number;
    averagePerChainMs?: number;
  };
}

/**
 * Generic paginated search response
 */
export interface Agent0SearchResponse<T> {
  items: T[];
  nextCursor?: string;
  meta?: Agent0SearchResultMeta;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Agent0 Registration Parameters
 */
export interface Agent0RegistrationParams {
  name: string;
  description: string;
  imageUrl?: string;
  walletAddress: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  capabilities: AgentCapabilities;
}

/**
 * Agent0 Registration Result
 */
export interface Agent0RegistrationResult {
  tokenId: number;
  txHash: string;
  metadataCID?: string;
}

/**
 * Agent0 Search Result
 */
export interface Agent0SearchResult {
  tokenId: number;
  name: string;
  walletAddress: string;
  metadataCID: string;
  capabilities: AgentCapabilities;
  reputation: {
    trustScore: number;
    accuracyScore: number;
  };
  // Extended fields from SDK AgentSummary
  chainId?: number;
  description?: string;
  image?: string;
  owners?: string[];
  operators?: string[];
  mcp?: boolean;
  a2a?: boolean;
  ens?: string;
  did?: string;
  supportedTrusts?: string[];
  a2aSkills?: string[];
  mcpTools?: string[];
  mcpPrompts?: string[];
  mcpResources?: string[];
  active?: boolean;
  x402support?: boolean;
}

/**
 * Agent0 Agent Profile (detailed agent information)
 */
export interface Agent0AgentProfile {
  tokenId: number;
  name: string;
  walletAddress: string;
  metadataCID: string;
  capabilities: AgentCapabilities;
  reputation: {
    trustScore: number;
    accuracyScore: number;
  };
  // Extended profile fields
  description?: string;
  image?: string;
  chainId?: number;
  owners?: string[];
  operators?: string[];
  endpoints?: Agent0Endpoint[];
  trustModels?: string[];
  active?: boolean;
  x402support?: boolean;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
}

/**
 * Agent endpoint configuration
 */
export interface Agent0Endpoint {
  type: 'MCP' | 'A2A' | 'ENS' | 'DID' | 'wallet' | 'OASF';
  value: string;
  meta?: Record<string, unknown>;
}

/**
 * Parameters for updating an existing agent
 */
export interface Agent0AgentUpdateParams {
  name?: string;
  description?: string;
  image?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  skills?: string[];
  domains?: string[];
  active?: boolean;
  x402Support?: boolean;
  walletAddress?: string;
  walletChainId?: number;
  trustModels?: {
    reputation?: boolean;
    cryptoEconomic?: boolean;
    teeAttestation?: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Result of transferring agent ownership
 */
export interface Agent0TransferResult {
  txHash: string;
  from: string;
  to: string;
  agentId: string;
}

// =============================================================================
// Feedback & Reputation Types
// =============================================================================

/**
 * Agent0 Feedback Parameters (for submitting feedback)
 */
export interface Agent0FeedbackParams {
  targetAgentId: number;
  rating: number; // -5 to +5 (converted to 0-100 for SDK)
  comment: string;
  transactionId?: string; // Optional local transaction/feedback ID for tracking
  // Extended feedback parameters
  tags?: string[];
  capability?: string;
  skill?: string;
  task?: string;
  context?: Record<string, unknown>;
  proofOfPayment?: Record<string, unknown>;
}

/**
 * Feedback record from Agent0 network
 */
export interface Agent0Feedback {
  /** Feedback ID tuple: [agentId, clientAddress, feedbackIndex] */
  id: [string, string, number];
  agentId: string;
  reviewer: string;
  score?: number;
  tags: string[];
  text?: string;
  context?: Record<string, unknown>;
  proofOfPayment?: Record<string, unknown>;
  fileURI?: string;
  createdAt: number;
  answers: Array<Record<string, unknown>>;
  isRevoked: boolean;
  capability?: string;
  name?: string;
  skill?: string;
  task?: string;
}

/**
 * Parameters for searching feedback
 */
export interface Agent0FeedbackSearchParams {
  agents?: string[];
  tags?: string[];
  reviewers?: string[];
  capabilities?: string[];
  skills?: string[];
  tasks?: string[];
  names?: string[];
  minScore?: number;
  maxScore?: number;
  includeRevoked?: boolean;
}

/**
 * Reputation summary statistics
 */
export interface Agent0ReputationSummary {
  count: number;
  averageScore: number;
}

/**
 * Aggregated Reputation from Multiple Sources
 */
export interface AggregatedReputation {
  totalBets: number;
  winningBets: number;
  accuracyScore: number;
  trustScore: number;
  totalVolume: string;
  profitLoss: number;
  isBanned: boolean;
  sources: {
    local: number; // Trust score from ERC-8004
    agent0: number; // Trust score from Agent0 network
  };
}

// =============================================================================
// Client Interface
// =============================================================================

/**
 * Agent0 Client Interface
 * Comprehensive interface for Agent0 SDK integration with full feature support
 */
export interface IAgent0Client {
  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a new agent on the Agent0 network
   */
  registerAgent(
    params: Agent0RegistrationParams
  ): Promise<Agent0RegistrationResult>;

  /**
   * Register the Babylon game itself as an agent for cross-game discovery
   */
  registerBabylonGame(): Promise<Agent0RegistrationResult>;

  // ---------------------------------------------------------------------------
  // Search & Discovery
  // ---------------------------------------------------------------------------

  /**
   * Search for agents with filters and pagination
   */
  searchAgents(
    filters: Agent0SearchFilters,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResponse<Agent0SearchResult>>;

  /**
   * Search agents filtered by reputation scores
   */
  searchAgentsByReputation(
    params: Agent0FeedbackSearchParams,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResponse<Agent0SearchResult>>;

  /**
   * Get detailed agent profile by token ID
   */
  getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null>;

  // ---------------------------------------------------------------------------
  // Agent Management
  // ---------------------------------------------------------------------------

  /**
   * Load an existing agent for editing
   */
  loadAgent(agentId: string): Promise<Agent0AgentProfile | null>;

  /**
   * Update an existing agent's properties
   */
  updateAgent(
    agentId: string,
    params: Agent0AgentUpdateParams
  ): Promise<Agent0RegistrationResult>;

  /**
   * Transfer agent ownership to a new address
   */
  transferAgent(
    agentId: string,
    newOwner: string
  ): Promise<Agent0TransferResult>;

  /**
   * Check if an address owns the specified agent
   */
  isAgentOwner(agentId: string, address: string): Promise<boolean>;

  /**
   * Get the owner address of an agent
   */
  getAgentOwner(agentId: string): Promise<string>;

  // ---------------------------------------------------------------------------
  // Feedback & Reputation
  // ---------------------------------------------------------------------------

  /**
   * Submit feedback for an agent
   */
  submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback>;

  /**
   * Get a specific feedback record
   */
  getFeedback(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number
  ): Promise<Agent0Feedback>;

  /**
   * Search feedback for an agent
   */
  searchFeedback(
    agentId: string,
    params?: Partial<Agent0FeedbackSearchParams>
  ): Promise<Agent0Feedback[]>;

  /**
   * Revoke previously submitted feedback
   */
  revokeFeedback(agentId: string, feedbackIndex: number): Promise<string>;

  /**
   * Append a response to existing feedback
   */
  appendFeedbackResponse(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ): Promise<string>;

  /**
   * Get reputation summary statistics for an agent
   * @param tag1 Optional first tag filter
   * @param tag2 Optional second tag filter
   */
  getReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary>;

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /**
   * Check if the Agent0 SDK is available and initialized
   */
  isAvailable(): boolean;
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Agent Discovery Service Interface
 * Defines the methods available on AgentDiscoveryService
 */
export interface IAgentDiscoveryService {
  discoverAgents(
    filters: DiscoveryFilters,
    options?: Agent0SearchOptions
  ): Promise<Agent0SearchResponse<AgentProfile>>;
  getAgent(agentId: string): Promise<AgentProfile | null>;
}

/**
 * Discovery Filters for AgentDiscoveryService
 */
export interface DiscoveryFilters {
  strategies?: string[];
  markets?: string[];
  minReputation?: number;
  includeExternal?: boolean;
  // Extended filters
  skills?: string[];
  active?: boolean;
  x402Support?: boolean;
  chains?: number[] | 'all';
  mcp?: boolean;
  a2a?: boolean;
}

/**
 * Reputation Bridge Interface
 * Aggregates reputation from multiple sources
 */
export interface IReputationBridge {
  getAggregatedReputation(tokenId: number): Promise<AggregatedReputation>;
  getAgent0ReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary>;
}

// =============================================================================
// Feedback Service Interface
// =============================================================================

/**
 * Agent0 Feedback Service Interface
 * Handles feedback submission, retrieval, and management
 */
export interface IAgent0FeedbackService {
  submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback>;
  getFeedback(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number
  ): Promise<Agent0Feedback>;
  searchFeedback(
    agentId: string,
    params?: Partial<Agent0FeedbackSearchParams>
  ): Promise<Agent0Feedback[]>;
  revokeFeedback(agentId: string, feedbackIndex: number): Promise<string>;
  appendResponse(
    agentId: string,
    clientAddress: string,
    feedbackIndex: number,
    responseUri: string,
    responseHash: string
  ): Promise<string>;
  getReputationSummary(
    agentId: string,
    tag1?: string,
    tag2?: string
  ): Promise<Agent0ReputationSummary>;
}

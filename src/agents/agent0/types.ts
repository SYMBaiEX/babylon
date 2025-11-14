/**
 * Agent0 Integration Type Definitions
 * 
 * Type-safe interfaces for Agent0 SDK integration
 */

import type { AgentProfile, AgentCapabilities } from '@/types/a2a'

/**
 * Agent0 Client Interface
 * Defines the methods available on Agent0Client for external use
 */
export interface IAgent0Client {
  // Registration
  registerAgent(params: Agent0RegistrationParams): Promise<Agent0RegistrationResult>
  registerBabylonGame(): Promise<Agent0RegistrationResult>
  updateAgentMetadata(params: Agent0UpdateMetadataParams): Promise<void>

  // Search & Discovery
  searchAgents(filters: Agent0SearchFilters): Promise<Agent0PaginatedSearchResult>
  searchAgentsByReputation(params: Agent0ReputationSearchParams): Promise<Agent0ReputationSearchResult>
  getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null>

  // Feedback - Write Operations
  submitFeedback(params: Agent0FeedbackParams): Promise<Agent0Feedback>
  signFeedbackAuth(params: Agent0FeedbackAuthParams): Promise<string>
  appendFeedbackResponse(params: Agent0FeedbackResponseParams): Promise<string>
  revokeFeedback(params: Agent0RevokeFeedbackParams): Promise<string>

  // Feedback - Read Operations
  getFeedback(params: Agent0GetFeedbackParams): Promise<Agent0Feedback>
  searchFeedback(params: Agent0SearchFeedbackParams): Promise<Agent0Feedback[]>
  getReputationSummary(params: Agent0ReputationSummaryParams): Promise<Agent0ReputationSummary>

  // Agent Management
  loadAgent(tokenId: number): Promise<unknown>
  transferAgent(params: Agent0TransferParams): Promise<Agent0TransferResult>
  isAgentOwner(tokenId: number, address: string): Promise<boolean>
  getAgentOwner(tokenId: number): Promise<string>

  // OASF Methods (v0.31)
  addSkillToAgent(tokenId: number, skill: string, validateOASF?: boolean): Promise<void>
  addDomainToAgent(tokenId: number, domain: string, validateOASF?: boolean): Promise<void>
  removeSkillFromAgent(tokenId: number, skill: string): Promise<void>
  removeDomainFromAgent(tokenId: number, domain: string): Promise<void>

  // Operator Management (v0.31)
  addOperator(tokenId: number, operatorAddress: string): Promise<void>
  removeOperator(tokenId: number, operatorAddress: string): Promise<void>

  // Utility
  isAvailable(): boolean
  getDefaultChainId(): number
}

/**
 * Agent0 Update Metadata Parameters
 */
export interface Agent0UpdateMetadataParams {
  tokenId: number
  name?: string
  description?: string
  imageUrl?: string
  mcpEndpoint?: string
  a2aEndpoint?: string
  capabilities?: AgentCapabilities
  active?: boolean
}

/**
 * Unified Discovery Service Interface
 * Defines the methods available on UnifiedDiscoveryService
 */
export interface IUnifiedDiscoveryService {
  discoverAgents(filters: DiscoveryFilters): Promise<AgentProfile[]>
  getAgent(agentId: string): Promise<AgentProfile | null>
}

/**
 * Agent0 Registration Parameters
 */
export interface Agent0RegistrationParams {
  name: string
  description: string
  imageUrl?: string
  walletAddress: string
  mcpEndpoint?: string
  a2aEndpoint?: string
  ensName?: string  // ENS endpoint support
  didIdentifier?: string  // DID endpoint support
  capabilities: AgentCapabilities
  operators?: string[]  // Gap 17: Operator support
  trustModels?: string[]  // Gap 14: Trust model support

  // OASF (Open Agentic Schema Framework) v0.31
  oasfSkills?: string[]  // Standardized skill taxonomies
  oasfDomains?: string[]  // Standardized domain classifications
  validateOASF?: boolean  // Validate against OASF taxonomies
}

/**
 * Agent0 Registration Result
 */
export interface Agent0RegistrationResult {
  tokenId: number
  txHash: string
  metadataCID?: string
}

/**
 * Agent0 Search Filters
 */
export interface Agent0SearchFilters {
  // Basic filters
  name?: string
  description?: string
  strategies?: string[]
  markets?: string[]
  minReputation?: number
  x402Support?: boolean
  hasX402?: boolean // Legacy, use x402Support instead
  type?: string
  active?: boolean

  // Advanced filters (Agent0 SDK v0.31)
  chains?: number[] | 'all'  // Multi-chain support
  mcpTools?: string[]  // Filter by specific MCP tools
  mcpPrompts?: string[]  // Filter by MCP prompts
  mcpResources?: string[]  // Filter by MCP resources
  a2aSkills?: string[]  // Filter by A2A skills (same as strategies)
  supportedTrust?: string[]  // Filter by trust models
  owners?: string[]  // Filter by owner addresses
  walletAddress?: string  // Filter by wallet address
  mcp?: boolean  // Has MCP endpoint
  a2a?: boolean  // Has A2A endpoint
  ens?: string  // ENS name

  // Pagination
  pageSize?: number
  cursor?: string
}

/**
 * Agent0 Search Result
 */
export interface Agent0SearchResult {
  tokenId: number
  chainId?: number  // Multi-chain support
  name: string
  walletAddress: string
  metadataCID: string
  capabilities: AgentCapabilities
  reputation: {
    trustScore: number
    accuracyScore: number
  }
}

/**
 * Search Result Metadata (from Agent0 SDK)
 * Multi-chain search performance and status information
 */
export interface Agent0SearchResultMeta {
  chains: number[]
  successfulChains: number[]
  failedChains: number[]
  totalResults: number
  timing: {
    totalMs: number
    averagePerChainMs?: number
  }
}

/**
 * Agent0 Paginated Search Result
 */
export interface Agent0PaginatedSearchResult {
  items: Agent0SearchResult[]
  nextCursor?: string
  hasMore: boolean
  meta?: Agent0SearchResultMeta
}

/**
 * Agent0 Agent Profile
 */
export interface Agent0AgentProfile {
  tokenId: number
  name: string
  walletAddress: string
  metadataCID: string
  capabilities: AgentCapabilities
  reputation: {
    trustScore: number
    accuracyScore: number
  }
}

/**
 * Agent0 Feedback Parameters
 * Full SDK support for rich feedback categorization
 */
export interface Agent0FeedbackParams {
  targetAgentId: number
  rating: number  // -5 to +5, converted to 0-100 for SDK
  comment?: string  // Feedback text
  tags?: string[]  // Categorization tags (e.g., ['helpful', 'responsive'])
  capability?: string  // Which capability was evaluated
  name?: string  // Feedback name/title
  skill?: string  // Which skill was evaluated
  task?: string  // Which task was performed
  context?: Record<string, unknown>  // Additional context metadata
  proofOfPayment?: Record<string, unknown>  // Payment verification data
  transactionId?: string  // Optional local transaction/feedback ID for tracking
}

/**
 * Agent0 Feedback Result
 * Returned when reading feedback
 */
export interface Agent0Feedback {
  id: [string, string, number]  // [agentId, clientAddress, feedbackIndex]
  agentId: string
  reviewer: string
  score?: number
  tags: string[]
  text?: string
  context?: Record<string, unknown>
  proofOfPayment?: Record<string, unknown>
  fileURI?: string
  createdAt: number
  answers: Array<Record<string, unknown>>
  isRevoked: boolean
  capability?: string
  name?: string
  skill?: string
  task?: string
}

/**
 * Agent0 Reputation Summary
 */
export interface Agent0ReputationSummary {
  count: number
  averageScore: number
}

/**
 * Discovery Filters for UnifiedDiscoveryService
 */
export interface DiscoveryFilters {
  strategies?: string[]
  markets?: string[]
  minReputation?: number
  includeExternal?: boolean
}

/**
 * Aggregated Reputation from Multiple Sources
 */
export interface AggregatedReputation {
  totalBets: number
  winningBets: number
  accuracyScore: number
  trustScore: number
  totalVolume: string
  profitLoss: number
  isBanned: boolean
  sources: {
    local: number  // Trust score from ERC-8004
    agent0: number  // Trust score from Agent0 network
  }
}

/**
 * Reputation Bridge Interface
 * Aggregates reputation from multiple sources
 */
export interface IReputationBridge {
  getAggregatedReputation(tokenId: number): Promise<AggregatedReputation>
}

/**
 * Agent0 Feedback Auth Parameters
 */
export interface Agent0FeedbackAuthParams {
  targetAgentId: number
  clientAddress: string
  indexLimit?: number
  expiryHours?: number
}

/**
 * Agent0 Feedback Response Parameters
 */
export interface Agent0FeedbackResponseParams {
  targetAgentId: number
  clientAddress: string
  feedbackIndex: number
  response: {
    uri: string
    hash: string
  }
}

/**
 * Agent0 Revoke Feedback Parameters
 */
export interface Agent0RevokeFeedbackParams {
  targetAgentId: number
  feedbackIndex: number
}

/**
 * Agent0 Get Feedback Parameters
 */
export interface Agent0GetFeedbackParams {
  targetAgentId: number
  clientAddress: string
  feedbackIndex: number
}

/**
 * Agent0 Search Feedback Parameters
 */
export interface Agent0SearchFeedbackParams {
  targetAgentId: number
  tags?: string[]
  capabilities?: string[]
  skills?: string[]
  minScore?: number
  maxScore?: number
}

/**
 * Agent0 Reputation Summary Parameters
 */
export interface Agent0ReputationSummaryParams {
  targetAgentId: number
  tag1?: string
  tag2?: string
}

/**
 * Agent0 Transfer Parameters
 */
export interface Agent0TransferParams {
  tokenId: number
  newOwner: string
}

/**
 * Agent0 Transfer Result
 */
export interface Agent0TransferResult {
  txHash: string
  from: string
  to: string
  agentId: string
}

/**
 * Agent0 Reputation Search Parameters
 */
export interface Agent0ReputationSearchParams {
  agents?: number[]
  tags?: string[]
  reviewers?: string[]
  capabilities?: string[]
  skills?: string[]
  tasks?: string[]
  names?: string[]
  minAverageScore?: number
  includeRevoked?: boolean
  pageSize?: number
  cursor?: string
  sort?: string[]
}

/**
 * Agent0 Reputation Search Result
 */
export interface Agent0ReputationSearchResult {
  items: Agent0SearchResult[]
  nextCursor?: string
  meta?: Agent0SearchResultMeta
}


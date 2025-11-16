/**
 * Agent0 Integration Type Definitions
 * 
 * @module agents/agent0/types
 * 
 * @description
 * Comprehensive type definitions for Agent0 SDK integration throughout Babylon.
 * Defines interfaces for:
 * - Agent0Client operations (registration, search, feedback)
 * - Agent discovery and filtering
 * - Reputation aggregation from multiple sources
 * - Cross-system type compatibility
 * 
 * These types ensure type safety across Agent0 operations and provide
 * clear contracts for agent management, discovery, and reputation tracking.
 */

import type { AgentProfile, AgentCapabilities } from '@/types/a2a'

/**
 * Agent0 Client Interface
 * 
 * @interface IAgent0Client
 * 
 * @description
 * Defines the complete API surface for Agent0Client operations.
 * Provides methods for agent lifecycle management, search, and reputation.
 * 
 * @remarks
 * All methods fail fast on errors. Check `isAvailable()` or `ensureAvailable()`
 * before operations to verify SDK is properly initialized.
 */
export interface IAgent0Client {
  registerAgent(params: Agent0RegistrationParams): Promise<Agent0RegistrationResult>
  registerBabylonGame(): Promise<Agent0RegistrationResult>
  searchAgents(filters: Agent0SearchFilters): Promise<Agent0SearchResult[]>
  submitFeedback(params: Agent0FeedbackParams): Promise<void>
  getAgentProfile(tokenId: number): Promise<Agent0AgentProfile | null>
  isAvailable(): boolean
  // Optional methods for advanced features (can be added as needed)
  // updateAgentMetadata?(tokenId: number, metadata: Partial<Agent0RegistrationParams>): Promise<void>
  // revokeFeedback?(agentId: number, feedbackIndex: number): Promise<void>
  // appendResponse?(agentId: number, clientAddress: string, feedbackIndex: number, responseUri: string): Promise<void>
  // getReputationSummary?(agentId: number): Promise<{ count: number; averageScore: number }>
}

/**
 * Agent Discovery Service Interface
 * Defines the methods available on AgentDiscoveryService
 */
export interface IAgentDiscoveryService {
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
  capabilities: AgentCapabilities
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
  name?: string
  skills?: string[]  // A2A skills filter
  strategies?: string[]
  markets?: string[]
  minReputation?: number
  active?: boolean  // Filter by active status
  x402Support?: boolean
  hasX402?: boolean // Legacy, use x402Support instead
  type?: string
}

/**
 * Agent0 Search Result
 */
export interface Agent0SearchResult {
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
 */
export interface Agent0FeedbackParams {
  targetAgentId: number
  rating: number  // -5 to +5
  comment: string
  transactionId?: string  // Optional local transaction/feedback ID for tracking
}

/**
 * Discovery Filters for AgentDiscoveryService
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



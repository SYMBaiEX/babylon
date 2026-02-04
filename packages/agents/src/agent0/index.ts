/**
 * Agent0 Integration
 *
 * Provides integration with Agent0's on-chain reputation system, agent discovery,
 * feedback submission, and ERC-8004 compliance.
 *
 * @packageDocumentation
 */

export {
  getAgent0Client,
  resetAgent0Client,
  setContractAddressesProvider,
} from './Agent0Client';
// Agent Discovery
export {
  AgentDiscoveryService,
  getAgentDiscoveryService,
  resetAgentDiscoveryService,
} from './AgentDiscovery';
export {
  type BabylonRegistrationResult,
  registerBabylonGame,
} from './babylon-registry-init';
export {
  Agent0FeedbackService,
  getAgent0FeedbackService,
  type ReputationSummary,
  resetAgent0FeedbackService,
} from './feedback-service';
// Reputation Bridge
export { ReputationBridge } from './ReputationBridge';
// Reputation utilities
export * from './reputation';
// Resilience utilities
export * from './resilience';
// Subgraph Client
export { type SubgraphAgent, SubgraphClient } from './SubgraphClient';

// Comprehensive type exports
export type {
  // Agent types
  Agent0AgentProfile,
  Agent0AgentUpdateParams,
  Agent0Endpoint,
  // Feedback types
  Agent0Feedback,
  Agent0FeedbackParams,
  Agent0FeedbackSearchParams,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0ReputationSummary,
  // Search types
  Agent0SearchFilters,
  Agent0SearchOptions,
  Agent0SearchResponse,
  Agent0SearchResult,
  Agent0SearchResultMeta,
  Agent0TransferResult,
  // Reputation types
  AggregatedReputation,
  // Interface types
  DiscoveryFilters,
  IAgent0Client,
  IAgent0FeedbackService,
  IAgentDiscoveryService,
  IReputationBridge,
} from './types';

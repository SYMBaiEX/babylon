/**
 * Agent0 Integration
 *
 * Provides integration with Agent0's on-chain reputation system, agent discovery,
 * feedback submission, and ERC-8004 compliance.
 *
 * @packageDocumentation
 */

export { getAgent0Client, setContractAddressesProvider } from './Agent0Client';

export {
  type BabylonRegistrationResult,
  registerBabylonGame,
} from './babylon-registry-init';
export {
  Agent0FeedbackService,
  type FeedbackParams,
  getAgent0FeedbackService,
  type ReputationSummary,
} from './feedback-service';
// Reputation utilities
export * from './reputation';

// Resilience utilities
export * from './resilience';
// Subgraph Client
export { type SubgraphAgent, SubgraphClient } from './SubgraphClient';
export type {
  Agent0AgentProfile,
  Agent0FeedbackParams,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0SearchFilters,
  Agent0SearchResult,
  IAgent0Client,
} from './types';

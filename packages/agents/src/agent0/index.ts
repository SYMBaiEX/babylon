/**
 * Agent0 Integration
 *
 * Provides integration with Agent0's on-chain reputation system
 */

export {
  Agent0FeedbackService,
  type FeedbackParams,
  getAgent0FeedbackService,
  type ReputationSummary,
} from './feedback-service';

export {
  registerBabylonGame,
  type BabylonRegistrationResult,
} from './babylon-registry-init';

export { getAgent0Client, setContractAddressesProvider } from './Agent0Client';
export type {
  IAgent0Client,
  Agent0RegistrationParams,
  Agent0RegistrationResult,
  Agent0SearchFilters,
  Agent0SearchResult,
  Agent0AgentProfile,
  Agent0FeedbackParams,
} from './types';

// Resilience utilities
export * from './resilience';

// Reputation utilities
export * from './reputation';

// Subgraph Client
export { SubgraphClient, type SubgraphAgent } from './SubgraphClient';

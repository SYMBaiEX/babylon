/**
 * Agent0 Integration
 *
 * Direct SDK exports with minimal Babylon-specific utilities.
 * Uses Agent0's canonical Ethereum mainnet contracts for identity and reputation.
 *
 * @packageDocumentation
 */

// ============================================================================
// Direct SDK exports - no wrappers
// ============================================================================

export { SDK, Agent, FeedbackManager, SubgraphClient } from 'agent0-sdk';
export type {
  AgentSummary,
  Feedback,
  SDKConfig,
  RegistrationFile,
  SearchFilters,
  SearchOptions,
} from 'agent0-sdk';

// ============================================================================
// Babylon-specific utilities (minimal)
// ============================================================================

export {
  type BabylonRegistrationResult,
  registerBabylonGame,
} from './babylon-registry-init';

export { parseCapabilities } from './capabilities-schema';

// SDK instance management
export { setAgent0SDK, getAgent0SDK } from './sdk-instance';

// Reputation Bridge - aggregates reputation from multiple sources
export { ReputationBridge } from './ReputationBridge';

// Game Discovery
export { GameDiscovery } from './GameDiscovery';

// Reputation utilities
export * from './reputation';

// Resilience utilities
export * from './resilience';

// ============================================================================
// Type exports
// ============================================================================

export type * from './types';

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

export type {
  AgentSummary,
  Feedback,
  RegistrationFile,
  SDKConfig,
  SearchFilters,
  SearchOptions,
} from 'agent0-sdk';
export { Agent, FeedbackManager, SDK, SubgraphClient } from 'agent0-sdk';

// ============================================================================
// Babylon-specific utilities (minimal)
// ============================================================================

export {
  type BabylonRegistrationResult,
  registerBabylonGame,
} from './babylon-registry-init';

export { parseCapabilities } from './capabilities-schema';
// Game Discovery
export { GameDiscovery } from './GameDiscovery';

// Reputation Bridge - aggregates reputation from multiple sources
export { ReputationBridge } from './ReputationBridge';
// Reputation utilities
export * from './reputation';
// Resilience utilities
export * from './resilience';
// SDK instance management
export { getAgent0SDK, setAgent0SDK } from './sdk-instance';

// ============================================================================
// Type exports
// ============================================================================

export type * from './types';

/**
 * Smart Contract Type Definitions
 *
 * Complete interfaces for blockchain contract interactions
 */

/**
 * Contract method interfaces for Identity Registry
 */
export interface IdentityRegistryContract {
  getTokenId(address: string): Promise<bigint>;
  ownerOf(tokenId: number): Promise<string>;
  getAgentProfile(tokenId: number): Promise<AgentProfileResult>;
  isRegistered(address: string): Promise<boolean>;
  getAllActiveAgents(): Promise<bigint[]>;
  isEndpointActive(endpoint: string): Promise<boolean>;
  getAgentsByCapability(capabilityHash: string): Promise<bigint[]>;
}

/**
 * Contract method interfaces for Reputation System
 */
export interface ReputationSystemContract {
  getReputation(tokenId: number): Promise<ReputationResult>;
  getFeedbackCount(tokenId: number): Promise<bigint>;
  getFeedback(tokenId: number, index: number): Promise<FeedbackResult>;
  getAgentsByMinScore(minScore: number): Promise<bigint[]>;
}

/**
 * Agent profile result from contract call
 */
export interface AgentProfileResult {
  name: string;
  endpoint: string;
  capabilitiesHash: string;
  registeredAt: bigint;
  isActive: boolean;
  metadata: string;
}

/**
 * Reputation result tuple from contract call
 */
export type ReputationResult = [
  bigint, // totalBets
  bigint, // winningBets
  bigint, // totalVolume
  bigint, // profitLoss
  bigint, // accuracyScore
  bigint, // trustScore
  boolean, // isBanned
];

/**
 * Feedback result from contract call
 */
export interface FeedbackResult {
  from: string;
  rating: number; // int8 mapped to number
  comment: string;
  timestamp: bigint;
}

// ============================================================================
// Deployment Types
// ============================================================================

/**
 * Contract addresses in a deployment
 */
export interface DeploymentContracts {
  diamond: string;
  diamondCutFacet: string;
  diamondLoupeFacet: string;
  predictionMarketFacet: string;
  oracleFacet: string;
  liquidityPoolFacet: string;
  perpetualMarketFacet: string;
  referralSystemFacet: string;
  priceStorageFacet: string;
  identityRegistry: string;
  reputationSystem: string;
  babylonOracle?: string;
  predimarket?: string;
  marketFactory?: string;
  contestOracle?: string;
  banManager?: string;
  reportingSystem?: string;
  labelManager?: string;
  chainlinkOracle?: string;
  umaOracle?: string;
  testToken?: string;
}

/**
 * Deployment information
 */
export interface Deployment {
  network: string;
  chainId: number;
  contracts: DeploymentContracts;
  deployer: string;
  timestamp: string;
  blockNumber: number;
}

// ============================================================================
// Contract Event Types
// ============================================================================

/**
 * Agent registered event
 */
export interface AgentRegisteredEvent {
  tokenId: bigint;
  owner: string;
  name: string;
  endpoint: string;
}

/**
 * Reputation updated event
 */
export interface ReputationUpdatedEvent {
  tokenId: bigint;
  accuracyScore: bigint;
  trustScore: bigint;
}

/**
 * Feedback submitted event
 */
export interface FeedbackSubmittedEvent {
  tokenId: bigint;
  from: string;
  rating: number;
}


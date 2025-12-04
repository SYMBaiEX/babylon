/**
 * Experimental Package - Permissionless AI Game Demonstration
 *
 * Self-contained toy implementation of a decentralized AI game
 * running on simulated TEE infrastructure.
 */

// Smart contract simulation
export {
  type ContractEvent,
  type ContractEventType,
  type GameConfig as ContractGameConfig,
  type GameState as ContractGameState,
  type KeyRotationRequest,
  MockBlockchain,
  type SecurityCouncilState,
  type StakeInfo,
  type StakingState,
  type TransactionResult,
} from './contracts/index.js';
// Core crypto primitives
export * from './crypto/index.js';
// Game components
export {
  type AgentConfig,
  type AgentState,
  AIAgent,
  AITrainer,
  type GameConfig,
  GameEnvironment,
  type GameSession,
  type PatternType,
  type PredictionResult,
  type RoundResult,
  type TrainingConfig,
  type TrainingCycleResult,
  type TrainingSample,
} from './game/index.js';

// Storage simulation
export {
  IPFSSimulator,
  type StateCheckpoint,
  StateManager,
  type StateManagerConfig,
  type StorageStats,
  type StoredObject,
  type StoreOptions,
  type TrainingDataset,
  type VerificationResult as StorageVerificationResult,
} from './storage/index.js';
// TEE simulation
export {
  type AttestationQuote,
  type EnclaveConfig,
  type EnclaveState,
  formatQuoteForDisplay,
  generateQuote,
  type SealedData,
  type SignedMessage,
  type SignedTransaction,
  setExpectedMeasurement,
  TEEEnclave,
  TEEKeystore,
  TEEWallet,
  type VerificationResult as AttestationVerificationResult,
  verifyQuote,
} from './tee/index.js';

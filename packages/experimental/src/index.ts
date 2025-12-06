/**
 * Experimental Package - Permissionless AI Game
 *
 * A self-contained implementation of a decentralized AI game
 * with real cryptography and simulated TEE infrastructure.
 */

// Contracts
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

// Cryptography (real, not simulated)
export * from './crypto/index.js';

// Game
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
// Orchestrator
export {
  GameOrchestrator,
  type GameState,
  type OrchestratorConfig,
  type OrchestratorPhase,
} from './orchestrator/index.js';
// Protocol (PBTS-aligned)
export {
  type AggregatedReceipts,
  aggregateReceipts,
  type Commitment,
  // Commit-Reveal
  CommitRevealManager,
  createReceipt,
  type DHTAnnouncement,
  // DHT Fallback (PBTS Section 4.3)
  DHTFallbackManager,
  MockOnChainRegistry,
  type OnChainRegistry,
  type PeerInfo,
  // Peer Attestation (PBTS Section 4.2)
  ReceiptManager,
  type Reveal,
  type TransferReceipt,
  type VerificationReport,
  VerifierClient,
  verifyReceipt,
} from './protocol/index.js';
// Storage (real implementations available)
export {
  ArweaveStorage,
  DecentralizedStorage,
  FileStorage,
  RealStateManager,
  type StateCheckpoint,
  type Storage,
  type StorageStats,
  type TrainingDataset,
  type UploadOptions,
  type UploadResult,
} from './storage/index.js';
// TEE (simulated - use ProductionTEEEnclave for real TEE)
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

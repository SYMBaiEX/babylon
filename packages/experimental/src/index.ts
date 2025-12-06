/**
 * Experimental Package - 100% PERMISSIONLESS AI Game
 *
 * NO API KEYS. NO LOGINS. WALLET SIGNATURE ONLY.
 *
 * All production code uses:
 * - Arweave for permanent storage (wallet-signed)
 * - AES-256-GCM for encryption (Web Crypto API)
 * - secp256k1 for signatures (Ethereum-compatible)
 * - Marlin Oyster for TEE (wallet + USDC on Arbitrum)
 *
 * @see src/automated-demo.ts - Run the full demo
 * @see src/permissionless-audit.ts - Verify everything is permissionless
 */

// ============================================================================
// PRODUCTION EXPORTS (100% PERMISSIONLESS)
// ============================================================================

// Contract types
export type {
  ContractEvent,
  ContractSystem,
  GameConfig as ContractGameConfig,
  GameEvent,
  GameState as ContractGameState,
  GovernanceState,
  KeyRotationRequest,
  SecurityCouncilState,
  StakeInfo,
  StakingState,
} from './contracts/index.js';

// Cryptography (real, Web Crypto API)
export * from './crypto/index.js';

// Game logic
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

// Infrastructure (real blockchain clients)
export {
  AttestationClient,
  BlockchainClient,
  type BlockchainConfig,
  type BootstrapConfig,
  type BootstrappedGame,
  bootstrap,
  type ChainId,
  DStackClient,
  ENSDeployer,
  ENSRegistrar,
  type GameStatus,
  generateBabylonWorkerCode,
  MARLIN_CLI_COMMANDS,
  MARLIN_CONTRACTS,
  type MarlinDeployResult,
  type MarlinJobResult,
  MarlinOysterClient,
  type MarlinSubscriptionResult,
  OnChainAttestationClient,
  type OperatorInfo,
  ProductionTEEEnclave,
  printDeploymentInstructions,
  type RegistrationResult,
} from './infra/index.js';

// Protocol (PBTS-aligned)
export {
  type AggregatedReceipts,
  aggregateReceipts,
  type Commitment,
  CommitRevealManager,
  createReceipt,
  type DHTAnnouncement,
  DHTFallbackManager,
  type PeerInfo,
  ReceiptManager,
  type Reveal,
  type TransferReceipt,
  type VerificationReport,
  VerifierClient,
  verifyReceipt,
} from './protocol/index.js';

// Storage (100% permissionless - wallet signatures only)
export {
  ArweaveStorage,
  type ArweaveStorageConfig,
  createArweaveOnlyStorage,
  createDecentralizedStorage,
  createDevnetStorage,
  createHybridStorage,
  createLocalIPFSStorage,
  createMainnetStorage,
  createPermissionlessStorage,
  DecentralizedStorage,
  type DecentralizedStorageConfig,
  FileStorage,
  type FileStorageConfig,
  PermissionlessStorage,
  type PermissionlessStorageConfig,
  type StateCheckpoint,
  StateManager,
  type StateManagerConfig,
  type Storage,
  type StorageStats,
  type TrainingDataset,
  type UploadOptions,
  type UploadResult,
} from './storage/index.js';

// TEE (simulated locally, real via Marlin Oyster)
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

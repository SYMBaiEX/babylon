/**
 * Storage Module
 *
 * Production storage: ArweaveStorage, DecentralizedStorage, FileStorage
 * Legacy (tests only): IPFSSimulator, StateManager
 */

// Production storage implementations
export {
  ArweaveStorage,
  type ArweaveStorageConfig,
  createDevnetStorage,
  createMainnetStorage,
} from './arweave-storage.js';
export {
  createArweaveStorage as createDecentralizedArweaveStorage,
  createDecentralizedStorage,
  createIPFSStorage,
  DecentralizedStorage,
  type DecentralizedStorageConfig,
  type DownloadResult,
  type GatewayHealth,
  type StorageLocation,
} from './decentralized-storage.js';
export {
  FileStorage,
  type FileStorageConfig,
} from './file-storage.js';
// Legacy (for tests only - do not use in new code)
export {
  IPFSSimulator,
  type StoredObject,
  type StoreOptions,
  type VerificationResult,
} from './ipfs-simulator.js';

// Production state manager
export {
  RealStateManager,
  type RealStateManagerConfig,
  type StateCheckpoint,
  type TrainingDataset,
} from './real-state-manager.js';
export { StateManager, type StateManagerConfig } from './state-manager.js';
// Core interface
export type {
  Storage,
  StorageStats,
  UploadOptions,
  UploadResult,
} from './storage-interface.js';

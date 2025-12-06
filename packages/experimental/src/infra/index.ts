/**
 * Infrastructure Module
 *
 * Real blockchain, storage, and TEE integration for production deployment.
 */

export {
  type ArweaveConfig,
  PermissionlessStorage,
  type UploadResult as ArweaveUploadResult,
} from './arweave-client.js';
export {
  BlockchainClient,
  type BlockchainConfig,
  type ChainId,
  type GameState,
  type OperatorInfo,
} from './blockchain-client.js';
export {
  type BootstrapConfig,
  type BootstrappedGame,
  bootstrap,
  type GameStatus,
} from './bootstrap.js';
export {
  DStackClient,
  ProductionTEEEnclave,
} from './dstack-integration.js';

export {
  createIPFSClient,
  IPFSClient,
  type IPFSConfig,
  type UploadResult as IPFSUploadResult,
} from './ipfs-client.js';

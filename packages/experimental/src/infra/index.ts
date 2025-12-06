/**
 * Infrastructure Module
 *
 * Real blockchain and TEE integration for production deployment.
 */

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
  type DeploymentResult,
  decodeIPFSContenthash,
  type ENSConfig,
  ENSDeployer,
  encodeIPFSContenthash,
} from './ens-deployer.js';

export {
  encodeArweaveContenthash,
  encodeIPFSContenthash as encodeENSIPFSContenthash,
  ENSRegistrar,
  type RegistrationResult,
} from './ens-registrar.js';

export {
  checkGatewayHealth,
  retrieveFromArweave,
  retrieveFromIPFS,
  runFullStorageTest,
  uploadToIPFS,
} from './real-storage-test.js';

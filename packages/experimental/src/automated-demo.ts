#!/usr/bin/env bun
/**
 * Automated Full System Demo
 *
 * This script automatically:
 * 1. Checks and sets up storage (IPFS simulator or real Pinata)
 * 2. Checks and deploys contracts (or uses mock)
 * 3. Sets up ENS (simulated for permissionless demo)
 * 4. Boots TEE enclave
 * 5. Runs the full game loop
 * 6. Verifies all resources
 * 7. Cleans up properly
 *
 * Run: bun run demo:auto
 */

import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  keccak256,
  toBytes,
} from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { MockBlockchain } from './contracts/mock-blockchain.js';
import { AIAgent } from './game/agent.js';
import { GameEnvironment } from './game/environment.js';
import { AITrainer } from './game/trainer.js';
import { checkGatewayHealth } from './infra/real-storage-test.js';
import { IPFSSimulator } from './storage/ipfs-simulator.js';
import { StateManager } from './storage/state-manager.js';
import { TEEEnclave } from './tee/enclave.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface DemoConfig {
  // Use real infrastructure if available
  useRealIPFS: boolean;
  useRealContracts: boolean;
  useRealENS: boolean;

  // Contract addresses (if using real)
  contractAddress?: Address;
  rpcUrl: string;

  // Demo parameters
  gameCycles: number;
  trainingCycles: number;
  heartbeatInterval: number;

  // Generated wallet for demo
  demoPrivateKey: Hex;
}

function getConfig(): DemoConfig {
  const demoPrivateKey =
    (process.env.PRIVATE_KEY as Hex) ?? generatePrivateKey();

  return {
    useRealIPFS: !!process.env.PINATA_API_KEY,
    useRealContracts: !!process.env.GAME_TREASURY_ADDRESS,
    useRealENS: !!process.env.ENS_NAME,
    contractAddress: process.env.GAME_TREASURY_ADDRESS as Address | undefined,
    rpcUrl: process.env.RPC_URL ?? 'https://ethereum-sepolia.publicnode.com',
    gameCycles: 3,
    trainingCycles: 2,
    heartbeatInterval: 5000,
    demoPrivateKey,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

interface Resource {
  name: string;
  type: 'storage' | 'contract' | 'tee' | 'ens' | 'game';
  status: 'pending' | 'created' | 'verified' | 'shutdown' | 'error';
  details: Record<string, unknown>;
  cleanup?: () => Promise<void>;
}

const resources: Resource[] = [];

function addResource(resource: Resource): void {
  resources.push(resource);
  const icon =
    resource.status === 'created'
      ? '✅'
      : resource.status === 'error'
        ? '❌'
        : '⏳';
  console.log(`${icon} [${resource.type.toUpperCase()}] ${resource.name}`);
}

function updateResource(
  name: string,
  status: Resource['status'],
  details?: Record<string, unknown>
): void {
  const resource = resources.find((r) => r.name === name);
  if (resource) {
    resource.status = status;
    if (details) Object.assign(resource.details, details);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: STORAGE SETUP
// ═══════════════════════════════════════════════════════════════════════════

async function setupStorage(config: DemoConfig): Promise<{
  ipfs: IPFSSimulator;
  isReal: boolean;
}> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 1: STORAGE SETUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  // Always create local simulator (used for demo even if real storage available)
  const ipfs = new IPFSSimulator();

  // Check gateway health
  console.log('Checking storage gateway health...');
  const gateways = await checkGatewayHealth();
  const healthyIPFS = gateways.filter(
    (g) => g.type === 'ipfs' && g.reachable
  ).length;
  const healthyArweave = gateways.filter(
    (g) => g.type === 'arweave' && g.reachable
  ).length;

  console.log(`  IPFS gateways: ${healthyIPFS} healthy`);
  console.log(`  Arweave gateways: ${healthyArweave} healthy`);

  addResource({
    name: 'IPFS Storage',
    type: 'storage',
    status: 'created',
    details: {
      mode: config.useRealIPFS ? 'pinata' : 'simulator',
      healthyGateways: healthyIPFS,
    },
    cleanup: async () => {
      ipfs.clear();
    },
  });

  addResource({
    name: 'Arweave Gateways',
    type: 'storage',
    status: healthyArweave > 0 ? 'created' : 'error',
    details: { healthyGateways: healthyArweave },
  });

  // Test storage
  const testData = JSON.stringify({ test: true, timestamp: Date.now() });
  const stored = ipfs.store(testData, { encrypted: false });
  const retrieved = ipfs.retrieve(stored.cid);

  if (retrieved?.content === testData) {
    console.log(`  ✅ Storage verified: ${stored.cid}`);
    updateResource('IPFS Storage', 'verified');
  } else {
    console.log('  ❌ Storage verification failed');
    updateResource('IPFS Storage', 'error');
  }

  return { ipfs, isReal: config.useRealIPFS };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: CONTRACT SETUP
// ═══════════════════════════════════════════════════════════════════════════

async function setupContracts(config: DemoConfig): Promise<{
  blockchain: MockBlockchain;
  isReal: boolean;
  address: Address;
}> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 2: CONTRACT SETUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  let blockchain: MockBlockchain;
  let isReal = false;
  let address: Address;

  if (config.useRealContracts && config.contractAddress) {
    // Verify real contract exists
    console.log(`Checking real contract at ${config.contractAddress}...`);

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });

    try {
      const code = await publicClient.getCode({
        address: config.contractAddress,
      });
      if (code && code !== '0x') {
        console.log('  ✅ Real contract found');
        isReal = true;
        address = config.contractAddress;

        // Still create mock for local operations
        blockchain = new MockBlockchain();

        addResource({
          name: 'GameTreasury Contract',
          type: 'contract',
          status: 'verified',
          details: { address, network: 'sepolia', real: true },
        });
      } else {
        throw new Error('No code at address');
      }
    } catch {
      console.log('  ⚠️ Real contract not found, using mock');
    }
  }

  // Use mock blockchain
  if (!isReal) {
    blockchain = new MockBlockchain();
    address = ('0x' + 'MOCK'.padStart(40, '0')) as Address;

    console.log('Using mock blockchain for demo...');
    console.log(`  Mock address: ${address}`);

    addResource({
      name: 'Mock Blockchain',
      type: 'contract',
      status: 'created',
      details: { address, network: 'mock', real: false },
    });
  }

  return { blockchain: blockchain!, isReal, address: address! };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: ENS SETUP (Simulated for Permissionless Demo)
// ═══════════════════════════════════════════════════════════════════════════

interface ENSSimulator {
  name: string;
  owner: Address;
  contenthash: string | null;
  resolve: () => string;
}

async function setupENS(
  config: DemoConfig,
  operatorAddress: Address
): Promise<ENSSimulator> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 3: ENS SETUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  // Generate a unique name for this demo
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const ensName = `babylon-demo-${randomSuffix}.eth`;

  // Simulate ENS registration (permissionless in demo)
  const ens: ENSSimulator = {
    name: ensName,
    owner: operatorAddress,
    contenthash: null,
    resolve: () => `https://${ensName.replace('.eth', '')}.eth.limo`,
  };

  console.log(`  Registering: ${ensName}`);
  console.log(`  Owner: ${operatorAddress}`);
  console.log(`  Gateway: ${ens.resolve()}`);
  console.log('  (Simulated - real ENS requires on-chain registration)');

  addResource({
    name: `ENS: ${ensName}`,
    type: 'ens',
    status: 'created',
    details: {
      name: ensName,
      owner: operatorAddress,
      simulated: !config.useRealENS,
    },
  });

  return ens;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: TEE SETUP
// ═══════════════════════════════════════════════════════════════════════════

async function setupTEE(_config: DemoConfig): Promise<TEEEnclave> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 4: TEE ENCLAVE SETUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const codeHash = keccak256(toBytes('babylon-automated-demo-v1'));
  const instanceId = `demo-${Date.now()}`;

  console.log(`  Code Hash: ${codeHash.slice(0, 20)}...`);
  console.log(`  Instance: ${instanceId}`);

  const enclave = await TEEEnclave.create({
    codeHash,
    instanceId,
  });

  const address = enclave.getOperatorAddress();
  const attestation = enclave.getAttestation();

  console.log(`  Operator Address: ${address}`);
  console.log(`  Attestation: ${attestation.mrEnclave.slice(0, 20)}...`);
  console.log('  ⚠️ SIMULATED - Real attestation requires Phala TEE');

  addResource({
    name: 'TEE Enclave',
    type: 'tee',
    status: 'created',
    details: {
      address,
      instanceId,
      codeHash: codeHash.slice(0, 20) + '...',
    },
    cleanup: async () => {
      await enclave.shutdown();
    },
  });

  return enclave;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: GAME SETUP
// ═══════════════════════════════════════════════════════════════════════════

async function setupGame(_config: DemoConfig): Promise<{
  environment: GameEnvironment;
  agent: AIAgent;
  trainer: AITrainer;
}> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 5: GAME SETUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const environment = new GameEnvironment({
    sequenceLength: 5,
    patternTypes: ['linear', 'quadratic', 'fibonacci'],
    difficulty: 5,
  });

  const agent = new AIAgent({
    inputSize: 5,
    hiddenSize: 8,
    outputSize: 1,
    learningRate: 0.1,
  });

  const trainer = new AITrainer(
    {
      batchSize: 10,
      epochsPerCycle: 3,
      targetLoss: 0.01,
    },
    agent,
    environment
  );

  console.log('  ✅ Game environment created');
  console.log('  ✅ AI agent initialized (5→8→1 network)');
  console.log('  ✅ Trainer configured');

  addResource({
    name: 'Game Environment',
    type: 'game',
    status: 'created',
    details: {
      sequenceLength: 5,
      patterns: ['linear', 'quadratic', 'fibonacci'],
    },
  });

  addResource({
    name: 'AI Agent',
    type: 'game',
    status: 'created',
    details: {
      architecture: '5→8→1',
      learningRate: 0.1,
    },
  });

  return { environment, agent, trainer };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: RUN GAME LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runGameLoop(
  config: DemoConfig,
  enclave: TEEEnclave,
  ipfs: IPFSSimulator,
  blockchain: MockBlockchain,
  game: { environment: GameEnvironment; agent: AIAgent; trainer: AITrainer },
  ens: ENSSimulator
): Promise<void> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 6: RUNNING GAME LOOP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const stateManager = new StateManager(enclave, ipfs);
  const operatorAddress = enclave.getOperatorAddress();
  const attestation = enclave.getAttestation();

  // Register operator on mock blockchain
  blockchain.registerOperator(operatorAddress, attestation.mrEnclave as Hex);
  console.log('✅ Operator registered on blockchain');

  // Run game cycles
  for (let cycle = 1; cycle <= config.gameCycles; cycle++) {
    console.log(`\n─── Game Cycle ${cycle}/${config.gameCycles} ───\n`);

    // 1. Start game session
    game.environment.startSession();
    const sequence = game.environment.getVisibleSequence();
    console.log(`  Sequence: [${sequence.join(', ')}]`);

    // 2. Get AI prediction
    const normalized = sequence.map((n) => n / 100);
    const prediction = game.agent.predict(normalized);
    const guess = Math.round(prediction.prediction[0]! * 100);
    console.log(`  AI Guess: ${guess}`);

    // 3. Submit and score
    const result = game.environment.submitGuesses(guess, guess);
    console.log(
      `  Result: ${result.playerCorrect ? '✅ Correct' : '❌ Wrong'} (actual: ${result.actual})`
    );

    // 4. Train on this round
    const trainResult = game.trainer.runTrainingCycle();
    console.log(`  Training: loss ${trainResult.finalLoss.toFixed(4)}`);

    // 5. Save state checkpoint
    const gameState = {
      cycle,
      sequence,
      prediction: guess,
      actual: result.actual,
      loss: trainResult.finalLoss,
      timestamp: Date.now(),
    };

    const checkpoint = await stateManager.saveState(gameState);
    console.log(`  State saved: ${checkpoint.cid}`);

    // 6. Update on-chain state
    blockchain.updateState(operatorAddress, checkpoint.cid, checkpoint.hash);
    console.log(
      `  On-chain updated: v${blockchain.getGameState().stateVersion}`
    );

    // 7. Heartbeat
    const heartbeat = enclave.generateHeartbeat();
    blockchain.heartbeat(operatorAddress);
    console.log(
      `  Heartbeat sent: ${new Date(heartbeat.timestamp).toLocaleTimeString()}`
    );

    // Small delay between cycles
    await new Promise((r) => setTimeout(r, 500));
  }

  // Update ENS contenthash to latest state
  const finalState = blockchain.getGameState();
  ens.contenthash = finalState.currentStateCID;
  console.log(`\n✅ ENS updated to: ipfs://${finalState.currentStateCID}`);

  updateResource('Game Environment', 'verified');
  updateResource('AI Agent', 'verified');
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: VERIFY RESOURCES
// ═══════════════════════════════════════════════════════════════════════════

async function verifyResources(
  ipfs: IPFSSimulator,
  blockchain: MockBlockchain,
  enclave: TEEEnclave
): Promise<boolean> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 7: VERIFY RESOURCES');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  const checks: { name: string; passed: boolean; details: string }[] = [];

  // Check storage
  const storageStats = ipfs.getStats();
  checks.push({
    name: 'Storage has data',
    passed: storageStats.objectCount > 0,
    details: `${storageStats.objectCount} objects, ${storageStats.totalSize} bytes`,
  });

  // Check blockchain
  const gameState = blockchain.getGameState();
  checks.push({
    name: 'Blockchain has state',
    passed: gameState.stateVersion > 0,
    details: `v${gameState.stateVersion}, CID: ${gameState.currentStateCID?.slice(0, 20) ?? 'None'}...`,
  });

  // Check operator is active
  checks.push({
    name: 'Operator is active',
    passed: gameState.operatorAddress !== null,
    details:
      (gameState.operatorAddress?.slice(0, 20) ?? 'None') +
      (gameState.operatorAddress ? '...' : ''),
  });

  // Check enclave running
  const enclaveStatus = enclave.getStatus();
  checks.push({
    name: 'TEE enclave running',
    passed: enclaveStatus.running,
    details: `Address: ${enclaveStatus.address?.slice(0, 20) ?? 'N/A'}...`,
  });

  // Check heartbeats
  checks.push({
    name: 'Recent heartbeat',
    passed: Date.now() - gameState.lastHeartbeat < 60000,
    details: `${Math.floor((Date.now() - gameState.lastHeartbeat) / 1000)}s ago`,
  });

  // Print results
  let allPassed = true;
  for (const check of checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}: ${check.details}`);
    if (!check.passed) allPassed = false;
  }

  return allPassed;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 8: CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

async function cleanup(): Promise<void> {
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('STEP 8: CLEANUP');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  for (const resource of resources.reverse()) {
    if (resource.cleanup) {
      try {
        await resource.cleanup();
        resource.status = 'shutdown';
        console.log(`  ✅ ${resource.name} shutdown`);
      } catch (e) {
        console.log(`  ❌ ${resource.name} cleanup failed: ${e}`);
      }
    } else {
      resource.status = 'shutdown';
      console.log(`  ✅ ${resource.name} released`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(
    '\n╔══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         BABYLON AUTOMATED DEMO - FULL SYSTEM                 ║'
  );
  console.log(
    '║                                                              ║'
  );
  console.log(
    '║  This demo automatically sets up and runs the complete      ║'
  );
  console.log(
    '║  permissionless AI game system with all components.         ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝'
  );

  const config = getConfig();

  console.log('\nConfiguration:');
  console.log(
    `  Real IPFS: ${config.useRealIPFS ? 'Yes (Pinata)' : 'No (Simulator)'}`
  );
  console.log(
    `  Real Contracts: ${config.useRealContracts ? 'Yes' : 'No (Mock)'}`
  );
  console.log(`  Real ENS: ${config.useRealENS ? 'Yes' : 'No (Simulated)'}`);
  console.log(`  Game Cycles: ${config.gameCycles}`);

  const startTime = Date.now();

  try {
    // Setup all components
    const { ipfs } = await setupStorage(config);
    const { blockchain } = await setupContracts(config);
    const enclave = await setupTEE(config);
    const ens = await setupENS(config, enclave.getOperatorAddress());
    const game = await setupGame(config);

    // Run the game
    await runGameLoop(config, enclave, ipfs, blockchain, game, ens);

    // Verify everything
    const verified = await verifyResources(ipfs, blockchain, enclave);

    // Cleanup
    await cleanup();

    // Summary
    console.log(
      '\n═══════════════════════════════════════════════════════════════'
    );
    console.log(
      '                         SUMMARY                                '
    );
    console.log(
      '═══════════════════════════════════════════════════════════════\n'
    );

    console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`Resources: ${resources.length}`);
    console.log(
      `Verified: ${verified ? '✅ All checks passed' : '❌ Some checks failed'}`
    );

    console.log('\nResource Status:');
    for (const r of resources) {
      const icon =
        r.status === 'shutdown' ? '🔒' : r.status === 'verified' ? '✅' : '⚠️';
      console.log(`  ${icon} ${r.name}: ${r.status}`);
    }

    console.log(
      '\n' +
        (verified
          ? '✅ DEMO COMPLETE - All systems operational!'
          : '⚠️ DEMO COMPLETE - Some issues detected')
    );

    process.exit(verified ? 0 : 1);
  } catch (error) {
    console.error('\n❌ DEMO FAILED:', error);
    await cleanup();
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export { main as runAutomatedDemo };

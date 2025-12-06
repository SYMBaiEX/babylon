/**
 * Smoke Test Script
 *
 * Verifies all infrastructure is correctly deployed and connected.
 * Run this, verify everything works, then shut down to minimize costs.
 *
 * Usage:
 *   PRIVATE_KEY=0x... CONTRACT_ADDRESS=0x... RPC_URL=... bun run src/infra/smoke-test.ts
 */

import type { Address, Hex } from 'viem';
import { formatEther, keccak256, toBytes, toHex } from 'viem';
import { AIAgent } from '../game/agent.js';
import { GameEnvironment } from '../game/environment.js';
import { AITrainer } from '../game/trainer.js';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';
import { StateManager } from '../storage/state-manager.js';
import { TEEEnclave } from '../tee/enclave.js';
import { BlockchainClient } from './blockchain-client.js';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function pass(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function fail(msg: string, error?: unknown) {
  console.log(`${RED}✗${RESET} ${msg}`);
  if (error) console.log(`  ${RED}${error}${RESET}`);
}

function info(msg: string) {
  console.log(`${CYAN}ℹ${RESET} ${msg}`);
}

function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

function header(msg: string) {
  console.log(`\n${BOLD}${CYAN}═══ ${msg} ═══${RESET}\n`);
}

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    pass(`${name} (${duration}ms)`);
    return { name, passed: true, duration };
  } catch (e) {
    const duration = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    fail(`${name} (${duration}ms)`, error);
    return { name, passed: false, duration, error };
  }
}

async function main() {
  console.log(`
${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗
║           PERMISSIONLESS AI GAME - SMOKE TEST            ║
╚══════════════════════════════════════════════════════════╝${RESET}
`);

  const privateKey = process.env.PRIVATE_KEY as Hex;
  const contractAddress = process.env.CONTRACT_ADDRESS as Address;
  const rpcUrl = process.env.RPC_URL ?? 'https://rpc.sepolia.org';
  const chainId = (process.env.CHAIN_ID ?? 'sepolia') as
    | 'sepolia'
    | 'localhost';

  // Validate env
  if (!privateKey) {
    fail('PRIVATE_KEY not set');
    process.exit(1);
  }
  if (!contractAddress) {
    fail('CONTRACT_ADDRESS not set');
    process.exit(1);
  }

  info(`Chain: ${chainId}`);
  info(`RPC: ${rpcUrl}`);
  info(`Contract: ${contractAddress}`);

  const results: TestResult[] = [];

  // =========================================================================
  // Test 1: Blockchain Connection
  // =========================================================================
  header('1. BLOCKCHAIN CONNECTION');

  const blockchain = new BlockchainClient({
    chainId,
    rpcUrl,
    contractAddress,
    privateKey,
  });

  results.push(
    await runTest('Connect to blockchain', async () => {
      const balance = await blockchain.getBalance();
      info(`  Contract balance: ${formatEther(balance)} ETH`);
    })
  );

  results.push(
    await runTest('Read game state', async () => {
      const state = await blockchain.getGameState();
      info(`  State version: ${state.version}`);
      info(`  Key version: ${state.keyVersion}`);
      info(`  Operator active: ${state.operatorActive}`);
    })
  );

  results.push(
    await runTest('Read operator info', async () => {
      const op = await blockchain.getOperatorInfo();
      info(`  Current operator: ${op.address}`);
      info(`  Active: ${op.active}`);
    })
  );

  // =========================================================================
  // Test 2: TEE Enclave (Simulated)
  // =========================================================================
  header('2. TEE ENCLAVE');

  let enclave: TEEEnclave;

  results.push(
    await runTest('Boot TEE enclave', async () => {
      enclave = await TEEEnclave.create({
        codeHash: keccak256(toBytes('smoke-test-v1')) as Hex,
        instanceId: 'smoke-test-enclave',
      });
      info(`  Enclave address: ${enclave.getOperatorAddress()}`);
    })
  );

  results.push(
    await runTest('Generate attestation', async () => {
      const attestation = enclave!.getAttestation();
      info(`  Code hash: ${attestation.mrEnclave.slice(0, 20)}...`);
      info(`  CPU signature: ${attestation.cpuSignature.slice(0, 20)}...`);
    })
  );

  results.push(
    await runTest('Encrypt/decrypt state', async () => {
      const testState = { secret: 'data', count: 42 };
      const { cid, hash } = await enclave!.encryptState(testState);
      info(`  State encrypted, CID: ${cid.slice(0, 20)}...`);
      info(`  Hash: ${hash.slice(0, 20)}...`);
      // State is internally stored, can be rotated later
    })
  );

  // =========================================================================
  // Test 3: Storage (Simulated IPFS)
  // =========================================================================
  header('3. STORAGE');

  const ipfs = new IPFSSimulator();
  const stateManager = new StateManager(enclave!, ipfs);

  results.push(
    await runTest('Save encrypted state', async () => {
      const checkpoint = await stateManager.saveState({
        test: true,
        ts: Date.now(),
      });
      info(`  CID: ${checkpoint.cid}`);
      info(`  Version: ${checkpoint.version}`);
    })
  );

  results.push(
    await runTest('Load encrypted state', async () => {
      const latest = stateManager.getLatestCheckpoint();
      if (!latest) throw new Error('No checkpoint found');
      const state = await stateManager.loadState(latest.cid);
      info(`  Loaded state with ${Object.keys(state as object).length} keys`);
    })
  );

  results.push(
    await runTest('Key rotation', async () => {
      const rotated = await stateManager.rotateKey();
      info(`  New key version: ${rotated.keyVersion}`);
    })
  );

  // =========================================================================
  // Test 4: Game Components
  // =========================================================================
  header('4. GAME COMPONENTS');

  const agent = new AIAgent({
    inputSize: 5,
    hiddenSize: 8,
    outputSize: 1,
    learningRate: 0.1,
  });

  const environment = new GameEnvironment({
    sequenceLength: 5,
    patternTypes: ['linear', 'quadratic', 'fibonacci'],
    difficulty: 5,
  });

  const trainer = new AITrainer(
    { batchSize: 20, epochsPerCycle: 3, targetLoss: 0.01 },
    agent,
    environment
  );

  results.push(
    await runTest('AI prediction', async () => {
      const result = agent.predict([0.1, 0.2, 0.3, 0.4, 0.5]);
      info(`  Prediction: ${result.prediction[0]?.toFixed(4)}`);
      info(`  Confidence: ${result.confidence.toFixed(4)}`);
    })
  );

  results.push(
    await runTest('Training cycle', async () => {
      const result = trainer.runTrainingCycle();
      info(`  Initial loss: ${result.initialLoss.toFixed(4)}`);
      info(`  Final loss: ${result.finalLoss.toFixed(4)}`);
      info(`  Samples: ${result.samplesProcessed}`);
    })
  );

  // =========================================================================
  // Test 5: On-Chain Operations (if we're the operator)
  // =========================================================================
  header('5. ON-CHAIN OPERATIONS');

  const operatorInfo = await blockchain.getOperatorInfo();
  const walletAddress = blockchain.getAddress();

  if (operatorInfo.address === walletAddress || !operatorInfo.active) {
    // We can try to become operator or already are
    if (!operatorInfo.active) {
      results.push(
        await runTest('Register as operator', async () => {
          const attestation = enclave!.getAttestation();
          const attestationHex = toHex(
            new TextEncoder().encode(JSON.stringify(attestation))
          );
          await blockchain.registerOperator(
            enclave!.getOperatorAddress(),
            attestationHex
          );
          info(`  Registered: ${enclave!.getOperatorAddress()}`);
        })
      );
    }

    results.push(
      await runTest('Send heartbeat', async () => {
        await blockchain.heartbeat();
        const state = await blockchain.getGameState();
        info(
          `  Last heartbeat: ${new Date(Number(state.lastHeartbeat) * 1000).toISOString()}`
        );
      })
    );

    results.push(
      await runTest('Update state on-chain', async () => {
        const checkpoint = stateManager.getLatestCheckpoint();
        if (!checkpoint) throw new Error('No checkpoint');
        await blockchain.updateState(checkpoint.cid, checkpoint.hash);
        info(`  State updated to version ${checkpoint.version}`);
      })
    );

    results.push(
      await runTest('Record training', async () => {
        const dataset = stateManager.saveTrainingData(
          [{ input: [1], target: [2], timestamp: Date.now() }],
          '0x1234' as Hex,
          '0x5678' as Hex
        );
        await blockchain.recordTraining(dataset.cid, '0x5678' as Hex);
        info(`  Training recorded, dataset: ${dataset.cid}`);
      })
    );
  } else {
    warn(`Another operator is active: ${operatorInfo.address}`);
    warn('Skipping on-chain write tests');
  }

  // =========================================================================
  // Cleanup
  // =========================================================================
  header('CLEANUP');

  await enclave!.shutdown();
  pass('TEE enclave shut down');

  // =========================================================================
  // Summary
  // =========================================================================
  header('SUMMARY');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`
${BOLD}Results:${RESET}
  ${GREEN}Passed: ${passed}${RESET}
  ${failed > 0 ? RED : ''}Failed: ${failed}${RESET}
  Total time: ${totalTime}ms
`);

  if (failed > 0) {
    console.log(`${RED}${BOLD}SMOKE TEST FAILED${RESET}`);
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${RED}✗${RESET} ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}SMOKE TEST PASSED${RESET}`);
  console.log(`
${CYAN}${BOLD}Next Steps:${RESET}
1. If on testnet: You're ready to deploy to Phala TEE
2. If on Phala: Run the full bootstrap script
3. Remember to shut down resources when done!

${YELLOW}${BOLD}To shut down Phala resources:${RESET}
  phala stop --deployment-id YOUR_DEPLOYMENT_ID
  Or use the Phala Cloud dashboard: https://cloud.phala.network
`);
}

main().catch((e) => {
  console.error(`${RED}Smoke test failed:${RESET}`, e);
  process.exit(1);
});

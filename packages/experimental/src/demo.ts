/**
 * Permissionless AI Game Demo
 *
 * This script demonstrates all components of the system working together:
 * 1. TEE boot and attestation
 * 2. Smart contract deployment and operator registration
 * 3. Encrypted state storage
 * 4. Game play
 * 5. AI training loops
 * 6. Key rotation by security council
 * 7. Operator failover
 *
 * Run with: bun run src/demo.ts
 */

import { type Address, keccak256, toBytes } from 'viem';
import {
  GameOrchestrator,
  type OrchestratorConfig,
} from './orchestrator/orchestrator.js';

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function header(text: string) {
  console.log(
    '\n' + colors.cyan + colors.bright + '═'.repeat(60) + colors.reset
  );
  console.log(colors.cyan + colors.bright + `  ${text}` + colors.reset);
  console.log(colors.cyan + colors.bright + '═'.repeat(60) + colors.reset);
}

function section(text: string) {
  console.log('\n' + colors.yellow + '▶ ' + text + colors.reset);
}

function success(text: string) {
  console.log(colors.green + '  ✓ ' + text + colors.reset);
}

function info(text: string) {
  console.log(colors.dim + '  ' + text + colors.reset);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  header('PERMISSIONLESS AI GAME - TOY DEMONSTRATION');

  console.log(`
${colors.dim}This demo shows all components of a permissionless AI game:
- TEE Enclave: Secure execution environment (simulated Intel TDX + NVIDIA H200)
- Smart Contracts: On-chain coordination for funds, state, and governance
- IPFS Storage: Decentralized storage for encrypted state and public training data
- AI Agent: Simple neural network that learns pattern prediction
- Security Council: Multi-sig key rotation capability${colors.reset}
`);

  // Configuration
  const config: OrchestratorConfig = {
    enclave: {
      codeHash: keccak256(toBytes('babylon-ai-game-v1.0.0')),
      instanceId: 'primary-game-enclave',
    },
    agent: {
      inputSize: 5, // 5 numbers in sequence
      hiddenSize: 8,
      outputSize: 1, // Predict next number
      learningRate: 0.1,
    },
    game: {
      sequenceLength: 5,
      patternTypes: ['linear', 'quadratic', 'fibonacci'],
      difficulty: 5,
    },
    training: {
      batchSize: 50,
      epochsPerCycle: 10,
      targetLoss: 0.01,
    },
    councilMembers: [
      '0x1111111111111111111111111111111111111111' as Address,
      '0x2222222222222222222222222222222222222222' as Address,
      '0x3333333333333333333333333333333333333333' as Address,
      '0x4444444444444444444444444444444444444444' as Address,
      '0x5555555555555555555555555555555555555555' as Address,
    ],
    initialFunding: 10000n * 10n ** 18n, // 10,000 tokens
  };

  // Create orchestrator
  const orchestrator = new GameOrchestrator(config);

  // ============================================================================
  // PHASE 1: System Initialization
  // ============================================================================
  header('PHASE 1: SYSTEM INITIALIZATION');

  section('Initializing complete system...');
  const { operatorAddress, attestation } = await orchestrator.initialize();

  success(`TEE Operator registered: ${operatorAddress}`);
  success(
    `Attestation valid - code hash: ${attestation.mrEnclave.slice(0, 20)}...`
  );

  let status = orchestrator.getStatus();
  info(`Treasury balance: ${status.blockchain.treasury} tokens`);
  info(`Enclave running: ${status.enclave.running}`);

  await sleep(1000);

  // ============================================================================
  // PHASE 2: Game Play
  // ============================================================================
  header('PHASE 2: PLAYING GAME ROUNDS');

  section('Playing 5 game rounds (human vs AI)...');

  for (let i = 0; i < 5; i++) {
    const patternTypes = ['linear', 'quadratic', 'fibonacci'] as const;
    const pattern = patternTypes[i % 3];
    const { sequence, result } = orchestrator.playRound(pattern);

    console.log(
      `\n  ${colors.blue}Round ${i + 1} (${pattern}):${colors.reset}`
    );
    console.log(`    Sequence: [${sequence.join(', ')}] → ?`);
    console.log(
      `    Actual: ${result.actual}, ` +
        `Player: ${result.playerGuess}${result.playerCorrect ? colors.green + ' ✓' : colors.dim + ' ✗'}${colors.reset}, ` +
        `Agent: ${result.agentGuess}${result.agentCorrect ? colors.green + ' ✓' : colors.dim + ' ✗'}${colors.reset}`
    );
  }

  status = orchestrator.getStatus();
  info(
    `\nTotal sessions: ${status.game.totalSessions}, Agent win rate: ${(status.game.agentWinRate * 100).toFixed(1)}%`
  );

  await sleep(1000);

  // ============================================================================
  // PHASE 3: AI Training
  // ============================================================================
  header('PHASE 3: AI TRAINING CYCLE');

  section('Running training cycle (simulates daily training loop)...');

  const trainingResult = await orchestrator.runTrainingCycle();

  success(`Training cycle ${trainingResult.cycleNumber} complete`);
  success(`Loss improved by: ${trainingResult.lossImprovement.toFixed(4)}`);
  success(`Training data published to IPFS: ${trainingResult.datasetCID}`);

  status = orchestrator.getStatus();
  info(`Current model loss: ${status.training.currentLoss.toFixed(4)}`);
  info(`Storage checkpoints: ${status.storage.checkpoints}`);
  info(`Training datasets: ${status.storage.trainingDatasets}`);

  await sleep(1000);

  // Play more rounds to see if agent improved
  section('Playing 3 more rounds after training...');

  for (let i = 0; i < 3; i++) {
    const { sequence, result } = orchestrator.playRound('linear');
    console.log(
      `\n  ${colors.blue}Round ${i + 6}:${colors.reset} [${sequence.join(', ')}] → ` +
        `Actual: ${result.actual}, Agent: ${result.agentGuess}${result.agentCorrect ? colors.green + ' ✓' : colors.dim + ' ✗'}${colors.reset}`
    );
  }

  await sleep(1000);

  // ============================================================================
  // PHASE 4: Key Rotation
  // ============================================================================
  header('PHASE 4: SECURITY COUNCIL KEY ROTATION');

  section('Security council initiating key rotation...');
  info('Requires 3 of 5 council member approvals');

  const rotationApprovers = config.councilMembers
    .slice(0, 3)
    .filter((m): m is Address => !!m);
  const rotationResult = await orchestrator.rotateKeys(rotationApprovers);

  success(`New key version: ${rotationResult.newKeyVersion}`);
  success(`State re-encrypted with new key: ${rotationResult.newStateCID}`);
  info('Old key has been securely wiped from TEE memory');

  await sleep(1000);

  // ============================================================================
  // PHASE 5: Run another training cycle
  // ============================================================================
  header('PHASE 5: SECOND TRAINING CYCLE');

  section('Running another training cycle with new encryption key...');

  const trainingResult2 = await orchestrator.runTrainingCycle();

  success(`Training cycle ${trainingResult2.cycleNumber} complete`);
  success(`Loss improved by: ${trainingResult2.lossImprovement.toFixed(4)}`);
  success(`Training data CID: ${trainingResult2.datasetCID}`);

  await sleep(1000);

  // ============================================================================
  // PHASE 6: Final Status
  // ============================================================================
  header('PHASE 6: FINAL SYSTEM STATUS');

  status = orchestrator.getStatus();

  console.log(`
${colors.bright}Blockchain:${colors.reset}
  Block number: ${status.blockchain.blockNumber}
  Treasury: ${status.blockchain.treasury} tokens
  Operator active: ${status.blockchain.operatorActive}

${colors.bright}TEE Enclave:${colors.reset}
  Running: ${status.enclave.running}
  Address: ${status.enclave.address}
  Attestation valid: ${status.enclave.attestationValid}

${colors.bright}Game Statistics:${colors.reset}
  Total sessions: ${status.game.totalSessions}
  Agent win rate: ${(status.game.agentWinRate * 100).toFixed(1)}%

${colors.bright}Training:${colors.reset}
  Total cycles: ${status.training.totalCycles}
  Current loss: ${status.training.currentLoss.toFixed(4)}

${colors.bright}Storage:${colors.reset}
  State checkpoints: ${status.storage.checkpoints}
  Training datasets: ${status.storage.trainingDatasets}
  Total storage: ${status.storage.totalBytes} bytes
`);

  // ============================================================================
  // PHASE 7: Blockchain Events
  // ============================================================================
  header('PHASE 7: BLOCKCHAIN EVENT LOG');

  const events = orchestrator.getEvents();
  console.log(`\n${colors.dim}Recent on-chain events:${colors.reset}`);
  for (const event of events.slice(-10)) {
    console.log(`  [${event.contract}] ${event.type}`);
  }

  // ============================================================================
  // PHASE 8: Storage Contents
  // ============================================================================
  header('PHASE 8: DECENTRALIZED STORAGE CONTENTS');

  const storageObjects = orchestrator.getStorageObjects();
  console.log(`\n${colors.dim}IPFS objects stored:${colors.reset}`);
  for (const obj of storageObjects) {
    console.log(
      `  ${obj.cid.slice(0, 20)}... (${obj.size} bytes, ${obj.encrypted ? 'encrypted' : 'public'})`
    );
  }

  // Shutdown
  await orchestrator.shutdown();

  header('DEMO COMPLETE');

  console.log(`
${colors.green}${colors.bright}All components demonstrated successfully:${colors.reset}

  ✓ TEE boot and remote attestation (simulated Intel TDX + NVIDIA H200)
  ✓ Smart contract deployment and operator registration
  ✓ Encrypted state storage on IPFS
  ✓ AI game play (pattern prediction)
  ✓ AI training loop with public dataset publication
  ✓ Security council key rotation (3-of-5 multi-sig)

${colors.dim}This toy demonstration shows how a permissionless AI game could run
on Phala Network's TEE infrastructure with full decentralization.${colors.reset}
`);
}

// Run the demo
runDemo().catch(console.error);

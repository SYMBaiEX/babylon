/**
 * Integration Tests
 *
 * End-to-end tests of the full system.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type Address, keccak256, toBytes } from 'viem';
import { MockBlockchain } from '../contracts/mock-blockchain.js';
import { AIAgent } from '../game/agent.js';
import { GameEnvironment } from '../game/environment.js';
import { AITrainer } from '../game/trainer.js';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';
import { StateManager } from '../storage/state-manager.js';
import { TEEEnclave } from '../tee/enclave.js';

describe('TEE + Storage Integration', () => {
  let enclave: TEEEnclave;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('integration-test')) as `0x${string}`,
      instanceId: 'integration-1',
    });
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should save and load encrypted state', async () => {
    const gameState = {
      players: ['alice', 'bob'],
      scores: { alice: 100, bob: 50 },
      round: 5,
    };

    const checkpoint = await stateManager.saveState(gameState);

    expect(checkpoint.cid).toBeDefined();
    expect(checkpoint.version).toBe(1);

    // Load it back
    const loaded = await stateManager.loadState(checkpoint.cid);
    expect(loaded).toEqual(gameState);
  });

  it('should handle key rotation with state', async () => {
    const initialState = { secret: 'data', version: 1 };
    await stateManager.saveState(initialState);

    // Rotate key
    const rotatedCheckpoint = await stateManager.rotateKey();
    expect(rotatedCheckpoint.keyVersion).toBe(2);

    // Save new state with rotated key
    const newState = { secret: 'data', version: 2 };
    const newCheckpoint = await stateManager.saveState(newState);

    expect(newCheckpoint.keyVersion).toBe(2);
  });

  it('should store training data publicly', () => {
    const trainingData = [
      { input: [1, 2, 3], output: 6 },
      { input: [4, 5, 6], output: 15 },
    ];

    const dataset = stateManager.saveTrainingData(
      trainingData,
      '0xbefore' as `0x${string}`,
      '0xafter' as `0x${string}`
    );

    expect(dataset.epoch).toBe(1);
    expect(dataset.sampleCount).toBe(2);

    // Should be retrievable
    const loaded = stateManager.loadTrainingData(dataset.cid);
    expect(loaded.samples).toEqual(trainingData);
  });
});

describe('TEE + Blockchain Integration', () => {
  let enclave: TEEEnclave;
  let blockchain: MockBlockchain;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('blockchain-test')) as `0x${string}`,
      instanceId: 'blockchain-1',
    });
    blockchain = new MockBlockchain();
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should register enclave as operator', () => {
    const operatorAddress = enclave.getOperatorAddress();
    const attestation = enclave.getAttestation();

    const result = blockchain.registerOperator(
      operatorAddress,
      attestation.cpuSignature
    );

    expect(result.success).toBe(true);

    const state = blockchain.getGameState();
    expect(state.operatorAddress).toBe(operatorAddress);
  });

  it('should update state on-chain from enclave', async () => {
    const operatorAddress = enclave.getOperatorAddress();
    blockchain.registerOperator(
      operatorAddress,
      enclave.getAttestation().cpuSignature
    );

    // Encrypt some state
    const { cid, hash } = await enclave.encryptState({ game: 'data' });

    // Update on-chain
    const result = blockchain.updateState(operatorAddress, cid, hash);

    expect(result.success).toBe(true);

    const gameState = blockchain.getGameState();
    expect(gameState.currentStateCID).toBe(cid);
    expect(gameState.stateHash).toBe(hash);
  });

  it('should handle heartbeats', () => {
    const operatorAddress = enclave.getOperatorAddress();
    blockchain.registerOperator(
      operatorAddress,
      enclave.getAttestation().cpuSignature
    );

    const heartbeat = enclave.generateHeartbeat();
    expect(heartbeat.signature).toBeDefined();

    const result = blockchain.heartbeat(operatorAddress);
    expect(result.success).toBe(true);
  });
});

describe('Full Game Flow Integration', () => {
  let enclave: TEEEnclave;
  let blockchain: MockBlockchain;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;
  let agent: AIAgent;
  let environment: GameEnvironment;
  let trainer: AITrainer;

  beforeEach(async () => {
    // Setup infrastructure
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('full-game-test')) as `0x${string}`,
      instanceId: 'game-1',
    });
    blockchain = new MockBlockchain();
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);

    // Setup game components
    agent = new AIAgent({
      inputSize: 5,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.1,
    });

    environment = new GameEnvironment({
      sequenceLength: 5,
      patternTypes: ['linear', 'quadratic'],
      difficulty: 5,
    });

    trainer = new AITrainer(
      { batchSize: 20, epochsPerCycle: 5, targetLoss: 0.01 },
      agent,
      environment
    );

    // Register operator
    blockchain.registerOperator(
      enclave.getOperatorAddress(),
      enclave.getAttestation().cpuSignature
    );
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should complete full game cycle', async () => {
    // 1. Play some games
    for (let i = 0; i < 3; i++) {
      environment.startSession();
      const sequence = environment.getVisibleSequence();
      const input = environment.getAgentInput();
      const prediction = agent.predict(input);

      const max = Math.max(...sequence, 1);
      const agentGuess = Math.round((prediction.prediction[0] ?? 0) * max);
      const playerGuess = Math.round(Math.random() * max);

      environment.submitGuesses(playerGuess, agentGuess);
    }

    const stats = environment.getStats();
    expect(stats.totalSessions).toBe(3);

    // 2. Run training
    const trainingResult = trainer.runTrainingCycle();
    expect(trainingResult.cycleNumber).toBe(1);
    expect(trainingResult.samples.length).toBeGreaterThan(0);

    // 3. Save training data to IPFS
    const dataset = stateManager.saveTrainingData(
      trainingResult.samples,
      trainingResult.modelHashBefore,
      trainingResult.modelHashAfter
    );
    expect(dataset.cid).toBeDefined();

    // 4. Record training on-chain
    const operatorAddress = enclave.getOperatorAddress();
    const trainResult = blockchain.recordTraining(
      operatorAddress,
      dataset.cid,
      trainingResult.modelHashAfter
    );
    expect(trainResult.success).toBe(true);

    // 5. Save encrypted state
    const gameState = {
      agent: agent.serialize(),
      gameStats: environment.getStats(),
      trainingStats: trainer.getStats(),
    };

    const checkpoint = await stateManager.saveState(gameState);
    expect(checkpoint.cid).toBeDefined();

    // 6. Update on-chain state
    const updateResult = blockchain.updateState(
      operatorAddress,
      checkpoint.cid,
      checkpoint.hash
    );
    expect(updateResult.success).toBe(true);

    // 7. Verify everything is in sync
    const onChainState = blockchain.getGameState();
    expect(onChainState.currentStateCID).toBe(checkpoint.cid);

    const storageStats = stateManager.getStats();
    expect(storageStats.checkpoints).toBe(1);
    expect(storageStats.trainingDatasets).toBe(1);
  });

  it('should handle key rotation in game flow', async () => {
    // Save initial state
    await stateManager.saveState({ initial: true });

    // Request and approve key rotation
    const councilMembers = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ] as Address[];

    for (const member of councilMembers) {
      blockchain.addCouncilMember(member);
    }

    const { requestId } = blockchain.requestKeyRotation(councilMembers[0]!);
    blockchain.approveKeyRotation(councilMembers[1]!, requestId!);
    blockchain.approveKeyRotation(councilMembers[2]!, requestId!);

    // Perform rotation
    const rotatedCheckpoint = await stateManager.rotateKey();
    expect(rotatedCheckpoint.keyVersion).toBe(2);

    // Verify council state
    const councilState = blockchain.getSecurityCouncilState();
    expect(councilState.currentKeyVersion).toBe(2);
  });

  it('should handle operator failover', async () => {
    // Save state with original enclave
    const originalState = { version: 1, data: 'original' };
    const checkpoint = await stateManager.saveState(originalState);
    const originalAddress = enclave.getOperatorAddress();

    // Simulate timeout and mark inactive
    const config = blockchain.getGameConfig();
    const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
    for (let i = 0; i < blocksToSkip; i++) {
      blockchain.mineBlock();
    }
    blockchain.markOperatorInactive();

    // Create recovery enclave with SAME code hash (required for key derivation)
    // but different instance ID (different physical machine)
    const recoveryEnclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('full-game-test')) as `0x${string}`,
      instanceId: 'game-1', // Same instance ID = same keys (simulates key migration)
    });

    // Register new operator
    blockchain.registerOperator(
      recoveryEnclave.getOperatorAddress(),
      recoveryEnclave.getAttestation().cpuSignature
    );

    // Load state into new enclave
    const recoveryIpfs = new IPFSSimulator();
    // Copy data from original IPFS
    for (const obj of ipfs.list()) {
      recoveryIpfs.store(obj.content, {
        encrypted: obj.encrypted,
        metadata: obj.metadata,
      });
    }

    const recoveryStateManager = new StateManager(
      recoveryEnclave,
      recoveryIpfs
    );
    const loadedState = await recoveryStateManager.loadState(checkpoint.cid);

    expect(loadedState).toEqual(originalState);

    // Same measurement + instance = same address (key continuity)
    expect(recoveryEnclave.getOperatorAddress()).toBe(originalAddress);

    await recoveryEnclave.shutdown();
  });
});

describe('Security Properties', () => {
  it('should not leak plaintext to IPFS', async () => {
    const enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('security-test')) as `0x${string}`,
      instanceId: 'security-1',
    });
    const ipfs = new IPFSSimulator();
    const stateManager = new StateManager(enclave, ipfs);

    const secretData = {
      password: 'super_secret_password',
      apiKey: 'sk-1234567890',
    };

    await stateManager.saveState(secretData);

    // Check IPFS content
    const storedObjects = ipfs.list();
    for (const obj of storedObjects) {
      // Content should be JSON with encrypted payload
      expect(obj.content).not.toContain('super_secret_password');
      expect(obj.content).not.toContain('sk-1234567890');

      // Should contain encrypted payload structure
      const parsed = JSON.parse(obj.content);
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload.ciphertext).toBeDefined();
      expect(parsed.payload.iv).toBeDefined();
    }

    await enclave.shutdown();
  });

  it('should produce different ciphertext for same plaintext', async () => {
    const enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('randomness-test')) as `0x${string}`,
      instanceId: 'randomness-1',
    });
    const ipfs = new IPFSSimulator();
    const stateManager = new StateManager(enclave, ipfs);

    const data = { value: 'same' };

    await stateManager.saveState(data);
    const first = ipfs.list()[0];

    // Clear and save again
    ipfs.clear();
    await stateManager.saveState(data);
    const second = ipfs.list()[0];

    // Ciphertext should be different due to random IV
    expect(first?.content).not.toBe(second?.content);

    await enclave.shutdown();
  });
});

/**
 * Integration Tests
 *
 * End-to-end tests verifying the full system:
 * - TEE + Storage integration
 * - TEE + Blockchain integration
 * - Full game flow (play → train → checkpoint → on-chain)
 * - Security properties (no plaintext leaks, unique ciphertext)
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

  it('saves and loads encrypted state', async () => {
    const gameState = {
      players: ['alice', 'bob'],
      scores: { alice: 100, bob: 50 },
      round: 5,
    };

    const checkpoint = await stateManager.saveState(gameState);
    expect(checkpoint.cid).toBeDefined();
    expect(checkpoint.version).toBe(1);

    const loaded = await stateManager.loadState(checkpoint.cid);
    expect(loaded).toEqual(gameState);
  });

  it('handles key rotation with state', async () => {
    await stateManager.saveState({ secret: 'data', version: 1 });
    const rotated = await stateManager.rotateKey();

    expect(rotated.keyVersion).toBe(2);

    const newCheckpoint = await stateManager.saveState({
      secret: 'data',
      version: 2,
    });
    expect(newCheckpoint.keyVersion).toBe(2);
  });

  it('stores training data publicly (not encrypted)', () => {
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

  it('registers enclave as operator', () => {
    const operatorAddress = enclave.getOperatorAddress();
    const attestation = enclave.getAttestation();

    const result = blockchain.registerOperator(
      operatorAddress,
      attestation.cpuSignature
    );
    expect(result.success).toBe(true);
    expect(blockchain.getGameState().operatorAddress).toBe(operatorAddress);
  });

  it('updates state on-chain from enclave', async () => {
    const operatorAddress = enclave.getOperatorAddress();
    blockchain.registerOperator(
      operatorAddress,
      enclave.getAttestation().cpuSignature
    );

    const { cid, hash } = await enclave.encryptState({ game: 'data' });
    const result = blockchain.updateState(operatorAddress, cid, hash);

    expect(result.success).toBe(true);

    const gameState = blockchain.getGameState();
    expect(gameState.currentStateCID).toBe(cid);
    expect(gameState.stateHash).toBe(hash);
  });

  it('generates valid heartbeats', () => {
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

describe('Full Game Flow', () => {
  let enclave: TEEEnclave;
  let blockchain: MockBlockchain;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;
  let agent: AIAgent;
  let environment: GameEnvironment;
  let trainer: AITrainer;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('full-game-test')) as `0x${string}`,
      instanceId: 'game-1',
    });
    blockchain = new MockBlockchain();
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);

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

    blockchain.registerOperator(
      enclave.getOperatorAddress(),
      enclave.getAttestation().cpuSignature
    );
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('completes full game cycle: play → train → checkpoint → on-chain', async () => {
    // 1. Play games
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

    expect(environment.getStats().totalSessions).toBe(3);

    // 2. Train
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

    // 7. Verify everything in sync
    expect(blockchain.getGameState().currentStateCID).toBe(checkpoint.cid);

    const storageStats = stateManager.getStats();
    expect(storageStats.checkpoints).toBe(1);
    expect(storageStats.trainingDatasets).toBe(1);
  });

  it('handles key rotation in game flow', async () => {
    await stateManager.saveState({ initial: true });

    // Setup security council
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

    const rotatedCheckpoint = await stateManager.rotateKey();
    expect(rotatedCheckpoint.keyVersion).toBe(2);
    expect(blockchain.getSecurityCouncilState().currentKeyVersion).toBe(2);
  });

  it('handles operator failover', async () => {
    const originalState = { version: 1, data: 'original' };
    const checkpoint = await stateManager.saveState(originalState);
    const originalAddress = enclave.getOperatorAddress();

    // Simulate timeout
    const config = blockchain.getGameConfig();
    const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
    for (let i = 0; i < blocksToSkip; i++) {
      blockchain.mineBlock();
    }
    blockchain.markOperatorInactive();

    // Create recovery enclave (same code hash + instance ID = same keys)
    const recoveryEnclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('full-game-test')) as `0x${string}`,
      instanceId: 'game-1',
    });

    blockchain.registerOperator(
      recoveryEnclave.getOperatorAddress(),
      recoveryEnclave.getAttestation().cpuSignature
    );

    // Copy IPFS data and load state
    const recoveryIpfs = new IPFSSimulator();
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
    expect(recoveryEnclave.getOperatorAddress()).toBe(originalAddress);

    await recoveryEnclave.shutdown();
  });
});

describe('Security Properties', () => {
  it('never leaks plaintext to IPFS', async () => {
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

    // Verify no secrets in IPFS content
    for (const obj of ipfs.list()) {
      expect(obj.content).not.toContain('super_secret_password');
      expect(obj.content).not.toContain('sk-1234567890');

      const parsed = JSON.parse(obj.content);
      expect(parsed.payload.ciphertext).toBeDefined();
      expect(parsed.payload.iv).toBeDefined();
    }

    await enclave.shutdown();
  });

  it('produces unique ciphertext for same plaintext (random IV)', async () => {
    const enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('randomness-test')) as `0x${string}`,
      instanceId: 'randomness-1',
    });
    const ipfs = new IPFSSimulator();
    const stateManager = new StateManager(enclave, ipfs);

    const data = { value: 'same' };

    await stateManager.saveState(data);
    const first = ipfs.list()[0];

    ipfs.clear();
    await stateManager.saveState(data);
    const second = ipfs.list()[0];

    expect(first?.content).not.toBe(second?.content);

    await enclave.shutdown();
  });
});

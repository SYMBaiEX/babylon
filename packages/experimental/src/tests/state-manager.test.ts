/**
 * State Manager Tests
 *
 * Tests for encrypted state management with key rotation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type Hex, keccak256, toBytes } from 'viem';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';
import { StateManager } from '../storage/state-manager.js';
import { TEEEnclave } from '../tee/enclave.js';

describe('StateManager Checkpoints', () => {
  let enclave: TEEEnclave;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('state-manager-test')) as Hex,
      instanceId: 'state-test',
    });
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should save and load state', async () => {
    const state = { counter: 42, name: 'test' };
    const checkpoint = await stateManager.saveState(state);

    expect(checkpoint.cid).toMatch(/^Qm[a-f0-9]+$/);
    expect(checkpoint.version).toBe(1);

    const loaded = await stateManager.loadState(checkpoint.cid);
    expect(loaded).toEqual(state);
  });

  it('should track checkpoint versions', async () => {
    await stateManager.saveState({ v: 1 });
    await stateManager.saveState({ v: 2 });
    await stateManager.saveState({ v: 3 });

    const checkpoints = stateManager.getCheckpoints();
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints[0]!.version).toBe(1);
    expect(checkpoints[1]!.version).toBe(2);
    expect(checkpoints[2]!.version).toBe(3);
  });

  it('should get latest checkpoint', async () => {
    await stateManager.saveState({ v: 1 });
    await stateManager.saveState({ v: 2 });
    await stateManager.saveState({ v: 3 });

    const latest = stateManager.getLatestCheckpoint();
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(3);
  });

  it('should return null for no checkpoints', () => {
    const latest = stateManager.getLatestCheckpoint();
    expect(latest).toBeNull();
  });

  it('should track storage size', async () => {
    const initialStats = stateManager.getStats();
    expect(initialStats.checkpoints).toBe(0);

    await stateManager.saveState({ data: 'test' });

    const stats = stateManager.getStats();
    expect(stats.checkpoints).toBe(1);
    expect(stats.totalStorageBytes).toBeGreaterThan(0);
  });
});

describe('StateManager Key Rotation', () => {
  let enclave: TEEEnclave;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('key-rotation-test')) as Hex,
      instanceId: 'rotation-test',
    });
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should rotate key and re-encrypt state', async () => {
    const originalState = { secret: 'data', version: 1 };
    await stateManager.saveState(originalState);

    const checkpoint1 = stateManager.getLatestCheckpoint()!;
    expect(checkpoint1.keyVersion).toBe(1);

    // Rotate key
    const rotatedCheckpoint = await stateManager.rotateKey();

    expect(rotatedCheckpoint.keyVersion).toBe(2);
    expect(rotatedCheckpoint.cid).not.toBe(checkpoint1.cid);
  });

  it('should decrypt state after key rotation', async () => {
    const originalState = { important: 'secret', count: 100 };
    await stateManager.saveState(originalState);

    // Rotate key
    await stateManager.rotateKey();

    // Should be able to load state with new key
    const latestCheckpoint = stateManager.getLatestCheckpoint()!;
    const loaded = await stateManager.loadState(latestCheckpoint.cid);

    expect(loaded).toEqual(originalState);
  });

  it('should handle multiple key rotations', async () => {
    const state = { value: 'persistent' };
    await stateManager.saveState(state);

    // Rotate multiple times
    await stateManager.rotateKey();
    await stateManager.rotateKey();
    await stateManager.rotateKey();

    const latest = stateManager.getLatestCheckpoint()!;
    expect(latest.keyVersion).toBe(4);

    const loaded = await stateManager.loadState(latest.cid);
    expect(loaded).toEqual(state);
  });

  it('should fail to rotate without initial state', async () => {
    await expect(stateManager.rotateKey()).rejects.toThrow();
  });
});

describe('StateManager Training Data', () => {
  let enclave: TEEEnclave;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('training-data-test')) as Hex,
      instanceId: 'training-test',
    });
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should save training data publicly', () => {
    const samples = [
      { input: [1, 2, 3], output: 6 },
      { input: [4, 5, 6], output: 15 },
    ];

    const dataset = stateManager.saveTrainingData(
      samples,
      '0xbefore' as Hex,
      '0xafter' as Hex
    );

    expect(dataset.cid).toBeDefined();
    expect(dataset.epoch).toBe(1);
    expect(dataset.sampleCount).toBe(2);
  });

  it('should increment epoch counter', () => {
    stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);
    stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);
    stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);

    expect(stateManager.getCurrentEpoch()).toBe(3);
    expect(stateManager.getTrainingDatasets()).toHaveLength(3);
  });

  it('should load training data', () => {
    const samples = [{ x: 1 }, { x: 2 }];
    const dataset = stateManager.saveTrainingData(
      samples,
      '0xa' as Hex,
      '0xb' as Hex
    );

    const loaded = stateManager.loadTrainingData(dataset.cid);

    expect(loaded.samples).toEqual(samples);
    expect(loaded.epoch).toBe(1);
  });

  it('should store training data unencrypted', async () => {
    const samples = [{ visible: true }];
    stateManager.saveTrainingData(samples, '0xa' as Hex, '0xb' as Hex);

    // Check IPFS - training data should be public
    const publicObjs = ipfs.listPublic();
    expect(publicObjs.length).toBeGreaterThan(0);

    // State should be encrypted
    await stateManager.saveState({ secret: true });
    const encryptedObjs = ipfs.listEncrypted();
    expect(encryptedObjs.length).toBeGreaterThan(0);
  });
});

describe('StateManager Stats', () => {
  let enclave: TEEEnclave;
  let ipfs: IPFSSimulator;
  let stateManager: StateManager;

  beforeEach(async () => {
    enclave = await TEEEnclave.create({
      codeHash: keccak256(toBytes('stats-test')) as Hex,
      instanceId: 'stats-test',
    });
    ipfs = new IPFSSimulator();
    stateManager = new StateManager(enclave, ipfs);
  });

  afterEach(async () => {
    await enclave.shutdown();
  });

  it('should provide comprehensive stats', async () => {
    await stateManager.saveState({ data: 'test1' });
    await stateManager.saveState({ data: 'test2' });
    stateManager.saveTrainingData([{ x: 1 }], '0xa' as Hex, '0xb' as Hex);

    const stats = stateManager.getStats();

    expect(stats.checkpoints).toBe(2);
    expect(stats.trainingDatasets).toBe(1);
    expect(stats.totalStorageBytes).toBeGreaterThan(0);
  });
});

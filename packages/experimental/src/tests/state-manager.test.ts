/**
 * State Manager Tests
 *
 * Tests encrypted state management:
 * - Checkpoint creation and retrieval
 * - Key rotation with re-encryption
 * - Public training data storage
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type Hex, keccak256, toBytes } from 'viem';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';
import { StateManager } from '../storage/state-manager.js';
import { TEEEnclave } from '../tee/enclave.js';

describe('StateManager', () => {
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

  describe('checkpoints', () => {
    it('saves and loads state', async () => {
      const state = { counter: 42, name: 'test' };
      const checkpoint = await stateManager.saveState(state);

      expect(checkpoint.cid).toMatch(/^Qm[a-f0-9]+$/);
      expect(checkpoint.version).toBe(1);

      const loaded = await stateManager.loadState(checkpoint.cid);
      expect(loaded).toEqual(state);
    });

    it('tracks checkpoint versions', async () => {
      await stateManager.saveState({ v: 1 });
      await stateManager.saveState({ v: 2 });
      await stateManager.saveState({ v: 3 });

      const checkpoints = stateManager.getCheckpoints();
      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0]!.version).toBe(1);
      expect(checkpoints[1]!.version).toBe(2);
      expect(checkpoints[2]!.version).toBe(3);
    });

    it('gets latest checkpoint', async () => {
      await stateManager.saveState({ v: 1 });
      await stateManager.saveState({ v: 2 });
      await stateManager.saveState({ v: 3 });

      const latest = stateManager.getLatestCheckpoint();
      expect(latest?.version).toBe(3);
    });

    it('returns null when no checkpoints', () => {
      expect(stateManager.getLatestCheckpoint()).toBeNull();
    });

    it('tracks storage size', async () => {
      expect(stateManager.getStats().checkpoints).toBe(0);

      await stateManager.saveState({ data: 'test' });

      const stats = stateManager.getStats();
      expect(stats.checkpoints).toBe(1);
      expect(stats.totalStorageBytes).toBeGreaterThan(0);
    });
  });

  describe('key rotation', () => {
    it('rotates key and re-encrypts state', async () => {
      await stateManager.saveState({ secret: 'data', version: 1 });
      const checkpoint1 = stateManager.getLatestCheckpoint()!;
      expect(checkpoint1.keyVersion).toBe(1);

      const rotatedCheckpoint = await stateManager.rotateKey();

      expect(rotatedCheckpoint.keyVersion).toBe(2);
      expect(rotatedCheckpoint.cid).not.toBe(checkpoint1.cid);
    });

    it('decrypts state after key rotation', async () => {
      const originalState = { important: 'secret', count: 100 };
      await stateManager.saveState(originalState);

      await stateManager.rotateKey();

      const latestCheckpoint = stateManager.getLatestCheckpoint()!;
      const loaded = await stateManager.loadState(latestCheckpoint.cid);

      expect(loaded).toEqual(originalState);
    });

    it('handles multiple key rotations', async () => {
      const state = { value: 'persistent' };
      await stateManager.saveState(state);

      await stateManager.rotateKey();
      await stateManager.rotateKey();
      await stateManager.rotateKey();

      const latest = stateManager.getLatestCheckpoint()!;
      expect(latest.keyVersion).toBe(4);

      const loaded = await stateManager.loadState(latest.cid);
      expect(loaded).toEqual(state);
    });

    it('fails to rotate without initial state', async () => {
      await expect(stateManager.rotateKey()).rejects.toThrow();
    });
  });

  describe('training data', () => {
    it('saves training data publicly', () => {
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

    it('increments epoch counter', () => {
      stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);
      stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);
      stateManager.saveTrainingData([], '0xa' as Hex, '0xb' as Hex);

      expect(stateManager.getCurrentEpoch()).toBe(3);
      expect(stateManager.getTrainingDatasets()).toHaveLength(3);
    });

    it('loads training data', () => {
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

    it('stores training data unencrypted (public)', async () => {
      stateManager.saveTrainingData(
        [{ visible: true }],
        '0xa' as Hex,
        '0xb' as Hex
      );
      expect(ipfs.listPublic().length).toBeGreaterThan(0);

      await stateManager.saveState({ secret: true });
      expect(ipfs.listEncrypted().length).toBeGreaterThan(0);
    });
  });

  describe('stats', () => {
    it('provides comprehensive stats', async () => {
      await stateManager.saveState({ data: 'test1' });
      await stateManager.saveState({ data: 'test2' });
      stateManager.saveTrainingData([{ x: 1 }], '0xa' as Hex, '0xb' as Hex);

      const stats = stateManager.getStats();

      expect(stats.checkpoints).toBe(2);
      expect(stats.trainingDatasets).toBe(1);
      expect(stats.totalStorageBytes).toBeGreaterThan(0);
    });
  });
});

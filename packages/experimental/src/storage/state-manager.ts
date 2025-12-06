/**
 * State Manager
 *
 * Manages game state persistence using encrypted storage.
 * Coordinates between the TEE enclave and IPFS storage.
 */

import type { Hex } from 'viem';
import type { TEEEnclave } from '../tee/enclave.js';
import type { SealedData } from '../tee/keystore.js';
import type { IPFSSimulator } from './ipfs-simulator.js';

export interface StateCheckpoint {
  cid: string;
  hash: Hex;
  version: number;
  keyVersion: number;
  timestamp: number;
  size: number;
}

export interface TrainingDataset {
  cid: string;
  epoch: number;
  sampleCount: number;
  timestamp: number;
  modelHashBefore: Hex;
  modelHashAfter: Hex;
}

export interface StateManagerConfig {
  verbose?: boolean;
}

/**
 * Manages encrypted game state and public training data
 */
export class StateManager {
  private enclave: TEEEnclave;
  private ipfs: IPFSSimulator;
  private checkpoints: StateCheckpoint[] = [];
  private trainingDatasets: TrainingDataset[] = [];
  private currentEpoch = 0;
  private config: StateManagerConfig;

  constructor(
    enclave: TEEEnclave,
    ipfs: IPFSSimulator,
    config: StateManagerConfig = {}
  ) {
    this.enclave = enclave;
    this.ipfs = ipfs;
    this.config = config;

    if (config.verbose) {
      console.log('[StateManager] Initialized');
    }
  }

  /**
   * Save encrypted game state to IPFS
   */
  async saveState(state: object): Promise<StateCheckpoint> {
    // Encrypt state inside TEE
    const { cid, hash } = await this.enclave.encryptState(state);

    // Get sealed data from enclave
    const sealed = this.enclave.getSealedState();
    if (!sealed) {
      throw new Error('Failed to get sealed state from enclave');
    }

    // Store sealed blob in IPFS
    const sealedJson = JSON.stringify(sealed);
    this.ipfs.store(sealedJson, {
      encrypted: true,
      metadata: {
        keyVersion: sealed.version,
        stateHash: hash,
      },
    });

    const checkpoint: StateCheckpoint = {
      cid,
      hash,
      version: this.checkpoints.length + 1,
      keyVersion: sealed.version,
      timestamp: Date.now(),
      size: sealedJson.length,
    };

    this.checkpoints.push(checkpoint);

    if (this.config.verbose) {
      console.log(
        `[StateManager] Saved checkpoint v${checkpoint.version}: ${cid}`
      );
    }

    return checkpoint;
  }

  /**
   * Load and decrypt state from IPFS
   */
  async loadState<T = object>(cid: string, keyVersion?: number): Promise<T> {
    // Retrieve sealed blob from IPFS
    const obj = this.ipfs.retrieve(cid);
    if (!obj) {
      throw new Error(`State not found: ${cid}`);
    }

    // Verify integrity
    const verification = this.ipfs.verify(cid);
    if (!verification.valid) {
      throw new Error(`State integrity check failed: ${verification.error}`);
    }

    // Parse sealed data
    const sealed: SealedData = JSON.parse(obj.content);

    // Decrypt inside TEE
    const state = await this.enclave.decryptState<T>(sealed, keyVersion);

    if (this.config.verbose) {
      console.log(`[StateManager] Loaded state from ${cid}`);
    }

    return state;
  }

  /**
   * Handle key rotation - re-encrypt and save state with new key
   */
  async rotateKey(): Promise<StateCheckpoint> {
    if (this.config.verbose) {
      console.log('\n[StateManager] === INITIATING KEY ROTATION ===');
    }

    // Tell enclave to rotate its key and re-encrypt state
    const { newVersion, newCid } = await this.enclave.rotateStateKey();

    // Get new sealed data
    const sealed = this.enclave.getSealedState();
    if (!sealed) {
      throw new Error('Failed to get re-encrypted state');
    }

    // Store new sealed blob
    const sealedJson = JSON.stringify(sealed);
    this.ipfs.store(sealedJson, {
      encrypted: true,
      metadata: {
        keyVersion: newVersion,
        rotatedFrom: sealed.version - 1,
      },
    });

    const checkpoint: StateCheckpoint = {
      cid: newCid,
      hash: this.enclave.getStatus().stateVersion.toString() as Hex,
      version: this.checkpoints.length + 1,
      keyVersion: newVersion,
      timestamp: Date.now(),
      size: sealedJson.length,
    };

    this.checkpoints.push(checkpoint);

    if (this.config.verbose) {
      console.log(
        `[StateManager] Key rotated to v${newVersion}, new checkpoint: ${newCid}`
      );
    }

    return checkpoint;
  }

  /**
   * Save public training dataset to IPFS
   */
  saveTrainingData(
    data: object[],
    modelHashBefore: Hex,
    modelHashAfter: Hex
  ): TrainingDataset {
    this.currentEpoch++;

    // Training data is stored publicly (not encrypted)
    const dataJson = JSON.stringify({
      epoch: this.currentEpoch,
      timestamp: Date.now(),
      samples: data,
    });

    const obj = this.ipfs.store(dataJson, {
      encrypted: false,
      metadata: {
        type: 'training_dataset',
        epoch: this.currentEpoch,
        sampleCount: data.length,
        modelHashBefore,
        modelHashAfter,
      },
    });

    const dataset: TrainingDataset = {
      cid: obj.cid,
      epoch: this.currentEpoch,
      sampleCount: data.length,
      timestamp: obj.timestamp,
      modelHashBefore,
      modelHashAfter,
    };

    this.trainingDatasets.push(dataset);

    if (this.config.verbose) {
      console.log(
        `[StateManager] Saved training data epoch ${this.currentEpoch}: ${obj.cid} (${data.length} samples)`
      );
    }

    return dataset;
  }

  /**
   * Load public training dataset from IPFS
   */
  loadTrainingData(cid: string): {
    epoch: number;
    timestamp: number;
    samples: object[];
  } {
    const obj = this.ipfs.retrieve(cid);
    if (!obj) {
      throw new Error(`Training data not found: ${cid}`);
    }

    return JSON.parse(obj.content);
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): StateCheckpoint[] {
    return [...this.checkpoints];
  }

  /**
   * Get latest checkpoint
   */
  getLatestCheckpoint(): StateCheckpoint | null {
    return this.checkpoints[this.checkpoints.length - 1] ?? null;
  }

  /**
   * Get all training datasets
   */
  getTrainingDatasets(): TrainingDataset[] {
    return [...this.trainingDatasets];
  }

  /**
   * Get current epoch
   */
  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Get storage stats
   */
  getStats(): {
    checkpoints: number;
    trainingDatasets: number;
    totalStorageBytes: number;
  } {
    const ipfsStats = this.ipfs.getStats();
    return {
      checkpoints: this.checkpoints.length,
      trainingDatasets: this.trainingDatasets.length,
      totalStorageBytes: ipfsStats.totalSize,
    };
  }
}

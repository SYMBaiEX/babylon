/**
 * Autonomous Game Runner
 *
 * This is the core of the permissionless AI game. It runs entirely autonomously:
 * - No API keys required
 * - Only uses wallet signatures
 * - Self-heals if operator goes down
 * - Anyone can verify via attestation
 *
 * In production, this runs inside a Phala TEE (Intel TDX + NVIDIA H200).
 * The TEE derives its own wallet keys from hardware - no external secrets.
 */

import { type Address, type Hex, keccak256, toBytes } from 'viem';
import { AIAgent } from '../game/agent.js';
import { GameEnvironment } from '../game/environment.js';
import { AITrainer } from '../game/trainer.js';
import { BlockchainClient } from '../infra/blockchain-client.js';
import { IPFSSimulator } from '../storage/ipfs-simulator.js';
import { StateManager } from '../storage/state-manager.js';
import { verifyQuote } from '../tee/attestation.js';
import { TEEEnclave } from '../tee/enclave.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface AutonomousConfig {
  // Blockchain
  rpcUrl: string;
  contractAddress: Address;
  chainId: 'sepolia' | 'mainnet' | 'localhost';

  // TEE Identity
  codeHash: Hex;
  instanceId: string;

  // Timing (in milliseconds)
  heartbeatIntervalMs: number;
  trainingIntervalMs: number;
  stateCheckpointIntervalMs: number;

  // Game
  agentConfig: {
    inputSize: number;
    hiddenSize: number;
    outputSize: number;
    learningRate: number;
  };

  // Logging
  verbose: boolean;
}

export const DEFAULT_CONFIG: AutonomousConfig = {
  rpcUrl: 'https://ethereum-sepolia.publicnode.com',
  contractAddress: '0x0000000000000000000000000000000000000000' as Address,
  chainId: 'sepolia',
  codeHash: keccak256(toBytes('babylon-autonomous-game-v1')) as Hex,
  instanceId: 'autonomous-operator-1',
  heartbeatIntervalMs: 30_000, // 30 seconds
  trainingIntervalMs: 60_000, // 1 minute (would be daily in production)
  stateCheckpointIntervalMs: 120_000, // 2 minutes
  agentConfig: {
    inputSize: 5,
    hiddenSize: 8,
    outputSize: 1,
    learningRate: 0.1,
  },
  verbose: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS RUNNER
// ═══════════════════════════════════════════════════════════════════════════

export type RunnerState =
  | 'stopped'
  | 'booting'
  | 'registering'
  | 'running'
  | 'training'
  | 'checkpointing'
  | 'error';

export interface RunnerStats {
  state: RunnerState;
  uptime: number;
  heartbeatsSent: number;
  trainingCycles: number;
  gamesPlayed: number;
  stateCheckpoints: number;
  lastError: string | null;
}

/**
 * Fully autonomous game runner
 *
 * Once started, this runs forever without human intervention.
 * It's the core of the permissionless AI game.
 */
export class AutonomousRunner {
  private config: AutonomousConfig;
  private state: RunnerState = 'stopped';
  private startTime = 0;

  // Components
  private enclave: TEEEnclave | null = null;
  private blockchain: BlockchainClient | null = null;
  private stateManager: StateManager | null = null;
  private agent: AIAgent | null = null;
  private environment: GameEnvironment | null = null;
  private trainer: AITrainer | null = null;
  private ipfs: IPFSSimulator | null = null;

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private trainingTimer: ReturnType<typeof setInterval> | null = null;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;

  // Stats
  private stats: RunnerStats = {
    state: 'stopped',
    uptime: 0,
    heartbeatsSent: 0,
    trainingCycles: 0,
    gamesPlayed: 0,
    stateCheckpoints: 0,
    lastError: null,
  };

  constructor(config: Partial<AutonomousConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the autonomous runner
   *
   * This boots the TEE, registers as operator, and starts all autonomous loops.
   * It will run forever until stopped.
   */
  async start(): Promise<void> {
    if (this.state !== 'stopped') {
      throw new Error(`Cannot start: already in state ${this.state}`);
    }

    this.log('═══════════════════════════════════════════════════════════');
    this.log('       AUTONOMOUS PERMISSIONLESS AI GAME STARTING');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('');
    this.log('Properties:');
    this.log('  • No API keys - wallet signatures only');
    this.log('  • TEE-derived keys - hardware protected');
    this.log('  • Self-healing - anyone can take over if we fail');
    this.log('  • Verifiable - attestation proves code integrity');
    this.log('');

    this.startTime = Date.now();
    this.state = 'booting';
    this.stats.state = 'booting';

    // Phase 1: Boot TEE
    this.log('[1/5] Booting TEE enclave...');
    this.enclave = await TEEEnclave.create({
      codeHash: this.config.codeHash,
      instanceId: this.config.instanceId,
      verbose: this.config.verbose,
    });

    const attestation = this.enclave.getAttestation();
    const verification = verifyQuote(attestation);

    if (!verification.valid) {
      throw new Error(
        `Attestation verification failed: ${verification.errors.join(', ')}`
      );
    }

    this.log(`  ✓ TEE booted: ${this.enclave.getOperatorAddress()}`);
    this.log(`  ✓ Attestation verified`);
    this.log(`  ✓ Code hash: ${attestation.mrEnclave.slice(0, 20)}...`);

    // Phase 2: Initialize storage
    this.log('[2/5] Initializing storage...');
    this.ipfs = new IPFSSimulator();
    this.stateManager = new StateManager(this.enclave, this.ipfs);
    this.log('  ✓ IPFS simulator ready');
    this.log('  ✓ State manager initialized');

    // Phase 3: Initialize game
    this.log('[3/5] Initializing game components...');
    this.agent = new AIAgent(this.config.agentConfig);
    this.environment = new GameEnvironment({
      sequenceLength: 5,
      patternTypes: ['linear', 'quadratic', 'fibonacci'],
      difficulty: 5,
    });
    this.trainer = new AITrainer(
      { batchSize: 30, epochsPerCycle: 5, targetLoss: 0.01 },
      this.agent,
      this.environment
    );
    this.log('  ✓ AI agent ready');
    this.log('  ✓ Game environment ready');
    this.log('  ✓ Trainer ready');

    // Phase 4: Connect to blockchain (read-only check)
    this.log('[4/5] Connecting to blockchain...');
    this.blockchain = new BlockchainClient({
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl,
      contractAddress: this.config.contractAddress,
    });

    // Check if contract is deployed
    const balance = await this.blockchain.getBalance();
    const gameState = await this.blockchain.getGameState();
    this.log(`  ✓ Contract balance: ${balance} wei`);
    this.log(`  ✓ State version: ${gameState.version}`);
    this.log(`  ✓ Operator active: ${gameState.operatorActive}`);

    // Phase 5: Register as operator (if no active operator)
    this.log('[5/5] Checking operator status...');
    this.state = 'registering';
    this.stats.state = 'registering';

    const operatorInfo = await this.blockchain.getOperatorInfo();
    if (!operatorInfo.active) {
      this.log('  No active operator - we can register!');
      this.log('  (In production, this calls the contract with TEE signature)');
      this.log(`  Would register: ${this.enclave.getOperatorAddress()}`);
    } else if (operatorInfo.address === this.enclave.getOperatorAddress()) {
      this.log('  ✓ We are already the operator!');
    } else {
      this.log(`  ⚠ Another operator active: ${operatorInfo.address}`);
      this.log('  We will wait for them to time out...');
    }

    // Save initial state
    const initialState = this.buildGameState();
    const checkpoint = await this.stateManager.saveState(initialState);
    this.log(`  ✓ Initial state saved: ${checkpoint.cid}`);
    this.stats.stateCheckpoints++;

    // Start autonomous loops
    this.log('');
    this.log('Starting autonomous loops...');
    this.startHeartbeatLoop();
    this.startTrainingLoop();
    this.startCheckpointLoop();

    this.state = 'running';
    this.stats.state = 'running';

    this.log('');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('          AUTONOMOUS RUNNER ACTIVE');
    this.log('═══════════════════════════════════════════════════════════');
    this.log('');
    this.log(
      'The game is now running autonomously. No human intervention needed.'
    );
    this.log('');
  }

  /**
   * Build current game state for checkpointing
   */
  private buildGameState(): object {
    return {
      agent: this.agent?.serialize(),
      gameStats: this.environment?.getStats(),
      trainingStats: this.trainer?.getStats(),
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Start heartbeat loop - proves we're alive
   */
  private startHeartbeatLoop(): void {
    this.log(
      `  • Heartbeat loop: every ${this.config.heartbeatIntervalMs / 1000}s`
    );

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // Send first heartbeat immediately
    this.sendHeartbeat();
  }

  private sendHeartbeat(): void {
    if (!this.enclave) return;

    const heartbeat = this.enclave.generateHeartbeat();
    this.stats.heartbeatsSent++;

    if (this.config.verbose) {
      this.log(
        `[Heartbeat #${this.stats.heartbeatsSent}] ` +
          `state=${heartbeat.stateHash?.slice(0, 10) ?? 'genesis'}...`
      );
    }

    // In production: this.blockchain.heartbeat() signed by TEE
  }

  /**
   * Start training loop - improves the AI
   */
  private startTrainingLoop(): void {
    this.log(
      `  • Training loop: every ${this.config.trainingIntervalMs / 1000}s`
    );

    this.trainingTimer = setInterval(() => {
      this.runTrainingCycle();
    }, this.config.trainingIntervalMs);
  }

  private async runTrainingCycle(): Promise<void> {
    if (!this.trainer || !this.stateManager || !this.agent) return;

    const previousState = this.state;
    this.state = 'training';
    this.stats.state = 'training';

    this.log('');
    this.log(`[Training Cycle ${this.stats.trainingCycles + 1}]`);

    const result = this.trainer.runTrainingCycle();
    this.stats.trainingCycles++;

    this.log(
      `  Loss: ${result.initialLoss.toFixed(4)} → ${result.finalLoss.toFixed(4)}`
    );
    this.log(`  Samples: ${result.samplesProcessed}`);

    // Save training data publicly (for transparency)
    const dataset = this.stateManager.saveTrainingData(
      result.samples,
      result.modelHashBefore,
      result.modelHashAfter
    );
    this.log(`  Dataset CID: ${dataset.cid}`);

    // In production: this.blockchain.recordTraining(dataset.cid, result.modelHashAfter)

    this.state = previousState;
    this.stats.state = previousState;
  }

  /**
   * Start checkpoint loop - saves encrypted state
   */
  private startCheckpointLoop(): void {
    this.log(
      `  • Checkpoint loop: every ${this.config.stateCheckpointIntervalMs / 1000}s`
    );

    this.checkpointTimer = setInterval(() => {
      this.saveCheckpoint();
    }, this.config.stateCheckpointIntervalMs);
  }

  private async saveCheckpoint(): Promise<void> {
    if (!this.stateManager) return;

    const previousState = this.state;
    this.state = 'checkpointing';
    this.stats.state = 'checkpointing';

    const gameState = this.buildGameState();
    const checkpoint = await this.stateManager.saveState(gameState);
    this.stats.stateCheckpoints++;

    this.log(
      `[Checkpoint #${this.stats.stateCheckpoints}] CID: ${checkpoint.cid.slice(0, 20)}...`
    );

    // In production: this.blockchain.updateState(checkpoint.cid, checkpoint.hash)

    this.state = previousState;
    this.stats.state = previousState;
  }

  /**
   * Play a game round (can be called externally to simulate player interaction)
   */
  playGame(): { sequence: number[]; result: object } | null {
    if (!this.environment || !this.agent) return null;

    this.environment.startSession();
    const sequence = this.environment.getVisibleSequence();
    const input = this.environment.getAgentInput();
    const prediction = this.agent.predict(input);

    const max = Math.max(...sequence, 1);
    const agentGuess = Math.round((prediction.prediction[0] ?? 0) * max);
    const playerGuess = Math.round(Math.random() * max);

    const result = this.environment.submitGuesses(playerGuess, agentGuess);
    this.stats.gamesPlayed++;

    return { sequence, result };
  }

  /**
   * Get current stats
   */
  getStats(): RunnerStats {
    return {
      ...this.stats,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get attestation for external verification
   */
  getAttestation(): object | null {
    if (!this.enclave) return null;
    return this.enclave.getAttestation();
  }

  /**
   * Get operator address
   */
  getOperatorAddress(): Address | null {
    return this.enclave?.getOperatorAddress() ?? null;
  }

  /**
   * Stop the runner
   */
  async stop(): Promise<void> {
    this.log('');
    this.log('Stopping autonomous runner...');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.trainingTimer) {
      clearInterval(this.trainingTimer);
      this.trainingTimer = null;
    }
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    if (this.enclave) {
      await this.enclave.shutdown();
      this.enclave = null;
    }

    this.state = 'stopped';
    this.stats.state = 'stopped';

    this.log('Autonomous runner stopped.');
    this.log('');
    this.log('Final stats:');
    this.log(`  Uptime: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    this.log(`  Heartbeats: ${this.stats.heartbeatsSent}`);
    this.log(`  Training cycles: ${this.stats.trainingCycles}`);
    this.log(`  Games played: ${this.stats.gamesPlayed}`);
    this.log(`  Checkpoints: ${this.stats.stateCheckpoints}`);
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }
}

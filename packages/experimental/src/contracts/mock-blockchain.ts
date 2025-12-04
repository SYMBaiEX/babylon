/**
 * Mock Blockchain
 *
 * Simulates EVM-compatible blockchain with game contracts.
 * Implements state machine logic for operator management, staking, and governance.
 */

import type { Address, Hex } from 'viem';

// ============================================================================
// Types
// ============================================================================

export interface GameConfig {
  heartbeatTimeout: number; // ms
  dailyWithdrawalLimit: bigint;
  minStake: bigint;
  minApprovals: number; // for multi-sig
}

export interface GameState {
  operatorAddress: Address | null;
  operatorActive: boolean;
  currentStateCID: string | null;
  stateHash: Hex | null;
  stateVersion: number;
  lastHeartbeat: number;
}

export interface StakeInfo {
  amount: bigint;
  lockedUntil: number;
  rewards: bigint;
}

export interface StakingState {
  totalStaked: bigint;
  stakes: Map<Address, StakeInfo>;
}

export interface KeyRotationRequest {
  id: number;
  requester: Address;
  approvals: Set<Address>;
  executed: boolean;
  timestamp: number;
}

export interface SecurityCouncilState {
  members: Set<Address>;
  minApprovals: number;
  currentKeyVersion: number;
  pendingRequests: Map<number, KeyRotationRequest>;
}

export type ContractEventType =
  | 'OperatorRegistered'
  | 'OperatorDeactivated'
  | 'StateUpdated'
  | 'HeartbeatReceived'
  | 'FundsWithdrawn'
  | 'Staked'
  | 'Unstaked'
  | 'KeyRotationRequested'
  | 'KeyRotationApproved'
  | 'KeyRotationExecuted'
  | 'TrainingRecorded';

export interface ContractEvent {
  contract: 'game' | 'staking' | 'securityCouncil';
  type: ContractEventType;
  data: Record<string, unknown>;
  blockNumber: number;
  timestamp: number;
}

export interface TransactionResult {
  success: boolean;
  error?: string;
  requestId?: number;
  executed?: boolean;
}

// ============================================================================
// Mock Blockchain Implementation
// ============================================================================

export class MockBlockchain {
  private config: GameConfig;
  private gameState: GameState;
  private stakingState: StakingState;
  private councilState: SecurityCouncilState;
  private balances: Map<Address, bigint>;
  private events: ContractEvent[];
  private blockNumber: number;
  private blockTimestamp: number;
  private requestIdCounter: number;
  private dailyWithdrawn: Map<Address, { amount: bigint; resetAt: number }>;

  constructor() {
    this.config = {
      heartbeatTimeout: 60000, // 1 minute for testing
      dailyWithdrawalLimit: 1000n * 10n ** 18n, // 1000 tokens
      minStake: 100n * 10n ** 18n, // 100 tokens
      minApprovals: 3, // 3 of N multi-sig
    };

    this.gameState = {
      operatorAddress: null,
      operatorActive: false,
      currentStateCID: null,
      stateHash: null,
      stateVersion: 0,
      lastHeartbeat: 0,
    };

    this.stakingState = {
      totalStaked: 0n,
      stakes: new Map(),
    };

    this.councilState = {
      members: new Set(),
      minApprovals: this.config.minApprovals,
      currentKeyVersion: 1,
      pendingRequests: new Map(),
    };

    this.balances = new Map();
    this.events = [];
    this.blockNumber = 0;
    this.blockTimestamp = Date.now();
    this.requestIdCounter = 0;
    this.dailyWithdrawn = new Map();

    // Initialize treasury
    this.balances.set(
      '0x0000000000000000000000000000000000000000' as Address,
      10000n * 10n ** 18n // 10000 tokens initial treasury
    );
  }

  // ========================================================================
  // Block Management
  // ========================================================================

  mineBlock(): void {
    this.blockNumber++;
    // Advance by ~12 seconds per block (Ethereum average)
    this.blockTimestamp += 12000;
  }

  getBlockNumber(): number {
    return this.blockNumber;
  }

  getBlockTimestamp(): number {
    return this.blockTimestamp;
  }

  // ========================================================================
  // Game Contract Functions
  // ========================================================================

  registerOperator(
    operatorAddress: Address,
    _attestationProof: Hex
  ): TransactionResult {
    if (this.gameState.operatorAddress && this.gameState.operatorActive) {
      return { success: false, error: 'Operator already registered' };
    }

    this.gameState.operatorAddress = operatorAddress;
    this.gameState.operatorActive = true;
    this.gameState.lastHeartbeat = this.blockTimestamp;

    this.emitEvent('game', 'OperatorRegistered', { address: operatorAddress });
    this.mineBlock();

    return { success: true };
  }

  updateState(
    operatorAddress: Address,
    cid: string,
    hash: Hex
  ): TransactionResult {
    if (this.gameState.operatorAddress !== operatorAddress) {
      return { success: false, error: 'Not authorized operator' };
    }

    this.gameState.currentStateCID = cid;
    this.gameState.stateHash = hash;
    this.gameState.stateVersion++;

    this.emitEvent('game', 'StateUpdated', {
      cid,
      hash,
      version: this.gameState.stateVersion,
    });
    this.mineBlock();

    return { success: true };
  }

  heartbeat(operatorAddress: Address): TransactionResult {
    if (this.gameState.operatorAddress !== operatorAddress) {
      return { success: false, error: 'Not authorized operator' };
    }

    this.gameState.lastHeartbeat = this.blockTimestamp;
    this.gameState.operatorActive = true;

    this.emitEvent('game', 'HeartbeatReceived', {
      timestamp: this.gameState.lastHeartbeat,
    });
    this.mineBlock();

    return { success: true };
  }

  isOperatorInactive(): boolean {
    if (!this.gameState.operatorAddress) return false;
    // Use block timestamp for deterministic testing
    const timeSinceHeartbeat =
      this.blockTimestamp - this.gameState.lastHeartbeat;
    return timeSinceHeartbeat > this.config.heartbeatTimeout;
  }

  markOperatorInactive(): TransactionResult {
    if (!this.isOperatorInactive()) {
      return { success: false, error: 'Operator is still active' };
    }

    const deactivatedAddress = this.gameState.operatorAddress;
    this.gameState.operatorActive = false;
    this.gameState.operatorAddress = null;

    this.emitEvent('game', 'OperatorDeactivated', {
      address: deactivatedAddress,
      reason: 'heartbeat_timeout',
    });
    this.mineBlock();

    return { success: true };
  }

  recordTraining(
    operatorAddress: Address,
    datasetCID: string,
    modelHash: Hex
  ): TransactionResult {
    if (this.gameState.operatorAddress !== operatorAddress) {
      return { success: false, error: 'Not authorized operator' };
    }

    this.emitEvent('game', 'TrainingRecorded', {
      datasetCID,
      modelHash,
      timestamp: Date.now(),
    });
    this.mineBlock();

    return { success: true };
  }

  withdrawFunds(operatorAddress: Address, amount: bigint): TransactionResult {
    if (this.gameState.operatorAddress !== operatorAddress) {
      return { success: false, error: 'Not authorized operator' };
    }

    // Check daily limit - always enforced
    if (amount > this.config.dailyWithdrawalLimit) {
      return {
        success: false,
        error: 'Exceeds daily withdrawal limit',
      };
    }

    // Check daily accumulated limit
    const now = this.blockTimestamp;
    const withdrawn = this.dailyWithdrawn.get(operatorAddress);

    if (withdrawn && withdrawn.resetAt > now) {
      if (withdrawn.amount + amount > this.config.dailyWithdrawalLimit) {
        return {
          success: false,
          error: 'Exceeds daily withdrawal limit',
        };
      }
      withdrawn.amount += amount;
    } else {
      this.dailyWithdrawn.set(operatorAddress, {
        amount,
        resetAt: now + 86400000, // 24 hours
      });
    }

    // Check treasury balance
    const treasury = '0x0000000000000000000000000000000000000000' as Address;
    const treasuryBalance = this.balances.get(treasury) ?? 0n;

    if (treasuryBalance < amount) {
      return { success: false, error: 'Insufficient treasury balance' };
    }

    // Transfer
    this.balances.set(treasury, treasuryBalance - amount);
    const currentBalance = this.balances.get(operatorAddress) ?? 0n;
    this.balances.set(operatorAddress, currentBalance + amount);

    this.emitEvent('game', 'FundsWithdrawn', {
      amount,
      recipient: operatorAddress,
    });
    this.mineBlock();

    return { success: true };
  }

  // ========================================================================
  // Staking Functions
  // ========================================================================

  stake(staker: Address, amount: bigint): TransactionResult {
    const balance = this.balances.get(staker) ?? 0n;

    if (balance < amount) {
      return { success: false, error: 'Insufficient balance' };
    }

    if (amount < this.config.minStake) {
      return {
        success: false,
        error: `Minimum stake is ${this.config.minStake}`,
      };
    }

    // Deduct from balance
    this.balances.set(staker, balance - amount);

    // Add to stake
    const existingStake = this.stakingState.stakes.get(staker);
    if (existingStake) {
      existingStake.amount += amount;
    } else {
      this.stakingState.stakes.set(staker, {
        amount,
        lockedUntil: Date.now() + 604800000, // 7 days
        rewards: 0n,
      });
    }

    this.stakingState.totalStaked += amount;

    this.emitEvent('staking', 'Staked', { address: staker, amount });
    this.mineBlock();

    return { success: true };
  }

  unstake(staker: Address, amount: bigint): TransactionResult {
    const stake = this.stakingState.stakes.get(staker);

    if (!stake) {
      return { success: false, error: 'No stake found' };
    }

    if (stake.amount < amount) {
      return { success: false, error: 'Insufficient stake' };
    }

    if (stake.lockedUntil > Date.now()) {
      return { success: false, error: 'Stake is still locked' };
    }

    stake.amount -= amount;
    this.stakingState.totalStaked -= amount;

    // Return to balance
    const balance = this.balances.get(staker) ?? 0n;
    this.balances.set(staker, balance + amount);

    if (stake.amount === 0n) {
      this.stakingState.stakes.delete(staker);
    }

    this.emitEvent('staking', 'Unstaked', { address: staker, amount });
    this.mineBlock();

    return { success: true };
  }

  getStakeInfo(staker: Address): StakeInfo | null {
    return this.stakingState.stakes.get(staker) ?? null;
  }

  // ========================================================================
  // Security Council Functions
  // ========================================================================

  addCouncilMember(member: Address): void {
    this.councilState.members.add(member);
  }

  removeCouncilMember(member: Address): void {
    this.councilState.members.delete(member);
  }

  requestKeyRotation(requester: Address): TransactionResult {
    if (!this.councilState.members.has(requester)) {
      return { success: false, error: 'Not a council member' };
    }

    const requestId = ++this.requestIdCounter;
    const request: KeyRotationRequest = {
      id: requestId,
      requester,
      approvals: new Set([requester]),
      executed: false,
      timestamp: Date.now(),
    };

    this.councilState.pendingRequests.set(requestId, request);

    this.emitEvent('securityCouncil', 'KeyRotationRequested', {
      requestId,
      requester,
    });
    this.mineBlock();

    return { success: true, requestId };
  }

  approveKeyRotation(approver: Address, requestId: number): TransactionResult {
    if (!this.councilState.members.has(approver)) {
      return { success: false, error: 'Not a council member' };
    }

    const request = this.councilState.pendingRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (request.executed) {
      return { success: false, error: 'Request already executed' };
    }

    if (request.approvals.has(approver)) {
      return { success: false, error: 'Already approved' };
    }

    request.approvals.add(approver);

    this.emitEvent('securityCouncil', 'KeyRotationApproved', {
      requestId,
      approver,
      approvalCount: request.approvals.size,
    });

    // Check if threshold reached
    if (request.approvals.size >= this.councilState.minApprovals) {
      request.executed = true;
      this.councilState.currentKeyVersion++;
      this.councilState.pendingRequests.delete(requestId);

      this.emitEvent('securityCouncil', 'KeyRotationExecuted', {
        requestId,
        newVersion: this.councilState.currentKeyVersion,
      });

      this.mineBlock();
      return { success: true, executed: true };
    }

    this.mineBlock();
    return { success: true, executed: false };
  }

  // ========================================================================
  // State Getters
  // ========================================================================

  getGameState(): GameState {
    return { ...this.gameState };
  }

  getGameConfig(): GameConfig {
    return { ...this.config };
  }

  getStakingState(): StakingState {
    return {
      totalStaked: this.stakingState.totalStaked,
      stakes: new Map(this.stakingState.stakes),
    };
  }

  getSecurityCouncilState(): SecurityCouncilState {
    return {
      members: new Set(this.councilState.members),
      minApprovals: this.councilState.minApprovals,
      currentKeyVersion: this.councilState.currentKeyVersion,
      pendingRequests: new Map(this.councilState.pendingRequests),
    };
  }

  getTreasuryBalance(): bigint {
    return (
      this.balances.get(
        '0x0000000000000000000000000000000000000000' as Address
      ) ?? 0n
    );
  }

  getBalance(address: Address): bigint {
    return this.balances.get(address) ?? 0n;
  }

  setBalance(address: Address, amount: bigint): void {
    this.balances.set(address, amount);
  }

  // ========================================================================
  // Event Management
  // ========================================================================

  private emitEvent(
    contract: 'game' | 'staking' | 'securityCouncil',
    type: ContractEventType,
    data: Record<string, unknown>
  ): void {
    this.events.push({
      contract,
      type,
      data,
      blockNumber: this.blockNumber,
      timestamp: Date.now(),
    });
  }

  getEvents(): ContractEvent[] {
    return [...this.events];
  }

  getEventsByContract(
    contract: 'game' | 'staking' | 'securityCouncil'
  ): ContractEvent[] {
    return this.events.filter((e) => e.contract === contract);
  }

  getEventsByType(type: ContractEventType): ContractEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}

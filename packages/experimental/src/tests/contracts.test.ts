/**
 * Mock Blockchain / Contracts Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { Address } from 'viem';
import { MockBlockchain } from '../contracts/mock-blockchain.js';

describe('MockBlockchain', () => {
  let blockchain: MockBlockchain;

  beforeEach(() => {
    blockchain = new MockBlockchain();
  });

  it('should initialize with default state', () => {
    const gameState = blockchain.getGameState();

    expect(gameState.operatorAddress).toBeNull();
    expect(gameState.operatorActive).toBe(false);
    expect(gameState.stateVersion).toBe(0);
  });

  it('should have initial treasury balance', () => {
    const balance = blockchain.getTreasuryBalance();

    expect(balance).toBeGreaterThan(0n);
  });
});

describe('Operator Registration', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
  });

  it('should register operator', () => {
    const result = blockchain.registerOperator(
      operator,
      '0xproof' as `0x${string}`
    );

    expect(result.success).toBe(true);

    const state = blockchain.getGameState();
    expect(state.operatorAddress).toBe(operator);
    expect(state.operatorActive).toBe(true);
  });

  it('should reject duplicate registration', () => {
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
    const result = blockchain.registerOperator(
      '0x9999999999999999999999999999999999999999' as Address,
      '0xproof2' as `0x${string}`
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('already registered');
  });

  it('should emit registration event', () => {
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);

    const events = blockchain.getEventsByContract('game');
    const regEvent = events.find((e) => e.type === 'OperatorRegistered');

    expect(regEvent).toBeDefined();
  });
});

describe('State Updates', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
  });

  it('should update state from authorized operator', () => {
    const result = blockchain.updateState(
      operator,
      'QmTestCID',
      '0xabcd' as `0x${string}`
    );

    expect(result.success).toBe(true);

    const state = blockchain.getGameState();
    expect(state.currentStateCID).toBe('QmTestCID');
    expect(state.stateVersion).toBe(1);
  });

  it('should reject state update from unauthorized address', () => {
    const result = blockchain.updateState(
      '0x9999999999999999999999999999999999999999' as Address,
      'QmTestCID',
      '0xabcd' as `0x${string}`
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });

  it('should increment state version on each update', () => {
    blockchain.updateState(operator, 'Qm1', '0x1' as `0x${string}`);
    blockchain.updateState(operator, 'Qm2', '0x2' as `0x${string}`);
    blockchain.updateState(operator, 'Qm3', '0x3' as `0x${string}`);

    const state = blockchain.getGameState();
    expect(state.stateVersion).toBe(3);
  });
});

describe('Heartbeat', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
  });

  it('should accept heartbeat from operator', () => {
    const result = blockchain.heartbeat(operator);

    expect(result.success).toBe(true);
  });

  it('should reject heartbeat from non-operator', () => {
    const result = blockchain.heartbeat(
      '0x9999999999999999999999999999999999999999' as Address
    );

    expect(result.success).toBe(false);
  });

  it('should detect operator inactivity after timeout', () => {
    expect(blockchain.isOperatorInactive()).toBe(false);

    // Advance time past heartbeat timeout
    const config = blockchain.getGameConfig();
    const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
    for (let i = 0; i < blocksToSkip; i++) {
      blockchain.mineBlock();
    }

    expect(blockchain.isOperatorInactive()).toBe(true);
  });

  it('should mark inactive operator', () => {
    const config = blockchain.getGameConfig();
    const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
    for (let i = 0; i < blocksToSkip; i++) {
      blockchain.mineBlock();
    }

    const result = blockchain.markOperatorInactive();
    expect(result.success).toBe(true);

    const state = blockchain.getGameState();
    expect(state.operatorActive).toBe(false);
  });
});

describe('Fund Withdrawal', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
  });

  it('should allow operator to withdraw within limit', () => {
    const config = blockchain.getGameConfig();
    const amount = config.dailyWithdrawalLimit / 2n;

    const result = blockchain.withdrawFunds(operator, amount);

    expect(result.success).toBe(true);
    expect(blockchain.getBalance(operator)).toBe(amount);
  });

  it('should reject withdrawal exceeding daily limit', () => {
    const config = blockchain.getGameConfig();
    const amount = config.dailyWithdrawalLimit + 1n;

    const result = blockchain.withdrawFunds(operator, amount);

    expect(result.success).toBe(false);
    expect(result.error).toContain('daily withdrawal limit');
  });

  it('should reject withdrawal from non-operator', () => {
    const result = blockchain.withdrawFunds(
      '0x9999999999999999999999999999999999999999' as Address,
      100n
    );

    expect(result.success).toBe(false);
  });
});

describe('Staking', () => {
  let blockchain: MockBlockchain;
  const staker = '0x1111111111111111111111111111111111111111' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
    blockchain.setBalance(staker, 10000n * 10n ** 18n);
  });

  it('should allow staking', () => {
    const amount = 1000n * 10n ** 18n;
    const result = blockchain.stake(staker, amount);

    expect(result.success).toBe(true);

    const stake = blockchain.getStakeInfo(staker);
    expect(stake?.amount).toBe(amount);
  });

  it('should reject staking more than balance', () => {
    const amount = 20000n * 10n ** 18n;
    const result = blockchain.stake(staker, amount);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient balance');
  });

  it('should track total staked', () => {
    blockchain.stake(staker, 1000n * 10n ** 18n);

    const state = blockchain.getStakingState();
    expect(state.totalStaked).toBe(1000n * 10n ** 18n);
  });
});

describe('Security Council', () => {
  let blockchain: MockBlockchain;
  const members = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
  ] as Address[];

  beforeEach(() => {
    blockchain = new MockBlockchain();
    for (const member of members) {
      blockchain.addCouncilMember(member);
    }
  });

  it('should request key rotation', () => {
    const result = blockchain.requestKeyRotation(members[0]!);

    expect(result.success).toBe(true);
    expect(result.requestId).toBeDefined();
  });

  it('should reject rotation request from non-member', () => {
    const result = blockchain.requestKeyRotation(
      '0x9999999999999999999999999999999999999999' as Address
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not a council member');
  });

  it('should approve and execute rotation with threshold', () => {
    const { requestId } = blockchain.requestKeyRotation(members[0]!);

    const approval1 = blockchain.approveKeyRotation(members[1]!, requestId!);
    expect(approval1.success).toBe(true);
    expect(approval1.executed).toBe(false);

    const approval2 = blockchain.approveKeyRotation(members[2]!, requestId!);
    expect(approval2.success).toBe(true);
    expect(approval2.executed).toBe(true); // 3 of 3 required

    const state = blockchain.getSecurityCouncilState();
    expect(state.currentKeyVersion).toBe(2);
  });
});

describe('Training Records', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
    blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
  });

  it('should record training from operator', () => {
    const result = blockchain.recordTraining(
      operator,
      'QmDatasetCID',
      '0xmodelhash' as `0x${string}`
    );

    expect(result.success).toBe(true);

    const events = blockchain.getEventsByContract('game');
    const trainingEvent = events.find((e) => e.type === 'TrainingRecorded');
    expect(trainingEvent).toBeDefined();
  });

  it('should reject training record from non-operator', () => {
    const result = blockchain.recordTraining(
      '0x9999999999999999999999999999999999999999' as Address,
      'QmDatasetCID',
      '0xmodelhash' as `0x${string}`
    );

    expect(result.success).toBe(false);
  });
});

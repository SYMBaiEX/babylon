/**
 * Mock Blockchain / Contracts Tests
 *
 * Tests the mock blockchain implementation that simulates on-chain
 * game state, operator registration, staking, and security council.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { Address } from 'viem';
import { MockBlockchain } from '../contracts/mock-blockchain.js';

describe('MockBlockchain', () => {
  let blockchain: MockBlockchain;
  const operator = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    blockchain = new MockBlockchain();
  });

  describe('initialization', () => {
    it('starts with no operator registered', () => {
      const state = blockchain.getGameState();
      expect(state.operatorAddress).toBeNull();
      expect(state.operatorActive).toBe(false);
      expect(state.stateVersion).toBe(0);
    });

    it('has initial treasury balance', () => {
      expect(blockchain.getTreasuryBalance()).toBeGreaterThan(0n);
    });
  });

  describe('operator registration', () => {
    it('registers operator with valid proof', () => {
      const result = blockchain.registerOperator(
        operator,
        '0xproof' as `0x${string}`
      );
      expect(result.success).toBe(true);

      const state = blockchain.getGameState();
      expect(state.operatorAddress).toBe(operator);
      expect(state.operatorActive).toBe(true);
    });

    it('rejects duplicate registration', () => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);

      const result = blockchain.registerOperator(
        '0x9999999999999999999999999999999999999999' as Address,
        '0xproof2' as `0x${string}`
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('emits registration event', () => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);

      const events = blockchain.getEventsByContract('game');
      const regEvent = events.find((e) => e.type === 'OperatorRegistered');
      expect(regEvent).toBeDefined();
    });
  });

  describe('state updates', () => {
    beforeEach(() => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
    });

    it('updates state from authorized operator', () => {
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

    it('rejects update from unauthorized address', () => {
      const result = blockchain.updateState(
        '0x9999999999999999999999999999999999999999' as Address,
        'QmTestCID',
        '0xabcd' as `0x${string}`
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authorized');
    });

    it('increments state version on each update', () => {
      blockchain.updateState(operator, 'Qm1', '0x1' as `0x${string}`);
      blockchain.updateState(operator, 'Qm2', '0x2' as `0x${string}`);
      blockchain.updateState(operator, 'Qm3', '0x3' as `0x${string}`);

      expect(blockchain.getGameState().stateVersion).toBe(3);
    });
  });

  describe('heartbeat', () => {
    beforeEach(() => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
    });

    it('accepts heartbeat from operator', () => {
      expect(blockchain.heartbeat(operator).success).toBe(true);
    });

    it('rejects heartbeat from non-operator', () => {
      const result = blockchain.heartbeat(
        '0x9999999999999999999999999999999999999999' as Address
      );
      expect(result.success).toBe(false);
    });

    it('detects inactivity after timeout', () => {
      expect(blockchain.isOperatorInactive()).toBe(false);

      // Advance time past timeout
      const config = blockchain.getGameConfig();
      const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
      for (let i = 0; i < blocksToSkip; i++) {
        blockchain.mineBlock();
      }

      expect(blockchain.isOperatorInactive()).toBe(true);
    });

    it('marks inactive operator', () => {
      const config = blockchain.getGameConfig();
      const blocksToSkip = Math.ceil(config.heartbeatTimeout / 12000) + 1;
      for (let i = 0; i < blocksToSkip; i++) {
        blockchain.mineBlock();
      }

      const result = blockchain.markOperatorInactive();
      expect(result.success).toBe(true);
      expect(blockchain.getGameState().operatorActive).toBe(false);
    });
  });

  describe('fund withdrawal', () => {
    beforeEach(() => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
    });

    it('allows withdrawal within daily limit', () => {
      const config = blockchain.getGameConfig();
      const amount = config.dailyWithdrawalLimit / 2n;

      const result = blockchain.withdrawFunds(operator, amount);

      expect(result.success).toBe(true);
      expect(blockchain.getBalance(operator)).toBe(amount);
    });

    it('rejects withdrawal exceeding daily limit', () => {
      const config = blockchain.getGameConfig();
      const amount = config.dailyWithdrawalLimit + 1n;

      const result = blockchain.withdrawFunds(operator, amount);

      expect(result.success).toBe(false);
      expect(result.error).toContain('daily withdrawal limit');
    });

    it('rejects withdrawal from non-operator', () => {
      const result = blockchain.withdrawFunds(
        '0x9999999999999999999999999999999999999999' as Address,
        100n
      );
      expect(result.success).toBe(false);
    });
  });

  describe('staking', () => {
    const staker = '0x1111111111111111111111111111111111111111' as Address;

    beforeEach(() => {
      blockchain.setBalance(staker, 10000n * 10n ** 18n);
    });

    it('allows staking', () => {
      const amount = 1000n * 10n ** 18n;
      const result = blockchain.stake(staker, amount);

      expect(result.success).toBe(true);
      expect(blockchain.getStakeInfo(staker)?.amount).toBe(amount);
    });

    it('rejects staking more than balance', () => {
      const result = blockchain.stake(staker, 20000n * 10n ** 18n);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('tracks total staked', () => {
      blockchain.stake(staker, 1000n * 10n ** 18n);
      expect(blockchain.getStakingState().totalStaked).toBe(1000n * 10n ** 18n);
    });
  });

  describe('security council', () => {
    const members = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ] as Address[];

    beforeEach(() => {
      for (const member of members) {
        blockchain.addCouncilMember(member);
      }
    });

    it('allows council member to request key rotation', () => {
      const result = blockchain.requestKeyRotation(members[0]!);
      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });

    it('rejects rotation request from non-member', () => {
      const result = blockchain.requestKeyRotation(
        '0x9999999999999999999999999999999999999999' as Address
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a council member');
    });

    it('executes rotation when threshold reached', () => {
      const { requestId } = blockchain.requestKeyRotation(members[0]!);

      const approval1 = blockchain.approveKeyRotation(members[1]!, requestId!);
      expect(approval1.success).toBe(true);
      expect(approval1.executed).toBe(false);

      const approval2 = blockchain.approveKeyRotation(members[2]!, requestId!);
      expect(approval2.success).toBe(true);
      expect(approval2.executed).toBe(true); // 3 of 3 required

      expect(blockchain.getSecurityCouncilState().currentKeyVersion).toBe(2);
    });
  });

  describe('training records', () => {
    beforeEach(() => {
      blockchain.registerOperator(operator, '0xproof' as `0x${string}`);
    });

    it('records training from operator', () => {
      const result = blockchain.recordTraining(
        operator,
        'QmDatasetCID',
        '0xmodelhash' as `0x${string}`
      );
      expect(result.success).toBe(true);

      const events = blockchain.getEventsByContract('game');
      expect(events.find((e) => e.type === 'TrainingRecorded')).toBeDefined();
    });

    it('rejects training record from non-operator', () => {
      const result = blockchain.recordTraining(
        '0x9999999999999999999999999999999999999999' as Address,
        'QmDatasetCID',
        '0xmodelhash' as `0x${string}`
      );
      expect(result.success).toBe(false);
    });
  });
});

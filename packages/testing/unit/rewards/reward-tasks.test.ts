import { describe, expect, it } from 'bun:test';
import { POINTS } from '@babylon/shared';
import { buildRewardTasks } from '../../../../apps/web/src/app/rewards/reward-tasks';

describe('buildRewardTasks', () => {
  it('returns no tasks when user data is missing', () => {
    expect(buildRewardTasks(null)).toEqual([]);
  });

  it('contains only profile, wallet, and on-chain tasks', () => {
    const tasks = buildRewardTasks({
      username: null,
      profileImageUrl: null,
      bio: null,
      pointsAwardedForProfile: false,
      walletAddress: null,
      pointsAwardedForWallet: false,
      onChainRegistered: false,
    });

    expect(tasks.map((task) => task.id)).toEqual([
      'profile',
      'wallet',
      'onchain-registration',
    ]);
    expect(tasks.some((task) => task.title.includes('X'))).toBe(false);
    expect(tasks.some((task) => task.title.includes('Farcaster'))).toBe(false);
  });

  it('builds expected metadata for completed user profile and wallet', () => {
    const tasks = buildRewardTasks({
      username: 'lucas',
      profileImageUrl: 'https://example.com/avatar.png',
      bio: 'A'.repeat(60),
      pointsAwardedForProfile: true,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      pointsAwardedForWallet: true,
      onChainRegistered: true,
    });

    expect(tasks[0]).toEqual({
      id: 'profile',
      title: 'Complete Profile',
      description: 'Username, image, and bio complete! ✓',
      points: POINTS.PROFILE_COMPLETION,
      completed: true,
      action: 'profile-settings',
    });

    expect(tasks[1]).toEqual({
      id: 'wallet',
      title: 'Connect Wallet',
      description: '0x1234...5678',
      points: POINTS.WALLET_CONNECT,
      completed: true,
      action: 'wallet-connect',
    });
  });
});

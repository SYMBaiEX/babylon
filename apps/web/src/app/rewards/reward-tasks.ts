import { POINTS } from '@babylon/shared';

export interface RewardsTaskUserState {
  username: string | null;
  profileImageUrl: string | null;
  bio: string | null;
  pointsAwardedForProfile: boolean;
  walletAddress: string | null;
  pointsAwardedForWallet: boolean;
  onChainRegistered: boolean;
}

export type RewardTaskAction =
  | 'profile-settings'
  | 'wallet-connect'
  | 'register-onchain';

export interface RewardTaskDefinition {
  id: 'profile' | 'wallet' | 'onchain-registration';
  title: string;
  description: string;
  points: number;
  completed: boolean;
  action: RewardTaskAction;
}

export function buildRewardTasks(
  user: RewardsTaskUserState | null
): RewardTaskDefinition[] {
  if (!user) return [];

  return [
    {
      id: 'profile',
      title: 'Complete Profile',
      description: (() => {
        if (user.pointsAwardedForProfile) {
          return 'Username, image, and bio complete! ✓';
        }
        const missing: string[] = [];
        if (!user.username) missing.push('username');
        if (!user.profileImageUrl) missing.push('image');
        if (!user.bio || user.bio.length < 50) missing.push('bio (50+ chars)');
        return `Set ${missing.join(', ')}`;
      })(),
      points: POINTS.PROFILE_COMPLETION,
      completed: user.pointsAwardedForProfile,
      action: 'profile-settings',
    },
    {
      id: 'wallet',
      title: 'Connect Wallet',
      description: user.walletAddress
        ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
        : 'Link your wallet',
      points: POINTS.WALLET_CONNECT,
      completed: user.pointsAwardedForWallet,
      action: 'wallet-connect',
    },
    {
      id: 'onchain-registration',
      title: 'Register On-Chain',
      description: user.onChainRegistered
        ? 'ERC-8004 verified identity ✓'
        : 'Get verified with ERC-8004 on Ethereum',
      points: -POINTS.ONCHAIN_REGISTRATION,
      completed: user.onChainRegistered,
      action: 'register-onchain',
    },
  ];
}

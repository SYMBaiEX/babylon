import type { PrivyClientConfig } from '@privy-io/react-auth';

import { CHAIN } from '@/constants/chains';

/**
 * Extended Privy client config that includes "system" theme support
 * Privy supports "system" theme at runtime, but the types don't reflect this yet
 */
type ExtendedAppearance = Omit<
  NonNullable<PrivyClientConfig['appearance']>,
  'theme'
> & {
  theme?: 'light' | 'dark' | `#${string}` | 'system';
};

export interface ExtendedPrivyClientConfig
  extends Omit<PrivyClientConfig, 'appearance' | 'embeddedWallets'> {
  appearance?: ExtendedAppearance;
  embeddedWallets?: {
    ethereum?: {
      createOnLogin?: 'all-users' | 'users-without-wallets' | 'off';
    };
    solana?: {
      createOnLogin?: 'all-users' | 'users-without-wallets' | 'off';
    };
    disableAutomaticMigration?: boolean;
    showWalletUIs?: boolean;
  };
}

// Privy configuration
export const privyConfig: {
  appId: string;
  config: ExtendedPrivyClientConfig;
} = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'dark' as const,
      accentColor: '#1c9cf0',
      logo: '/assets/logos/logo.svg',
      showWalletLoginFirst: false,
      walletList: [
        'metamask',
        'rabby_wallet',
        'detected_wallets',
        'rainbow',
        'coinbase_wallet',
        'wallet_connect',
      ],
      walletChainType: 'ethereum-only' as const,
    } satisfies ExtendedAppearance,
    loginMethods: ['farcaster', 'wallet', 'email'],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'all-users' as const,
      },
    },
    defaultChain: CHAIN,
    supportedChains: [CHAIN],
    walletConnectCloudProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
};

/**
 * Privy Configuration
 * 
 * @description Configuration for Privy authentication and wallet management.
 * Includes theme settings, login methods, embedded wallet configuration, and
 * supported blockchain networks. Optimized for Farcaster Mini Apps compatibility
 * with manual embedded wallet creation and Farcaster-first login.
 */

import type { PrivyClientConfig } from '@privy-io/react-auth';

import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

/**
 * Extended Privy appearance config with system theme support
 * 
 * @description Privy supports "system" theme at runtime, but the types don't
 * reflect this yet. This type extends the appearance config to include system theme
 * for automatic light/dark mode switching.
 */
type ExtendedAppearance = Omit<
  NonNullable<PrivyClientConfig['appearance']>,
  'theme'
> & {
  theme?: 'light' | 'dark' | `#${string}` | 'system';
};

/**
 * Extended Privy Client Configuration
 * 
 * @description Extended Privy configuration with system theme support and
 * custom embedded wallet settings for Farcaster Mini Apps compatibility. Allows
 * manual embedded wallet creation and Farcaster-first login flow.
 */
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

/**
 * Privy configuration object
 * 
 * @description Complete Privy configuration with app ID and client settings.
 * Configured for Farcaster-first login, Base Sepolia default chain, and manual
 * embedded wallet creation for Mini Apps compatibility. Uses system theme for
 * automatic light/dark mode.
 */
export const privyConfig: {
  appId: string;
  config: ExtendedPrivyClientConfig;
} = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'system',
      accentColor: '#0066FF',
      logo: '/assets/logos/logo.svg',
      showWalletLoginFirst: false, // Changed to false to prioritize Farcaster
      walletList: [
        'metamask',
        'rabby_wallet',
        'detected_wallets',
        'rainbow',
        'coinbase_wallet',
      ],
      walletChainType: 'ethereum-only' as const,
    } satisfies ExtendedAppearance,
    // Prioritize Farcaster login for Mini Apps
    // Reference: https://docs.privy.io/recipes/farcaster/mini-apps
    loginMethods: ['farcaster', 'wallet', 'email'],
    embeddedWallets: {
      // Embedded wallets are created manually post-auth (see FarcasterFrameProvider)
      // Automatic creation is disabled to stay compatible with Farcaster Mini Apps
      ethereum: {
        createOnLogin: 'off' as const,
      },
      // Explicitly disable Solana to prevent warnings
      solana: {
        createOnLogin: 'off' as const,
      },
    },
    defaultChain: baseSepolia,
    // Wallet configuration - supports all chains including Base L2
    supportedChains: [base, baseSepolia, mainnet, sepolia],
    // WalletConnect configuration removed - configure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env if needed
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && {
      walletConnectCloudProjectId:
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    }),
  },
};

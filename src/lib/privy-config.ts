import { http } from 'viem'
import { mainnet, sepolia, base, baseSepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import type { PrivyClientConfig } from '@privy-io/react-auth'

/**
 * Extended Privy client config that includes "system" theme support
 * Privy supports "system" theme at runtime, but the types don't reflect this yet
 */
type ExtendedAppearance = Omit<NonNullable<PrivyClientConfig['appearance']>, 'theme'> & {
  theme?: 'light' | 'dark' | `#${string}` | 'system'
}

export interface ExtendedPrivyClientConfig extends Omit<PrivyClientConfig, 'appearance' | 'embeddedWallets'> {
  appearance?: ExtendedAppearance
  embeddedWallets?: {
    ethereum?: {
      createOnLogin?: 'all-users' | 'users-without-wallets' | 'off'
    }
    solana?: {
      createOnLogin?: 'all-users' | 'users-without-wallets' | 'off'
    }
    disableAutomaticMigration?: boolean
    showWalletUIs?: boolean
  }
}

// Environment configuration
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 8453 // Default to Base mainnet
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || ''

// Chain selection based on CHAIN_ID
const getSelectedChain = () => {
  switch (chainId) {
    case 11155111: return sepolia
    case 1: return mainnet
    case 84532: return baseSepolia
    case 8453: return base
    default: return base
  }
}

const selectedChain = getSelectedChain()

// Wagmi configuration for Privy with Base L2 support
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, mainnet, sepolia],
  transports: {
    [base.id]: http(rpcUrl || 'https://mainnet.base.org'),
    [baseSepolia.id]: http(rpcUrl || 'https://sepolia.base.org'),
    [mainnet.id]: http(rpcUrl || undefined),
    [sepolia.id]: http(rpcUrl || undefined),
  },
})

// Privy configuration
export const privyConfig: {
  appId: string
  config: ExtendedPrivyClientConfig
} = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'dark' as const,
      accentColor: '#0066FF',
      logo: '/assets/logos/logo.svg',
      showWalletLoginFirst: false, // Changed to false to prioritize Farcaster
      walletList: ['metamask', 'rabby_wallet', 'detected_wallets', 'rainbow', 'coinbase_wallet', 'wallet_connect'],
      walletChainType: 'ethereum-only' as const,
    } satisfies ExtendedAppearance,
    // Prioritize Farcaster login for Mini Apps
    // Reference: https://docs.privy.io/recipes/farcaster/mini-apps
    loginMethods: ['farcaster', 'wallet', 'email'],
    embeddedWallets: {
      // Note: Automatic embedded wallet creation is not supported for Farcaster Mini Apps
      // Wallets are created manually or use the injected Farcaster/Base App wallet
      ethereum: {
        createOnLogin: 'off' as const, // Changed from 'users-without-wallets' for Mini Apps
      },
    },
    defaultChain: selectedChain,
    // Wallet configuration - supports all chains including Base L2
    supportedChains: [base, baseSepolia, mainnet, sepolia],
    // WalletConnect configuration for mobile wallets
    walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
}

import { http } from 'viem'
import { mainnet, sepolia, base, baseSepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import type { PrivyClientConfig } from '@privy-io/react-auth'

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
export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'dark' as const,
      accentColor: '#1c9cf0' as const,
      logo: '/assets/logos/logo.svg',
      showWalletLoginFirst: false, // Changed to false to prioritize Farcaster
      walletList: ['metamask', 'rabby_wallet', 'detected_wallets', 'rainbow', 'coinbase_wallet', 'wallet_connect'],
      walletChainType: 'ethereum-only' as const,
    },
    // Prioritize Farcaster login, then wallet, then email
    loginMethods: ['farcaster', 'wallet', 'email'] as PrivyClientConfig['loginMethods'],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'users-without-wallets' as const,
      },
    },
    defaultChain: selectedChain,
    // Wallet configuration - supports all chains including Base L2
    supportedChains: [base, baseSepolia, mainnet, sepolia],
    // WalletConnect configuration for mobile wallets
    walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
}

import { http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'
import type { PrivyClientConfig } from '@privy-io/react-auth'

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 1
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || ''

// Select chain based on CHAIN_ID
const selectedChain = chainId === 11155111 ? sepolia : mainnet

// Wagmi configuration for Privy
export const wagmiConfig = createConfig({
  chains: [selectedChain],
  transports: {
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
      showWalletLoginFirst: true,
      walletList: ['metamask', 'rabby_wallet', 'detected_wallets', 'rainbow', 'coinbase_wallet', 'wallet_connect'],
      walletChainType: 'ethereum-only' as const,
    },
    // Prioritize EVM wallet login (Metamask, Rabby, etc.)
    loginMethods: ['wallet', 'email'] as PrivyClientConfig['loginMethods'],
    embeddedWallets: {
      ethereum: {
        createOnLogin: 'users-without-wallets' as const,
      },
    },
    defaultChain: selectedChain,
    // Wallet configuration - supports all injected wallets including Rabby
    supportedChains: [mainnet, sepolia],
    // WalletConnect configuration for mobile wallets
    walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
}

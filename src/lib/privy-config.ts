import { http } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

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
      accentColor: '#1c9cf0',
      logo: '/assets/logos/logo.svg',
    },
    loginMethods: ['wallet', 'email'] as const,
    embeddedWallets: {
      createOnLogin: 'users-without-wallets' as const,
    },
  },
}

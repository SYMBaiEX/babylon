'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, Fragment, useMemo } from 'react'
import { privyConfig } from '@/lib/privy-config'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { FontSizeProvider } from '@/contexts/FontSizeContext'
import { GamePlaybackManager } from './GamePlaybackManager'
import { http } from 'viem'
import { mainnet, sepolia, base, baseSepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // Create wagmi config inside component to avoid SSR issues
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [base, baseSepolia, mainnet, sepolia],
        transports: {
          [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
          [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'),
          [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
          [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
        },
      }),
    []
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent hydration issues by only rendering Privy+Wagmi on client
  if (!mounted) {
    return (
      <div suppressHydrationWarning>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        <FontSizeProvider>
          <PrivyProvider
            appId={privyConfig.appId}
            config={privyConfig.config as any}
          >
            <QueryClientProvider client={queryClient}>
              <GamePlaybackManager />
              <Fragment>{children}</Fragment>
            </QueryClientProvider>
          </PrivyProvider>
        </FontSizeProvider>
      </ThemeProvider>
      </div>
    )
  }

  return (
    <div suppressHydrationWarning>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        <FontSizeProvider>
          <PrivyProvider
            appId={privyConfig.appId}
            config={privyConfig.config as any}
          >
            <QueryClientProvider client={queryClient}>
              <GamePlaybackManager />
              <WagmiProvider config={wagmiConfig}>
                <Fragment>{children}</Fragment>
              </WagmiProvider>
            </QueryClientProvider>
          </PrivyProvider>
        </FontSizeProvider>
      </ThemeProvider>
    </div>
  )
}

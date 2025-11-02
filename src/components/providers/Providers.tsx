'use client'

import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, Fragment, useMemo, Suspense } from 'react'
import { privyConfig } from '@/lib/privy-config'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { FontSizeProvider } from '@/contexts/FontSizeContext'
import { GamePlaybackManager } from './GamePlaybackManager'
import { ReferralCaptureProvider } from './ReferralCaptureProvider'
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

  // Check if Privy is configured (for build-time safety)
  const hasPrivyConfig = privyConfig.appId && privyConfig.appId !== ''

  useEffect(() => {
    setMounted(true)
  }, [])

  // Render without Privy if not configured (for build-time)
  if (!hasPrivyConfig) {
    return (
      <div suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <FontSizeProvider>
            <QueryClientProvider client={queryClient}>
              <GamePlaybackManager />
              {mounted ? (
                <Fragment>{children}</Fragment>
              ) : (
                <div className="min-h-screen bg-sidebar" />
              )}
            </QueryClientProvider>
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
          <QueryClientProvider client={queryClient}>
            <GamePlaybackManager />
            <PrivyProvider
              appId={privyConfig.appId}
              config={privyConfig.config as PrivyClientConfig}
            >
              <WagmiProvider config={wagmiConfig}>
                {/* Capture referral code from URL if present */}
                <Suspense fallback={null}>
                  <ReferralCaptureProvider />
                </Suspense>
                {mounted ? (
                  <Fragment>{children}</Fragment>
                ) : (
                  <div className="min-h-screen bg-sidebar" />
                )}
              </WagmiProvider>
            </PrivyProvider>
          </QueryClientProvider>
        </FontSizeProvider>
      </ThemeProvider>
    </div>
  )
}

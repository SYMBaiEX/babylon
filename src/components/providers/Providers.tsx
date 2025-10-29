'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { privyConfig, wagmiConfig } from '@/lib/privy-config'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { FontSizeProvider } from '@/contexts/FontSizeContext'
import { GamePlaybackManager } from './GamePlaybackManager'

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
            config={privyConfig.config}
          >
            <QueryClientProvider client={queryClient}>
              <GamePlaybackManager />
              {children}
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
            config={privyConfig.config}
          >
            <QueryClientProvider client={queryClient}>
              <GamePlaybackManager />
              <WagmiProvider config={wagmiConfig}>
                {children}
              </WagmiProvider>
            </QueryClientProvider>
          </PrivyProvider>
        </FontSizeProvider>
      </ThemeProvider>
    </div>
  )
}

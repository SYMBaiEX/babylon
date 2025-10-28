'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { privyConfig, wagmiConfig } from '@/lib/privy-config'
import { ThemeProvider } from '@/components/shared/ThemeProvider'

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
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          <PrivyProvider
            appId={privyConfig.appId}
            config={privyConfig.config}
          >
            <QueryClientProvider client={queryClient}>
              {children}
            </QueryClientProvider>
          </PrivyProvider>
        </ThemeProvider>
      </div>
    )
  }

  return (
    <div suppressHydrationWarning>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange={false}
      >
        <PrivyProvider
          appId={privyConfig.appId}
          config={privyConfig.config}
        >
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              {children}
            </WagmiProvider>
          </QueryClientProvider>
        </PrivyProvider>
      </ThemeProvider>
    </div>
  )
}

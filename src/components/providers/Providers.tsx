'use client';

import { Suspense, useEffect, useState, Fragment } from 'react';

import { type PrivyClientConfig, PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { mainnet, sepolia, base, baseSepolia } from 'viem/chains';
import { createConfig } from 'wagmi';

import { ThemeProvider } from '@/components/shared/ThemeProvider';
import { privyConfig } from '@/lib/privy-config';
import { FontSizeProvider } from '@/contexts/FontSizeContext';
import { WidgetRefreshProvider } from '@/contexts/WidgetRefreshContext';

import { GamePlaybackManager } from './GamePlaybackManager';
import { OnboardingProvider } from './OnboardingProvider';
import { ReferralCaptureProvider } from './ReferralCaptureProvider';
import { FarcasterFrameProvider } from './FarcasterFrameProvider';
import { PostHogProvider } from './PostHogProvider';
import { PostHogIdentifier } from '@/components/analytics/PostHogIdentifier';
import { PostHogErrorBoundary } from '@/components/analytics/PostHogErrorBoundary';

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, base, baseSepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

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
  );

  // Check if Privy is configured (for build-time safety)
  const hasPrivyConfig = privyConfig.appId && privyConfig.appId !== '';

  useEffect(() => {
    setMounted(true);
  }, []);

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
              <WidgetRefreshProvider>
                {mounted ? (
                  <Fragment>{children}</Fragment>
                ) : (
                  <div className="min-h-screen bg-sidebar" />
                )}
              </WidgetRefreshProvider>
            </QueryClientProvider>
          </FontSizeProvider>
        </ThemeProvider>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning>
      <PostHogErrorBoundary>
        <PostHogProvider>
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
                    <FarcasterFrameProvider>
                      {/* PostHog user identification */}
                      <PostHogIdentifier />
                      {/* Capture referral code from URL if present */}
                      <Suspense fallback={null}>
                        <ReferralCaptureProvider />
                      </Suspense>
                      {/* Onboarding provider for username setup */}
                      <OnboardingProvider>
                        <WidgetRefreshProvider>
                          {mounted ? (
                            <Fragment>{children}</Fragment>
                          ) : (
                            <div className="min-h-screen bg-sidebar" />
                          )}
                        </WidgetRefreshProvider>
                      </OnboardingProvider>
                    </FarcasterFrameProvider>
                  </WagmiProvider>
                </PrivyProvider>
              </QueryClientProvider>
            </FontSizeProvider>
          </ThemeProvider>
        </PostHogProvider>
      </PostHogErrorBoundary>
    </div>
  );
}

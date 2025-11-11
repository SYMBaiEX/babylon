'use client';

import { Fragment, Suspense, useEffect, useState } from 'react';

import { type PrivyClientConfig, PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '@/components/shared/ThemeProvider';

import { privyConfig } from '@/lib/privy-config';

import { FontSizeProvider } from '@/contexts/FontSizeContext';
import { WidgetRefreshProvider } from '@/contexts/WidgetRefreshContext';

import { FarcasterFrameProvider } from './FarcasterFrameProvider';
import { GamePlaybackManager } from './GamePlaybackManager';
import { OnboardingProvider } from './OnboardingProvider';
import { PostHogErrorBoundary } from '@/components/analytics/PostHogErrorBoundary';
import { PostHogIdentifier } from '@/components/analytics/PostHogIdentifier';
import { ReferralCaptureProvider } from './ReferralCaptureProvider';

import { PostHogProvider } from './PostHogProvider';

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
        <Suspense fallback={null}>
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
                    <SmartWalletsProvider>
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
                    </SmartWalletsProvider>
                  </PrivyProvider>
                </QueryClientProvider>
              </FontSizeProvider>
            </ThemeProvider>
          </PostHogProvider>
        </Suspense>
      </PostHogErrorBoundary>
    </div>
  );
}

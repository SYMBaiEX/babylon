'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ComingSoon } from '@/components/shared/ComingSoon';
import { PageContainer } from '@/components/shared/PageContainer';
import {
  FeedSkeleton,
  Skeleton,
  WidgetPanelSkeleton,
} from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useLoginModal } from '@/hooks/useLoginModal';

const waitlistModeEnabled = process.env.NEXT_PUBLIC_WAITLIST_MODE === 'true';

function HomePageContent() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();
  const { showLoginModal } = useLoginModal();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Skip redirect logic if waitlist mode is enabled
    if (waitlistModeEnabled) {
      return;
    }

    // Wait for Privy to be ready before deciding to show login modal
    // This prevents the modal from flashing on every page load
    if (!ready) {
      return;
    }

    // Show login modal if not authenticated
    if (!authenticated) {
      showLoginModal({
        title: 'Welcome to Babylon',
        message:
          'Log in to start trading prediction markets, replying to NPCs, and earning rewards in this satirical game.',
      });
    }

    // Redirect to feed, preserving referral code if present
    const ref = searchParams.get('ref');
    const feedUrl = ref ? `/feed?ref=${encodeURIComponent(ref)}` : '/feed';
    router.push(feedUrl);
  }, [ready, authenticated, router, showLoginModal, searchParams]);

  // Show coming soon page if WAITLIST_MODE is enabled
  if (waitlistModeEnabled) {
    return <ComingSoon />;
  }

  // Show feed skeleton while redirecting
  return <FeedLayoutSkeleton />;
}

function FeedLayoutSkeleton() {
  return (
    <PageContainer noPadding className="flex w-full flex-col">
      <div className="relative flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-[rgba(120,120,120,0.15)] lg:border-r lg:border-l">
          <div className="sticky top-0 z-10 flex-shrink-0 bg-background shadow-sm">
            <div className="flex w-full items-center border-border border-b">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-1 py-3.5 text-center">
                  <Skeleton className="mx-auto h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-background">
            <div className="w-full lg:mx-auto lg:max-w-[700px]">
              <FeedSkeleton />
            </div>
          </div>
        </div>
        <div className="hidden w-96 flex-none flex-col gap-8 px-4 py-6 xl:flex">
          <WidgetPanelSkeleton />
          <WidgetPanelSkeleton />
        </div>
      </div>
    </PageContainer>
  );
}

export function HomePageClient() {
  return (
    <Suspense fallback={<FeedLayoutSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}

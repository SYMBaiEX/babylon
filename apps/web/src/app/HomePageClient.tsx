'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ComingSoon } from '@/components/shared/ComingSoon';
import { Skeleton } from '@/components/shared/Skeleton';
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

  // Show loading while redirecting to feed
  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-3">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}

export function HomePageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="space-y-3">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}

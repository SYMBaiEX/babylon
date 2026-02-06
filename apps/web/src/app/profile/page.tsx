'use client';

import { extractUsername } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer } from '@/components/shared/PageContainer';
import { ProfileHeaderSkeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';

/**
 * Canonical profile route: all profile views are handled by `/profile/[id]`.
 *
 * This route exists as a stable "My Profile" entry point (Sidebar, etc.) and
 * redirects to the username- or id-based profile page to avoid UI drift between
 * `/profile` and `/profile/[id]`.
 */
export default function ProfileRootRedirectPage() {
  const router = useRouter();
  const { ready, authenticated, user, login } = useAuth();

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !user?.id) {
      router.replace('/feed');
      // Match previous behavior: trigger login shortly after redirecting.
      const timer = window.setTimeout(() => login(), 500);
      return () => window.clearTimeout(timer);
    }

    const identifier = user.username ? extractUsername(user.username) : user.id;

    router.replace(`/profile/${encodeURIComponent(identifier)}`);
    return undefined;
  }, [ready, authenticated, user?.id, user?.username, router, login]);

  return (
    <PageContainer noPadding className="min-h-screen">
      <div className="mx-auto w-full max-w-[700px]">
        <ProfileHeaderSkeleton />
      </div>
    </PageContainer>
  );
}

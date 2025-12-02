'use client';

import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';

export default function FeedLoading() {
  return (
    <PageContainer
      noPadding
      className="flex min-h-screen w-full flex-col overflow-visible"
    >
      {/* Centered loading state */}
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-4">
        <Skeleton className="h-32 w-full max-w-2xl" />
        <Skeleton className="h-32 w-full max-w-2xl" />
        <Skeleton className="h-32 w-full max-w-2xl" />
      </div>
    </PageContainer>
  );
}

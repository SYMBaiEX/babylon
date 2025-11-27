import { PageContainer } from '@/components/shared/PageContainer';
import { LeaderboardSkeleton, Skeleton } from '@/components/shared/Skeleton';

export default function LeaderboardLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop */}
      <div className="hidden flex-1 flex-col overflow-hidden sm:flex">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
            {/* Header */}
            <div className="mb-4 flex items-center gap-2 px-4 pt-4">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>

            {/* Leaderboard List */}
            <LeaderboardSkeleton count={15} />
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col overflow-hidden sm:hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-4 sm:px-6">
            {/* Header */}
            <div className="mb-4 flex items-center gap-2 pt-4 pb-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>

            {/* Leaderboard List */}
            <LeaderboardSkeleton count={10} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

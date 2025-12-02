import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';

export default function PerpDetailLoading() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-8 w-32 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border bg-card/50 p-4 backdrop-blur"
            >
              <Skeleton className="h-3 w-16 max-w-full" />
              <Skeleton className="h-6 w-24 max-w-full" />
            </div>
          ))}
        </div>

        {/* Chart Section */}
        <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
          <Skeleton className="h-64 w-full rounded-lg sm:h-96" />
        </div>

        {/* Trading Section */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Order Form */}
          <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6 lg:col-span-2">
            <div className="flex gap-2">
              <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
              <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

          {/* Order Book */}
          <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
            <Skeleton className="mb-4 h-5 w-24 max-w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>

        {/* Positions Table */}
        <div className="space-y-4 overflow-x-auto rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
          <Skeleton className="h-6 w-32 max-w-full" />
          <div className="min-w-[500px] space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded bg-muted/30 p-3 sm:gap-4"
              >
                <Skeleton className="h-4 w-20 sm:w-24" />
                <Skeleton className="h-4 w-16 sm:w-20" />
                <Skeleton className="h-4 w-16 sm:w-20" />
                <Skeleton className="h-4 w-20 sm:w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

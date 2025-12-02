import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';

export default function PredictionDetailLoading() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 sm:px-0">
        {/* Header */}
        <div className="space-y-3">
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-3/4 max-w-full" />
        </div>

        {/* Price Chart Section */}
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 max-w-full" />
              <Skeleton className="h-6 w-20 max-w-full sm:h-8" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 max-w-full" />
              <Skeleton className="h-6 w-20 max-w-full sm:h-8" />
            </div>
          </div>

          {/* Chart placeholder */}
          <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
        </div>

        {/* Trading Section */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>

        {/* Market Info */}
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
          <Skeleton className="h-6 w-32 max-w-full" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-3 py-2">
                <Skeleton className="h-4 w-24 max-w-full" />
                <Skeleton className="h-4 w-32 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

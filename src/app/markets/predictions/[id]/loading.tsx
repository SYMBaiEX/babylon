import { PageContainer } from '@/components/shared/PageContainer'
import { Skeleton } from '@/components/shared/Skeleton'

export default function PredictionDetailLoading() {
  return (
    <PageContainer>
      <div className="w-full max-w-4xl mx-auto space-y-6 px-4 sm:px-0">
        {/* Header */}
        <div className="space-y-3">
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-3/4 max-w-full" />
        </div>

        {/* Price Chart Section */}
        <div className="bg-card/50 backdrop-blur rounded-lg p-4 sm:p-6 border border-border space-y-4">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 max-w-full" />
              <Skeleton className="h-6 sm:h-8 w-20 max-w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16 max-w-full" />
              <Skeleton className="h-6 sm:h-8 w-20 max-w-full" />
            </div>
          </div>
          
          {/* Chart placeholder */}
          <Skeleton className="h-48 sm:h-64 w-full rounded-lg" />
        </div>

        {/* Trading Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>

        {/* Market Info */}
        <div className="bg-card/50 backdrop-blur rounded-lg p-4 sm:p-6 border border-border space-y-4">
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
  )
}


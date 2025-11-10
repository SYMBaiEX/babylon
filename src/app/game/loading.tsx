import { PageContainer } from '@/components/shared/PageContainer'
import { Skeleton } from '@/components/shared/Skeleton'

export default function GameLoading() {
  return (
    <PageContainer>
      <div className="w-full max-w-6xl mx-auto space-y-6 px-4 sm:px-0">
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        {/* Game Controls */}
        <div className="flex gap-3 sm:gap-4 flex-wrap">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>

        {/* Game Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card/50 backdrop-blur rounded-lg p-4 sm:p-6 border border-border space-y-2">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="h-6 sm:h-8 w-32 max-w-full" />
            </div>
          ))}
        </div>

        {/* Game Content */}
        <div className="bg-card/50 backdrop-blur rounded-lg p-4 sm:p-6 border border-border">
          <Skeleton className="h-64 sm:h-96 w-full rounded-lg" />
        </div>
      </div>
    </PageContainer>
  )
}


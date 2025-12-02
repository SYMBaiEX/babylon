import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton, WidgetPanelSkeleton } from '@/components/shared/Skeleton';

export default function MarketsLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop: Content + Widgets layout */}
      <div className="hidden flex-1 overflow-hidden xl:flex">
        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 z-10 shrink-0 bg-background shadow-sm">
            <div className="space-y-3 px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
              {/* Tabs */}
              <div className="scrollbar-hide flex gap-0 overflow-x-auto">
                {['Dashboard', 'Perps', 'Predictions', 'Pools'].map((tab) => (
                  <div key={tab} className="flex-1 px-3 py-2.5 sm:px-4">
                    <Skeleton className="mx-auto h-5 w-20" />
                  </div>
                ))}
              </div>

              {/* Wallet Balance placeholder */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
          </div>

          {/* Content - Dashboard layout */}
          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-3">
            {/* Two-column grid for trending sections */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Trending Perpetuals */}
              <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 backdrop-blur">
                <div className="mb-3 flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-40" />
                </div>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Skeleton className="mb-1 h-4 w-16" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <div className="ml-3 text-right">
                          <Skeleton className="mb-1 h-4 w-20" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hot Predictions */}
              <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 backdrop-blur">
                <div className="mb-3 flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-lg bg-muted/30 p-3">
                      <Skeleton className="mb-2 h-4 w-full" />
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Full-width section for pools */}
            <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 backdrop-blur">
              <div className="mb-3 flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-48" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-lg bg-muted/30 px-4 py-3">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex-1">
                        <Skeleton className="mb-1 h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <div className="flex gap-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Widget Sidebar */}
        <div className="w-96 shrink-0 space-y-4 bg-sidebar px-4 py-3">
          {/* Market Overview Panel */}
          <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="border-border border-t pt-2">
                <div className="mb-2 flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          </div>

          {/* Top Movers Panel */}
          <div className="rounded-2xl border border-border bg-card/50 px-4 py-3 backdrop-blur">
            <Skeleton className="mb-3 h-6 w-28" />

            {/* Top Gainers */}
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-1.5"
                  >
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-4 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="ml-2 text-right">
                      <Skeleton className="mb-1 h-4 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-1.5"
                  >
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-4 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="ml-2 text-right">
                      <Skeleton className="mb-1 h-4 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex flex-1 flex-col overflow-hidden xl:hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 shrink-0 bg-background shadow-sm">
          <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
            {/* Tabs */}
            <div className="scrollbar-hide flex gap-0 overflow-x-auto">
              {['Dashboard', 'Perps', 'Predictions', 'Pools'].map((tab) => (
                <div key={tab} className="flex-1 px-3 py-2.5 sm:px-4">
                  <Skeleton className="mx-auto h-5 w-16" />
                </div>
              ))}
            </div>

            {/* Wallet Balance placeholder */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </div>

        {/* Content - Dashboard layout */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Trending sections */}
          <WidgetPanelSkeleton />
          <WidgetPanelSkeleton />

          {/* Pools section */}
          <WidgetPanelSkeleton />
        </div>
      </div>
    </PageContainer>
  );
}

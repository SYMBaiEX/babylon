import { PageContainer } from '@/components/shared/PageContainer';
import { FeedSkeleton, Skeleton } from '@/components/shared/Skeleton';

export default function TrendingTagLoading() {
  return (
    <PageContainer noPadding className="flex min-h-screen flex-col">
      {/* Desktop */}
      <div className="hidden flex-1 lg:flex">
        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col border-[rgba(120,120,120,0.5)] border-r border-l">
          {/* Header */}
          <div className="sticky top-0 z-10 border-border/5 border-b bg-background p-4 shadow-sm sm:p-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48 max-w-full" />
              <Skeleton className="h-4 w-32 max-w-full" />
            </div>
          </div>

          {/* Posts */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[700px]">
              <FeedSkeleton count={8} />
            </div>
          </div>
        </div>

        {/* Right: Widget placeholder */}
        <div className="w-80 shrink-0 border-border/5 border-l bg-background xl:w-96" />
      </div>

      {/* Mobile/Tablet */}
      <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 border-border/5 border-b bg-background p-4 shadow-sm">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
        </div>

        {/* Posts */}
        <div className="flex-1 overflow-y-auto">
          <FeedSkeleton count={6} />
        </div>
      </div>
    </PageContainer>
  );
}

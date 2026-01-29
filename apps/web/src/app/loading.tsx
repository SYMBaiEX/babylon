import { PageContainer } from '@/components/shared/PageContainer';
import {
  FeedSkeleton,
  Skeleton,
  WidgetPanelSkeleton,
} from '@/components/shared/Skeleton';

export default function RootLoading() {
  return (
    <PageContainer noPadding className="flex w-full flex-col">
      <div className="relative flex flex-1">
        {/* Feed column */}
        <div className="flex min-w-0 flex-1 flex-col border-[rgba(120,120,120,0.15)] lg:border-r lg:border-l">
          {/* Sticky header placeholder (FeedToggle) */}
          <div className="sticky top-0 z-10 flex-shrink-0 bg-background shadow-sm">
            <div className="flex w-full items-center border-border border-b">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-1 py-3.5 text-center">
                  <Skeleton className="mx-auto h-4 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* Feed content */}
          <div className="flex-1 bg-background">
            <div className="w-full lg:mx-auto lg:max-w-[700px]">
              <FeedSkeleton />
            </div>
          </div>
        </div>

        {/* Widget sidebar placeholder */}
        <div className="hidden w-96 flex-none flex-col gap-8 px-4 py-6 xl:flex">
          <WidgetPanelSkeleton />
          <WidgetPanelSkeleton />
        </div>
      </div>
    </PageContainer>
  );
}

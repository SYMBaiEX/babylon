import { PageContainer } from '@/components/shared/PageContainer';
import {
  NotificationItemSkeleton,
  Skeleton,
} from '@/components/shared/Skeleton';

export default function NotificationsLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop */}
      <div className="hidden flex-1 flex-col overflow-hidden lg:flex">
        {/* Header */}
        <div className="sticky top-0 z-10 border-border/5 border-b bg-background p-4 shadow-sm sm:p-6">
          <Skeleton className="h-7 w-40 max-w-full" />
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <NotificationItemSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile/Tablet */}
      <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 border-border/5 border-b bg-background p-4 shadow-sm">
          <Skeleton className="h-6 w-32 max-w-full" />
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <NotificationItemSkeleton key={i} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

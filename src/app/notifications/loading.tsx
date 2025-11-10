import { PageContainer } from '@/components/shared/PageContainer'
import { NotificationItemSkeleton, Skeleton } from '@/components/shared/Skeleton'

export default function NotificationsLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background shadow-sm p-4 sm:p-6 border-b border-border/5">
          <Skeleton className="h-7 w-40 max-w-full" />
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-2xl mx-auto px-4 sm:px-0">
            {Array.from({ length: 10 }).map((_, i) => (
              <NotificationItemSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile/Tablet */}
      <div className="flex lg:hidden flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background shadow-sm p-4 border-b border-border/5">
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
  )
}


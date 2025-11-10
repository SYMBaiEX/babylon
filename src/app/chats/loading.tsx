import { PageContainer } from '@/components/shared/PageContainer'
import { ChatListSkeleton, Skeleton } from '@/components/shared/Skeleton'
import { Separator } from '@/components/shared/Separator'

export default function ChatsLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop: Full width content */}
      <div className="hidden xl:flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Left Column - Groups List */}
            <div className="w-full md:w-96 flex flex-col bg-background">
              {/* Header with Search */}
              <div className="p-4">
                <Skeleton className="h-7 w-32 mb-3" />
                {/* Search Bar */}
                <div className="mb-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
              <Separator />

              {/* Groups List */}
              <div className="flex-1 overflow-y-auto">
                <ChatListSkeleton count={10} />
              </div>
            </div>

            {/* Right Column - Empty state */}
            <div className="flex-1 flex flex-col bg-background">
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-3 max-w-md w-full px-4">
                  <Skeleton className="w-16 h-16 rounded-full mx-auto" />
                  <Skeleton className="h-6 w-48 max-w-full mx-auto" />
                  <Skeleton className="h-4 w-64 max-w-full mx-auto" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex xl:hidden flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Groups List */}
            <div className="w-full flex flex-col bg-background">
              {/* Header with Search */}
              <div className="p-4">
                <Skeleton className="h-7 w-32 mb-3" />
                {/* Search Bar */}
                <div className="mb-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
              <Separator />

              {/* Groups List */}
              <div className="flex-1 overflow-y-auto">
                <ChatListSkeleton count={8} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}


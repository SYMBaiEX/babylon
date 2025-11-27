import { PageContainer } from '@/components/shared/PageContainer';
import { Separator } from '@/components/shared/Separator';
import { ChatListSkeleton, Skeleton } from '@/components/shared/Skeleton';

export default function ChatsLoading() {
  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Desktop: Full width content */}
      <div className="hidden flex-1 flex-col overflow-hidden xl:flex">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Left Column - Groups List */}
            <div className="flex w-full flex-col bg-background md:w-96">
              {/* Header with Search */}
              <div className="p-4">
                <Skeleton className="mb-3 h-7 w-32" />
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
            <div className="flex flex-1 flex-col bg-background">
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-md space-y-3 px-4 text-center">
                  <Skeleton className="mx-auto h-16 w-16 rounded-full" />
                  <Skeleton className="mx-auto h-6 w-48 max-w-full" />
                  <Skeleton className="mx-auto h-4 w-64 max-w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex flex-1 flex-col overflow-hidden xl:hidden">
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Groups List */}
            <div className="flex w-full flex-col bg-background">
              {/* Header with Search */}
              <div className="p-4">
                <Skeleton className="mb-3 h-7 w-32" />
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
  );
}

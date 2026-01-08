import { Skeleton } from '@/components/shared/Skeleton';

export default function NftGalleryLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Mint Banner Skeleton */}
      <div className="border-border border-b bg-gradient-to-r from-[#0066FF]/10 to-purple-500/10 p-6">
        <div className="mx-auto max-w-4xl text-center">
          <Skeleton className="mx-auto mb-4 h-8 w-64" />
          <Skeleton className="mx-auto mb-4 h-4 w-96" />
          <Skeleton className="mx-auto h-12 w-48" />
        </div>
      </div>

      {/* Header Skeleton */}
      <div className="border-border border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="p-3">
                <Skeleton className="mb-2 h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

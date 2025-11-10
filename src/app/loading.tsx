import { Skeleton } from '@/components/shared/Skeleton'

export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4 p-8 max-w-md w-full">
        <Skeleton className="w-16 h-16 rounded-full mx-auto" />
        <Skeleton className="h-6 w-48 max-w-full mx-auto" />
        <Skeleton className="h-4 w-64 max-w-full mx-auto" />
      </div>
    </div>
  )
}


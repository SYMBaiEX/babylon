import { cn } from '@/lib/utils'

/**
 * Props for the Skeleton component.
 */
interface SkeletonProps {
  /** Additional CSS classes */
  className?: string
}

/**
 * Skeleton loading component for placeholder content.
 * 
 * Displays an animated pulse effect to indicate loading state.
 * Used as a placeholder while content is being fetched.
 * 
 * @param props - Skeleton component props
 * @returns Skeleton placeholder element
 * 
 * @example
 * ```tsx
 * <Skeleton className="w-full h-20" />
 * ```
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted/50 rounded',
        className
      )}
      aria-hidden="true"
    />
  )
}

/**
 * Skeleton component for post card loading state.
 * 
 * Displays a complete post card skeleton with avatar, header,
 * content, and interaction areas. Used while post data is loading.
 * 
 * @returns Post card skeleton element
 */
export function PostCardSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 w-full border-b border-border/5">
      {/* Avatar + Header */}
      <div className="flex items-start gap-3 sm:gap-4 w-full mb-2">
        {/* Avatar */}
        <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0" />
        
        {/* Header */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-5 w-32 sm:w-40 max-w-full" />
              <Skeleton className="h-4 w-24 sm:w-32 max-w-full" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2 mb-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 max-w-full" />
      </div>

      {/* Interaction Bar */}
      <div className="flex items-center gap-6 sm:gap-8">
        <Skeleton className="h-4 w-10 sm:w-12" />
        <Skeleton className="h-4 w-10 sm:w-12" />
        <Skeleton className="h-4 w-10 sm:w-12" />
      </div>
    </div>
  )
}

/**
 * Skeleton component for feed loading state with multiple posts.
 * 
 * Displays multiple post card skeletons in a feed layout.
 * Used while feed data is loading.
 * 
 * @param props - Object with count of skeleton posts to show
 * @returns Feed skeleton element
 */
export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="w-full">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton component for market card loading state.
 * 
 * Displays a single market card skeleton with ticker, price,
 * and metadata placeholders. Used while market data is loading.
 * 
 * @returns Market card skeleton element
 */
export function MarketCardSkeleton() {
  return (
    <div className="p-3 rounded bg-muted/30">
      <div className="flex justify-between gap-3 mb-2">
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-5 w-20 max-w-full" />
          <Skeleton className="h-3 w-32 max-w-full" />
        </div>
        <div className="text-right space-y-2 shrink-0">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <Skeleton className="h-3 w-16 sm:w-20" />
        <Skeleton className="h-3 w-16 sm:w-20" />
        <Skeleton className="h-3 w-16 sm:w-20" />
      </div>
    </div>
  )
}

/**
 * Skeleton component for markets list loading state.
 * 
 * Displays multiple market card skeletons in a list layout.
 * Used while market data is loading.
 * 
 * @param props - Object with count of skeleton items to show
 * @returns Markets list skeleton element
 */
export function MarketsListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton component for chat list item loading state.
 * 
 * Displays a single chat list item skeleton with avatar and
 * message preview placeholders. Used while chat data is loading.
 * 
 * @returns Chat list item skeleton element
 */
export function ChatListItemSkeleton() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton component for chat list loading state.
 * 
 * Displays multiple chat list item skeletons in a list layout.
 * Used while chat list data is loading.
 * 
 * @param props - Object with count of skeleton items to show
 * @returns Chat list skeleton element
 */
export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="w-full">
      {Array.from({ length: count }).map((_, i) => (
        <ChatListItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton component for chat message loading state.
 * 
 * Displays a single chat message skeleton with avatar (if not current user)
 * and message bubble. Supports different layouts for current user vs others.
 * 
 * @param props - Object with isCurrentUser flag
 * @returns Chat message skeleton element
 */
export function ChatMessageSkeleton({ isCurrentUser = false }: { isCurrentUser?: boolean }) {
  return (
    <div className={cn('flex gap-3', isCurrentUser ? 'justify-end' : 'items-start')}>
      {!isCurrentUser && <Skeleton className="w-10 h-10 rounded-full shrink-0" />}
      <div className={cn('max-w-[70%] min-w-0 space-y-2', isCurrentUser ? 'items-end' : 'items-start')}>
        <Skeleton className="h-3 w-24 max-w-full" />
        <Skeleton className={cn('h-20 rounded-2xl max-w-full', isCurrentUser ? 'w-36 sm:w-48' : 'w-40 sm:w-56')} />
      </div>
    </div>
  )
}

/**
 * Skeleton component for chat messages loading state.
 * 
 * Displays multiple chat message skeletons in a conversation layout.
 * Alternates between current user and other user messages.
 * 
 * @param props - Object with count of skeleton messages to show
 * @returns Chat messages skeleton element
 */
export function ChatMessagesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <ChatMessageSkeleton key={i} isCurrentUser={i % 3 === 0} />
      ))}
    </div>
  )
}

/**
 * Skeleton component for profile header loading state.
 * 
 * Displays a complete profile header skeleton with banner, avatar,
 * name, bio, and stats placeholders. Used while profile data is loading.
 * 
 * @returns Profile header skeleton element
 */
export function ProfileHeaderSkeleton() {
  return (
    <div className="p-4 sm:p-6">
      {/* Banner */}
      <Skeleton className="w-full h-32 sm:h-48 rounded-lg mb-4" />
      
      {/* Avatar and Info */}
      <div className="flex items-start gap-3 sm:gap-4 mb-4">
        <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
          <Skeleton className="h-5 sm:h-6 w-32 sm:w-40 max-w-full" />
          <Skeleton className="h-4 w-24 sm:w-32 max-w-full" />
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-8 w-20 sm:w-24" />
            <Skeleton className="h-8 w-20 sm:w-24" />
          </div>
        </div>
      </div>
      
      {/* Bio */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 max-w-full" />
      </div>
      
      {/* Stats */}
      <div className="flex gap-4 sm:gap-6 mt-4 flex-wrap">
        <div className="space-y-1">
          <Skeleton className="h-5 sm:h-6 w-14 sm:w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-5 sm:h-6 w-14 sm:w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-5 sm:h-6 w-14 sm:w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton component for leaderboard item loading state.
 * 
 * Displays a single leaderboard item skeleton with rank, avatar,
 * name, and score placeholders. Used while leaderboard data is loading.
 * 
 * @returns Leaderboard item skeleton element
 */
export function LeaderboardItemSkeleton() {
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-4">
        <Skeleton className="w-8 h-8 rounded shrink-0" />
        <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-24 sm:w-32 max-w-full" />
          <Skeleton className="h-3 w-20 sm:w-24 max-w-full" />
        </div>
        <div className="text-right space-y-2 shrink-0">
          <Skeleton className="h-4 sm:h-5 w-16 sm:w-20" />
          <Skeleton className="h-3 w-10 sm:w-12" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton component for leaderboard loading state.
 * 
 * Displays multiple leaderboard item skeletons in a list layout.
 * Used while leaderboard data is loading.
 * 
 * @param props - Object with count of skeleton items to show
 * @returns Leaderboard skeleton element
 */
export function LeaderboardSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="w-full">
      {Array.from({ length: count }).map((_, i) => (
        <LeaderboardItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton component for widget panel loading state.
 * 
 * Displays a widget panel skeleton with title and multiple
 * widget item placeholders. Used while widget data is loading.
 * 
 * @returns Widget panel skeleton element
 */
export function WidgetPanelSkeleton() {
  return (
    <div className="bg-card/50 backdrop-blur rounded-2xl p-4 border border-border">
      <Skeleton className="h-5 w-32 max-w-full mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-2">
            <Skeleton className="h-4 w-3/4 max-w-full" />
            <Skeleton className="h-3 w-1/2 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton component for prediction card loading state.
 * 
 * Displays a prediction market card skeleton with question,
 * prices, and metadata placeholders. Used while prediction
 * data is loading.
 * 
 * @returns Prediction card skeleton element
 */
export function PredictionCardSkeleton() {
  return (
    <div className="p-3 rounded bg-muted/30 space-y-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4 max-w-full" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 sm:gap-3 shrink-0">
          <Skeleton className="h-3 w-10 sm:w-12" />
          <Skeleton className="h-3 w-10 sm:w-12" />
        </div>
        <div className="flex gap-2 shrink-0">
          <Skeleton className="h-3 w-14 sm:w-16" />
          <Skeleton className="h-3 w-14 sm:w-16" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton component for pool card loading state.
 * 
 * Displays a pool card skeleton with name, description, and
 * metadata placeholders. Used while pool data is loading.
 * 
 * @returns Pool card skeleton element
 */
export function PoolCardSkeleton() {
  return (
    <div className="p-4 rounded-lg bg-muted/30 space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-full" />
        </div>
        <Skeleton className="h-6 w-16 shrink-0" />
      </div>
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <Skeleton className="h-3 w-16 sm:w-20" />
        <Skeleton className="h-3 w-16 sm:w-20" />
      </div>
    </div>
  )
}

/**
 * Skeleton component for stats card loading state.
 * 
 * Displays a stats card skeleton with label, value, and
 * change indicator placeholders. Used while stats data is loading.
 * 
 * @returns Stats card skeleton element
 */
export function StatsCardSkeleton() {
  return (
    <div className="bg-card/50 backdrop-blur rounded-2xl p-4 sm:p-6 border border-border">
      <Skeleton className="h-4 w-24 max-w-full mb-2" />
      <Skeleton className="h-6 sm:h-8 w-28 sm:w-32 max-w-full mb-1" />
      <Skeleton className="h-3 w-20 max-w-full" />
    </div>
  )
}

/**
 * Skeleton component for table row loading state.
 * 
 * Displays a table row skeleton with configurable number of
 * column placeholders. Used while table data is loading.
 * 
 * @param props - Object with number of columns to show
 * @returns Table row skeleton element
 */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-2 sm:gap-4 p-2 sm:p-3 border-b border-border/5">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1 min-w-0">
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton component for notification item loading state.
 * 
 * Displays a notification item skeleton with avatar, message,
 * and timestamp placeholders. Used while notification data is loading.
 * 
 * @returns Notification item skeleton element
 */
export function NotificationItemSkeleton() {
  return (
    <div className="p-4 border-b border-border/5">
      <div className="flex gap-3">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4 max-w-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton component for page header loading state.
 * 
 * Displays a page header skeleton with title, description,
 * and action buttons placeholders. Used while page data is loading.
 * 
 * @returns Page header skeleton element
 */
export function PageHeaderSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
      <Skeleton className="h-7 sm:h-8 w-40 sm:w-48 max-w-full" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-10 w-28 sm:w-32" />
        <Skeleton className="h-10 w-28 sm:w-32" />
      </div>
    </div>
  )
}


/**
 * Rewards skeleton component for rewards page loading state.
 *
 * Provides skeleton loading UI that matches the rewards page layout to
 * prevent layout shifts during loading. Includes skeleton components
 * for stats, tasks, and referral sections.
 *
 * Features:
 * - Layout-matched skeleton
 * - Staggered animations
 * - Responsive design
 * - Accessibility support
 *
 * @returns Rewards skeleton element
 */
import { Separator } from '@/components/shared/Separator';

/**
 * Skeleton box component for placeholder rectangles.
 *
 * @param props - SkeletonBox component props
 * @returns Skeleton box element
 */
function SkeletonBox({
  className = '',
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-muted/50 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton text component for placeholder text lines.
 *
 * @param props - SkeletonText component props
 * @returns Skeleton text element
 */
function SkeletonText({
  className = '',
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`h-4 animate-pulse rounded bg-muted/50 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden="true"
    />
  );
}

export function RewardsSkeleton() {
  return (
    <div role="status" aria-label="Loading rewards...">
      {/* Desktop Layout */}
      <div className="hidden flex-1 overflow-hidden xl:flex">
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {/* Header */}
          <div className="mb-4">
            <SkeletonText className="mb-2 h-8 w-32" />
            <SkeletonText className="h-4 w-96" />
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Total Earned */}
            <div className="rounded-lg border border-[#0066FF]/30 bg-gradient-to-r from-[#0066FF]/20 to-purple-500/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <SkeletonBox className="h-5 w-5" delay={50} />
                <SkeletonText className="h-4 w-24" delay={50} />
              </div>
              <div
                className="h-[1.875rem] w-20 animate-pulse rounded bg-muted/50"
                style={{ animationDelay: '50ms' }}
                aria-hidden="true"
              />
            </div>

            {/* Current Balance */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <SkeletonBox className="h-5 w-5" delay={100} />
                <SkeletonText className="h-4 w-28" delay={100} />
              </div>
              <div
                className="h-[1.875rem] w-24 animate-pulse rounded bg-muted/50"
                style={{ animationDelay: '100ms' }}
                aria-hidden="true"
              />
            </div>

            {/* Total Referrals */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <SkeletonBox className="h-5 w-5" delay={150} />
                <SkeletonText className="h-4 w-28" delay={150} />
              </div>
              <div
                className="h-[1.875rem] w-16 animate-pulse rounded bg-muted/50"
                style={{ animationDelay: '150ms' }}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Reward Tasks */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-4 flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-5 w-28" />
            </div>

            <div className="grid gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-lg border border-border bg-sidebar-accent/50 p-4"
                >
                  <SkeletonBox className="h-6 w-6 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonText className="h-4 w-32" />
                    <SkeletonText className="h-3 w-48" />
                  </div>
                  <div className="shrink-0 space-y-1 text-right">
                    <SkeletonText className="h-4 w-12" />
                    <SkeletonText className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Share Actions */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-4 flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-5 w-32" />
            </div>

            <div className="space-y-3">
              <SkeletonText className="h-4 w-full" />
              <SkeletonBox className="h-10 w-full rounded-lg" />
            </div>
          </div>

          <Separator />

          {/* Referral Link */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-5 w-32" />
              <SkeletonText className="ml-auto h-3 w-32" />
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <SkeletonBox className="h-10 flex-1 rounded-lg" />
                <SkeletonBox className="h-10 w-20 rounded-lg" />
              </div>
              <SkeletonBox className="h-10 w-full rounded-lg" />
            </div>
          </div>

          {/* Referred Users List */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-4 w-4" />
                <SkeletonText className="h-5 w-32" />
              </div>
            </div>

            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <SkeletonBox className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonText className="h-4 w-32" />
                    <SkeletonText className="h-3 w-24" />
                    <SkeletonText className="h-3 w-28" />
                  </div>
                  <SkeletonBox className="h-6 w-6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Layout */}
      <div className="flex w-full flex-1 flex-col overflow-y-auto xl:hidden">
        <div className="w-full space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
          {/* Header */}
          <div>
            <SkeletonText className="mb-2 h-8 w-32" />
            <SkeletonText className="h-4 w-full max-w-md" />
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Total Earned */}
            <div className="rounded-lg border border-[#0066FF]/30 bg-gradient-to-r from-[#0066FF]/20 to-purple-500/20 p-3">
              <div className="mb-1 flex items-center gap-1">
                <SkeletonBox className="h-4 w-4" />
                <SkeletonText className="h-3 w-16" />
              </div>
              <div
                className="h-[1.5rem] w-16 animate-pulse rounded bg-muted/50"
                aria-hidden="true"
              />
            </div>

            {/* Current Balance */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-1">
                <SkeletonBox className="h-4 w-4" />
                <SkeletonText className="h-3 w-16" />
              </div>
              <div
                className="h-[1.5rem] w-20 animate-pulse rounded bg-muted/50"
                aria-hidden="true"
              />
            </div>

            {/* Total Referrals */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-1">
                <SkeletonBox className="h-4 w-4" />
                <SkeletonText className="h-3 w-16" />
              </div>
              <div
                className="h-[1.5rem] w-12 animate-pulse rounded bg-muted/50"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Reward Tasks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-6 w-28" />
            </div>

            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <SkeletonBox className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonText className="h-4 w-28" />
                    <SkeletonText className="h-3 w-40" />
                  </div>
                  <SkeletonText className="h-4 w-12 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Share Actions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-6 w-32" />
            </div>
            <SkeletonText className="h-4 w-full" />
            <SkeletonBox className="h-10 w-full rounded-lg" />
          </div>

          <Separator />

          {/* Referral Link */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <SkeletonBox className="h-5 w-5" />
              <SkeletonText className="h-5 w-32" />
              <SkeletonText className="ml-2 h-3 w-24" />
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <SkeletonBox className="h-10 min-w-0 flex-1 rounded-lg" />
                <SkeletonBox className="h-10 w-12 shrink-0 rounded-lg" />
              </div>
              <SkeletonBox className="h-10 w-full rounded-lg" />
            </div>
          </div>

          {/* Referred Users List */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SkeletonBox className="h-5 w-5" />
                <SkeletonText className="h-5 w-32" />
              </div>
            </div>

            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <SkeletonBox className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonText className="h-4 w-32" />
                    <SkeletonText className="h-3 w-24" />
                    <SkeletonText className="h-3 w-28" />
                  </div>
                  <SkeletonBox className="h-6 w-6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only">Loading rewards content, please wait...</span>
    </div>
  );
}

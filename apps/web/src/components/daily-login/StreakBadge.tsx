'use client';

import { cn } from '@babylon/shared';

interface StreakBadgeProps {
  streak: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * StreakBadge - Displays the current daily login streak
 *
 * Color coding based on streak length:
 * - 0: Gray (no streak)
 * - 1-6: Blue (building streak)
 * - 7-13: Green (one week+)
 * - 14-29: Purple (two weeks+)
 * - 30+: Gold (one month+)
 */
export function StreakBadge({
  streak,
  size = 'md',
  className,
}: StreakBadgeProps) {
  const sizeClasses = {
    sm: 'h-5 min-w-5 text-xs px-1.5',
    md: 'h-6 min-w-6 text-sm px-2',
    lg: 'h-8 min-w-8 text-base px-2.5',
  };

  const getColorClass = (streak: number): string => {
    if (streak === 0) return 'bg-muted text-muted-foreground';
    if (streak < 7) return 'bg-[#0066FF] text-white';
    if (streak < 14) return 'bg-green-600 text-white';
    if (streak < 30) return 'bg-purple-600 text-white';
    return 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold',
        sizeClasses[size],
        getColorClass(streak),
        className
      )}
      title={`${streak} day streak`}
    >
      {streak}
    </div>
  );
}

'use client';

import { cn } from '@babylon/shared';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpDown, CheckCircle, Clock, Flame, Sparkles } from 'lucide-react';
import { memo } from 'react';
import type { PredictionSort } from '@/types/markets';

interface PredictionSortControlsProps {
  activeSort: PredictionSort;
  onSortChange: (sort: PredictionSort) => void;
  /** Whether to show resolved/expired markets */
  showResolved?: boolean;
  /** Callback when show resolved toggle changes */
  onShowResolvedChange?: (show: boolean) => void;
  /** If true, uses horizontal scroll on mobile */
  compact?: boolean;
}

const SORT_OPTIONS: Array<{
  value: PredictionSort;
  label: string;
  icon?: LucideIcon;
}> = [
  { value: 'trending', label: 'Trending', icon: Flame },
  { value: 'volume', label: 'Volume', icon: ArrowUpDown },
  { value: 'newest', label: 'Newest', icon: Sparkles },
  { value: 'ending-soon', label: 'Ending Soon', icon: Clock },
];

/**
 * Sort control buttons for prediction markets.
 * Includes sort options and a toggle for showing resolved markets.
 * Supports both desktop (inline) and mobile (scrollable) layouts.
 * Memoized to prevent unnecessary re-renders.
 */
export const PredictionSortControls = memo(function PredictionSortControls({
  activeSort,
  onSortChange,
  showResolved = false,
  onShowResolvedChange,
  compact = false,
}: PredictionSortControlsProps) {
  return (
    <div
      role="group"
      aria-label="Sort options"
      className={cn(
        'flex items-center gap-2',
        compact && 'scrollbar-hide overflow-x-auto pb-2'
      )}
    >
      {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={activeSort === value}
          onClick={() => onSortChange(value)}
          className={cn(
            'rounded-full px-3 py-1.5 font-medium text-xs transition-all',
            compact && 'flex-shrink-0 whitespace-nowrap',
            activeSort === value
              ? 'bg-[#0066FF] text-primary-foreground'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          )}
        >
          {Icon && <Icon className="mr-1 inline h-3 w-3" />}
          {label}
        </button>
      ))}

      {/* Separator */}
      {onShowResolvedChange && (
        <>
          <div className="mx-1 h-4 w-px flex-shrink-0 bg-border" />

          {/* Show Expired/Resolved toggle */}
          <button
            type="button"
            aria-pressed={showResolved}
            onClick={() => onShowResolvedChange(!showResolved)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-xs transition-all',
              compact && 'flex-shrink-0 whitespace-nowrap',
              showResolved
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            <CheckCircle className="h-3 w-3" />
            Expired
          </button>
        </>
      )}
    </div>
  );
});

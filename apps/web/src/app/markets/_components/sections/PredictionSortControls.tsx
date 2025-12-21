'use client';

import { cn } from '@babylon/shared';
import { ArrowUpDown, Clock, Flame } from 'lucide-react';
import type { PredictionSort } from '@/types/markets';

interface PredictionSortControlsProps {
  activeSort: PredictionSort;
  onSortChange: (sort: PredictionSort) => void;
  /** If true, uses horizontal scroll on mobile */
  compact?: boolean;
}

const SORT_OPTIONS: Array<{
  value: PredictionSort;
  label: string;
  icon?: typeof Flame;
}> = [
  { value: 'trending', label: 'Trending', icon: Flame },
  { value: 'volume', label: 'Volume', icon: ArrowUpDown },
  { value: 'newest', label: 'Newest' },
  { value: 'ending-soon', label: 'Ending Soon', icon: Clock },
];

/**
 * Sort control buttons for prediction markets.
 * Supports both desktop (inline) and mobile (scrollable) layouts.
 */
export function PredictionSortControls({
  activeSort,
  onSortChange,
  compact = false,
}: PredictionSortControlsProps) {
  return (
    <div
      className={cn(
        'flex gap-2',
        compact && 'scrollbar-hide overflow-x-auto pb-2'
      )}
    >
      {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
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
    </div>
  );
}

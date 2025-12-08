'use client';

import { TrendingUp } from 'lucide-react';
import type { WaitlistData } from '../types';

interface StatsCardsProps {
  waitlistData: WaitlistData;
}

/**
 * Stats cards showing position, people ahead, and total points.
 */
export function StatsCards({ waitlistData }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {/* Position Card */}
      <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 backdrop-blur-sm transition-colors hover:bg-primary/10 sm:p-5">
        <div className="mb-2 text-muted-foreground text-sm">Position</div>
        <div className="mb-1 whitespace-nowrap font-bold text-lg text-primary sm:text-xl md:text-2xl">
          #{waitlistData.position}
        </div>
        <div className="text-muted-foreground text-sm">
          Top {waitlistData.percentile}%
        </div>
      </div>

      {/* People Ahead Card */}
      <div className="rounded-xl border border-border/50 bg-background/30 p-4 backdrop-blur-sm transition-colors hover:bg-background/40 sm:p-5">
        <div className="mb-2 text-muted-foreground text-sm">Ahead</div>
        <div className="mb-1 whitespace-nowrap font-bold text-foreground text-lg sm:text-xl md:text-2xl">
          {waitlistData.totalAhead}
        </div>
        <div className="text-muted-foreground text-sm">
          of {waitlistData.totalCount}
        </div>
      </div>

      {/* Total Points Card */}
      <div className="col-span-2 rounded-xl border border-border/50 bg-background/30 p-4 backdrop-blur-sm transition-colors hover:bg-background/40 sm:col-span-1 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
          <div className="text-muted-foreground text-sm">Total Points</div>
        </div>
        <div className="whitespace-nowrap font-bold text-lg text-primary sm:text-xl md:text-2xl">
          {waitlistData.points.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

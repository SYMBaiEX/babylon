'use client';

import { cn } from '@babylon/shared';

export type LeaderboardTab = 'all' | 'earned' | 'referral';

/**
 * Leaderboard toggle component for switching between leaderboard views.
 *
 * Provides tab navigation between All Points, Earned Points, and Referral Points views.
 * Shows active tab with underline indicator and hover states.
 *
 * @param props - LeaderboardToggle component props
 * @returns Leaderboard toggle element with tabs
 *
 * @example
 * ```tsx
 * <LeaderboardToggle
 *   activeTab="all"
 *   onTabChange={(tab) => setActiveTab(tab)}
 * />
 * ```
 */
interface LeaderboardToggleProps {
  activeTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
}

export function LeaderboardToggle({
  activeTab,
  onTabChange,
}: LeaderboardToggleProps) {
  return (
    <div className="flex w-full items-center border-border border-b">
      <button
        onClick={() => onTabChange('all')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'all' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        All Points
        {activeTab === 'all' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('earned')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'earned' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Earned
        {activeTab === 'earned' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('referral')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'referral' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Referral
        {activeTab === 'referral' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
    </div>
  );
}

'use client';

import { cn } from '@babylon/shared';

export type LeaderboardTab = 'wallet' | 'team';

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
        onClick={() => onTabChange('wallet')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'wallet' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Per Wallet
        {activeTab === 'wallet' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('team')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'team' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Team
        {activeTab === 'team' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
    </div>
  );
}

'use client';

import { cn } from '@babylon/shared/client';

/**
 * Feed toggle component for switching between feed views.
 *
 * Provides tab navigation between Latest, Following, and Trades feed views.
 * Shows active tab with underline indicator and hover states.
 *
 * @param props - FeedToggle component props
 * @returns Feed toggle element with tabs
 *
 * @example
 * ```tsx
 * <FeedToggle
 *   activeTab="latest"
 *   onTabChange={(tab) => setActiveTab(tab)}
 * />
 * ```
 */
interface FeedToggleProps {
  activeTab: 'latest' | 'following' | 'trades';
  onTabChange: (tab: 'latest' | 'following' | 'trades') => void;
}

export function FeedToggle({ activeTab, onTabChange }: FeedToggleProps) {
  return (
    <div className="flex w-full items-center border-border border-b">
      <button
        onClick={() => onTabChange('latest')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'latest' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Latest
        {activeTab === 'latest' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('following')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'following'
            ? 'text-foreground'
            : 'text-muted-foreground'
        )}
      >
        Following
        {activeTab === 'following' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('trades')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'trades' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Trades
        {activeTab === 'trades' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
    </div>
  );
}

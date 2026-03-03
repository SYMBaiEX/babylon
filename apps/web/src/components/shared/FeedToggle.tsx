'use client';

import { cn } from '@babylon/shared';
import { Flame, ScrollText } from 'lucide-react';

/**
 * Feed toggle component for switching between feed views.
 *
 * Provides tab navigation between Latest, Hot, Narrative, Following, and Trades feed views.
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
  activeTab: 'latest' | 'hot' | 'narrative' | 'following' | 'trades';
  onTabChange: (
    tab: 'latest' | 'hot' | 'narrative' | 'following' | 'trades'
  ) => void;
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
        onClick={() => onTabChange('hot')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'hot' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <span className="flex items-center justify-center gap-1">
          <Flame className="h-4 w-4" />
          Hot
        </span>
        {activeTab === 'hot' && (
          <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('narrative')}
        className={cn(
          'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
          activeTab === 'narrative'
            ? 'text-foreground'
            : 'text-muted-foreground'
        )}
      >
        <span className="flex items-center justify-center gap-1">
          <ScrollText className="h-4 w-4" />
          Stories
        </span>
        {activeTab === 'narrative' && (
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

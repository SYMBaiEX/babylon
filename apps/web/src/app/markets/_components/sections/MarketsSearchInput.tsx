'use client';

import { Search } from 'lucide-react';
import type { MarketTab } from '@/types/markets';

interface MarketsSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  activeTab: MarketTab;
}

/**
 * Search input for filtering markets.
 * Placeholder text changes based on active tab.
 */
export function MarketsSearchInput({
  value,
  onChange,
  activeTab,
}: MarketsSearchInputProps) {
  const placeholder =
    activeTab === 'perps' ? 'Search tickers...' : 'Search questions...';
  const ariaLabel =
    activeTab === 'perps' ? 'Search tickers' : 'Search questions';

  return (
    <div className="relative">
      <Search
        className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded bg-muted/50 py-3 pr-4 pl-10 text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30"
      />
    </div>
  );
}


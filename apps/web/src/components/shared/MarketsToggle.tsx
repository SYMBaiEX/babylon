'use client';

import { cn, formatCurrency } from '@babylon/shared';
import type { MarketTab } from '@/types/markets';

// Re-export for backwards compatibility
export type { MarketTab } from '@/types/markets';

/**
 * Markets toggle component for switching between market views.
 *
 * Provides tab navigation between Dashboard, Perps, and Predictions views.
 * Shows active tab with underline indicator and hover states.
 * Optionally displays user balance on the right side when authenticated.
 *
 * @param props - MarketsToggle component props
 * @returns Markets toggle element with tabs
 *
 * @example
 * ```tsx
 * <MarketsToggle
 *   activeTab="dashboard"
 *   onTabChange={(tab) => setActiveTab(tab)}
 *   balance={1000}
 *   authenticated={true}
 * />
 * ```
 */
interface MarketsToggleProps {
  activeTab: MarketTab;
  onTabChange: (tab: MarketTab) => void;
  /** User's available balance to display in header */
  balance?: number | null;
  /** Whether user is authenticated */
  authenticated?: boolean;
  /** Whether balance is loading */
  loading?: boolean;
}

export function MarketsToggle({
  activeTab,
  onTabChange,
  balance,
  authenticated,
  loading,
}: MarketsToggleProps) {
  const showBalance =
    authenticated && balance !== undefined && balance !== null;

  return (
    <div className="flex w-full items-center border-border border-b">
      <div className="flex flex-1">
        <button
          onClick={() => onTabChange('dashboard')}
          className={cn(
            'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
            activeTab === 'dashboard'
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
        >
          Dashboard
          {activeTab === 'dashboard' && (
            <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
          )}
        </button>
        <button
          onClick={() => onTabChange('perps')}
          className={cn(
            'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
            activeTab === 'perps' ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          Perps
          {activeTab === 'perps' && (
            <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
          )}
        </button>
        <button
          onClick={() => onTabChange('predictions')}
          className={cn(
            'relative flex-1 py-3.5 font-semibold transition-all hover:bg-muted/20',
            activeTab === 'predictions'
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
        >
          Predictions
          {activeTab === 'predictions' && (
            <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-primary" />
          )}
        </button>
      </div>
      {authenticated && (
        <div className="flex shrink-0 items-center px-4">
          {loading ? (
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          ) : showBalance ? (
            <span className="font-semibold text-foreground">
              {formatCurrency(balance, { useThousandsSeparator: true })}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

'use client';

import { cn, formatCurrency } from '@babylon/shared';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWalletBalance } from '@/hooks/useWalletBalance';

/**
 * Wallet balance component displaying user balance and lifetime PnL.
 *
 * Shows current available balance and lifetime profit/loss in a compact
 * card format. Automatically refreshes when refreshTrigger changes.
 * Only displays when user is authenticated. Color-codes balance based on
 * starting balance ($1000) and shows profit/loss indicators.
 *
 * @param props - WalletBalance component props
 * @returns Wallet balance element or null if not authenticated
 *
 * @example
 * ```tsx
 * <WalletBalance refreshTrigger={Date.now()} />
 * ```
 */
interface WalletBalanceProps {
  refreshTrigger?: number; // Timestamp or counter to force refresh
}

export function WalletBalance({ refreshTrigger }: WalletBalanceProps = {}) {
  const { user, authenticated } = useAuth();
  const { balance, lifetimePnL, loading, refresh } = useWalletBalance(
    user?.id,
    { enabled: authenticated }
  );

  useEffect(() => {
    if (refreshTrigger === undefined) return;
    void refresh();
  }, [refreshTrigger, refresh]);

  if (!authenticated) {
    return null;
  }

  const isProfit = lifetimePnL >= 0;
  const startingBalance = 1000;

  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded bg-muted/30 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
      <div className="flex flex-shrink-0 items-center gap-2">
        <Wallet className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
        <div>
          <div className="text-muted-foreground text-xs">Balance</div>
          <div
            className={cn(
              'whitespace-nowrap font-bold text-base sm:text-lg',
              balance > startingBalance
                ? 'text-green-600'
                : balance < startingBalance
                  ? 'text-red-600'
                  : 'text-foreground'
            )}
          >
            {loading ? '...' : formatCurrency(balance, 0)}
          </div>
        </div>
      </div>

      <div className="h-8 w-px flex-shrink-0 bg-border" />

      <div className="flex flex-shrink-0 items-center gap-2">
        {isProfit ? (
          <TrendingUp className="h-3.5 w-3.5 text-green-600 sm:h-4 sm:w-4" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-600 sm:h-4 sm:w-4" />
        )}
        <div>
          <div className="text-muted-foreground text-xs">Lifetime PnL</div>
          <div
            className={cn(
              'whitespace-nowrap font-bold text-sm',
              isProfit ? 'text-green-600' : 'text-red-600'
            )}
          >
            {loading ? '...' : isProfit ? '+' : ''}
            {formatCurrency(lifetimePnL, 0)}
          </div>
        </div>
      </div>
    </div>
  );
}

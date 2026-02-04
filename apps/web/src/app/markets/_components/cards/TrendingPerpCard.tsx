'use client';

import { cn } from '@babylon/shared';
import { memo } from 'react';
import type { PerpMarket } from '@/types/markets';
import { formatPrice } from '../../_lib/formatters';

interface TrendingPerpCardProps {
  market: PerpMarket;
  onClick: (market: PerpMarket) => void;
}

/**
 * Card component for displaying a trending perpetual market.
 * Memoized for performance as market data changes infrequently.
 * Uses color coding (green/red) and +/- signs for direction instead of icons.
 */
export const TrendingPerpCard = memo(function TrendingPerpCard({
  market,
  onClick,
}: TrendingPerpCardProps) {
  const isPositive = market.changePercent24h >= 0;

  return (
    <button
      type="button"
      onClick={() => onClick(market)}
      className="w-full cursor-pointer rounded-lg border border-transparent bg-muted/30 p-3 text-left transition-all hover:border-[#0066FF]/30 hover:bg-muted"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm">${market.ticker}</div>
          <div className="truncate text-muted-foreground text-xs">
            {market.name}
          </div>
        </div>
        <div className="ml-3 text-right">
          <div className="font-bold text-sm">
            {formatPrice(market.currentPrice)}
          </div>
          <div
            className={cn(
              'font-bold text-xs',
              isPositive ? 'text-green-600' : 'text-red-600'
            )}
          >
            {isPositive ? '+' : ''}
            {market.changePercent24h.toFixed(2)}%
          </div>
        </div>
      </div>
    </button>
  );
});

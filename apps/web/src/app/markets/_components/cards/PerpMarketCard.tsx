'use client';

import { cn } from '@babylon/shared';
import { memo } from 'react';
import type { PerpMarket } from '@/types/markets';
import { formatPrice, formatVolume } from '../../_lib/formatters';

interface PerpMarketCardProps {
  market: PerpMarket;
  onClick: (market: PerpMarket) => void;
}

/**
 * Card component for displaying a perpetual market in the list view.
 * Shows price, 24h change, volume, open interest, and funding rate.
 * Uses color coding (green/red) and +/- signs for direction instead of icons.
 */
export const PerpMarketCard = memo(function PerpMarketCard({
  market,
  onClick,
}: PerpMarketCardProps) {
  const isPositive = market.change24h >= 0;

  return (
    <button
      type="button"
      onClick={() => onClick(market)}
      className="w-full cursor-pointer rounded bg-muted/30 p-3 text-left transition-all hover:bg-muted"
    >
      <div className="mb-2 flex justify-between">
        <div>
          <div className="font-bold">${market.ticker}</div>
          <div className="text-muted-foreground text-xs">{market.name}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{formatPrice(market.currentPrice)}</div>
          <div
            className={cn(
              'font-medium text-xs',
              isPositive ? 'text-green-600' : 'text-red-600'
            )}
          >
            {isPositive ? '+' : ''}
            {market.changePercent24h.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="flex gap-3 text-muted-foreground text-xs">
        <div>Vol: {formatVolume(market.volume24h)}</div>
        <div>OI: {formatVolume(market.openInterest)}</div>
        <div
          className={
            market.fundingRate.rate >= 0 ? 'text-orange-500' : 'text-blue-500'
          }
        >
          Fund: {(market.fundingRate.rate * 100).toFixed(4)}%
        </div>
      </div>
    </button>
  );
});

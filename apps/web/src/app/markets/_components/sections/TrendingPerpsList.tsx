'use client';

import { TrendingUp } from 'lucide-react';
import { TrendingPerpCard } from '../cards';
import type { TrendingPerpMarket } from '../../_hooks';
import type { PerpMarket } from '@/types/markets';

interface TrendingPerpsListProps {
  markets: TrendingPerpMarket[];
  onMarketClick: (market: PerpMarket) => void;
}

/**
 * Section component displaying trending perpetual markets.
 * Shows top markets by a combination of price change and volume.
 */
export function TrendingPerpsList({
  markets,
  onMarketClick,
}: TrendingPerpsListProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-lg">
        <TrendingUp className="h-5 w-5 text-green-600" />
        Trending Perpetuals
      </h2>
      {markets.length > 0 ? (
        <div className="space-y-2">
          {markets.map((market, idx) => (
            <TrendingPerpCard
              key={`trending-${market.ticker}-${idx}`}
              market={market}
              onClick={onMarketClick}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-muted/30 p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No markets available yet.
          </p>
        </div>
      )}
    </div>
  );
}


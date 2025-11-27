'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { usePredictionMarketsSubscription } from '@/hooks/usePredictionMarketStream';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

/**
 * Top mover market structure for top movers panel.
 */
interface TopMover {
  ticker: string;
  name: string;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  organizationId?: string;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  openInterest?: number;
  fundingRate?: {
    rate: number;
    nextFundingTime: string;
    predictedRate: number;
  };
  maxLeverage?: number;
  minOrderSize?: number;
}

/**
 * Top movers panel component for displaying biggest gainers and losers.
 *
 * Displays the top 4 gainers and top 4 losers from perpetual markets based on
 * 24h price change percentage. Subscribes to real-time price updates via SSE.
 * Automatically refreshes every 30 seconds. Navigates to market detail page on click.
 *
 * Features:
 * - Top gainers list (4 markets)
 * - Top losers list (4 markets)
 * - Real-time price updates via SSE
 * - Auto-refresh (30s interval)
 * - Loading states
 * - Empty state handling
 *
 * @param props - TopMoversPanel component props
 * @returns Top movers panel element
 */
interface TopMoversPanelProps {
  onMarketClick?: (market: TopMover) => void;
}

export function TopMoversPanel({ onMarketClick }: TopMoversPanelProps) {
  const [topGainers, setTopGainers] = useState<TopMover[]>([]);
  const [topLosers, setTopLosers] = useState<TopMover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMovers = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/markets/perps');
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        const data = await response.json();
        if (data.markets && Array.isArray(data.markets)) {
          const markets: TopMover[] = data.markets.map(
            (m: {
              ticker: string;
              name: string;
              currentPrice?: number;
              change24h?: number;
              changePercent24h?: number;
              organizationId?: string;
              high24h?: number;
              low24h?: number;
              volume24h?: number;
              openInterest?: number;
              fundingRate?: {
                rate: number;
                nextFundingTime: string;
                predictedRate: number;
              };
              maxLeverage?: number;
              minOrderSize?: number;
            }) => ({
              ticker: m.ticker,
              name: m.name,
              currentPrice: m.currentPrice || 0,
              change24h: m.change24h || 0,
              changePercent24h: m.changePercent24h || 0,
              organizationId: m.organizationId,
              high24h: m.high24h,
              low24h: m.low24h,
              volume24h: m.volume24h,
              openInterest: m.openInterest,
              fundingRate: m.fundingRate,
              maxLeverage: m.maxLeverage,
              minOrderSize: m.minOrderSize,
            })
          );

          // Sort by change percentage
          const sorted = [...markets].sort(
            (a, b) => b.changePercent24h - a.changePercent24h
          );
          setTopGainers(sorted.slice(0, 4));
          setTopLosers(sorted.slice(-4).reverse());
        }
      } catch (error) {
        logger.error('Failed to fetch top movers', { error }, 'TopMoversPanel');
        // Keep existing data on error
      } finally {
        setLoading(false);
      }
    };

    fetchMovers();
    const interval = setInterval(fetchMovers, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (p: number) => `$${p.toFixed(2)}`;

  usePredictionMarketsSubscription({
    onTrade: (event) => {
      const probability = event.yesPrice * 100;
      setTopGainers((prev) =>
        prev.map((market) =>
          market.organizationId === event.marketId
            ? {
                ...market,
                currentPrice: probability,
              }
            : market
        )
      );
      setTopLosers((prev) =>
        prev.map((market) =>
          market.organizationId === event.marketId
            ? {
                ...market,
                currentPrice: probability,
              }
            : market
        )
      );
    },
  });

  return (
    <div className="flex flex-1 flex-col rounded-2xl bg-sidebar px-4 py-3">
      <h2 className="mb-3 font-bold text-foreground text-xl">Top Movers</h2>
      {loading ? (
        <div className="flex-1 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {/* Top Gainers */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <h3 className="font-semibold text-foreground text-sm">
                Top Gainers
              </h3>
            </div>
            <div className="space-y-1.5">
              {topGainers.length > 0 ? (
                topGainers.map((mover) => (
                  <button
                    key={mover.ticker}
                    onClick={() => onMarketClick?.(mover)}
                    className={cn(
                      '-ml-1.5 flex w-full cursor-pointer items-center justify-between rounded-lg p-1.5 text-left text-sm transition-colors hover:bg-muted/50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">
                        ${mover.ticker}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {mover.name}
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-foreground">
                          {formatPrice(mover.currentPrice)}
                        </div>
                        <div className="font-medium text-green-600 text-xs">
                          +{mover.changePercent24h.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-muted-foreground text-xs">No gainers</div>
              )}
            </div>
          </div>

          {/* Top Losers */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <h3 className="font-semibold text-foreground text-sm">
                Top Losers
              </h3>
            </div>
            <div className="space-y-1.5">
              {topLosers.length > 0 ? (
                topLosers.map((mover) => (
                  <button
                    key={mover.ticker}
                    onClick={() => onMarketClick?.(mover)}
                    className={cn(
                      '-ml-1.5 flex w-full cursor-pointer items-center justify-between rounded-lg p-1.5 text-left text-sm transition-colors hover:bg-muted/50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">
                        ${mover.ticker}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {mover.name}
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-foreground">
                          {formatPrice(mover.currentPrice)}
                        </div>
                        <div className="font-medium text-red-600 text-xs">
                          {mover.changePercent24h.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-muted-foreground text-xs">No losers</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { Flame } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { usePredictionMarketsSubscription } from '@/hooks/usePredictionMarketStream';
import { logger } from '@babylon/shared';
import { cn } from '@babylon/shared';

/**
 * Prediction market summary structure for trending panel.
 */
interface PredictionSummary {
  id: string;
  text: string;
  yesShares: number;
  noShares: number;
  resolutionDate?: string;
}

/**
 * Prediction question structure from API.
 */
interface PredictionQuestion {
  id: string | number;
  text: string;
  yesShares?: number | null;
  noShares?: number | null;
  resolutionDate?: string | null;
}

/**
 * Prediction trending panel component for displaying trending prediction markets.
 *
 * Displays a list of trending prediction markets sorted by total volume (yes + no shares).
 * Subscribes to real-time trade and resolution updates via SSE. Automatically refreshes
 * every 60 seconds. Navigates to market detail page on click.
 *
 * Features:
 * - Trending markets list sorted by volume
 * - Real-time share count updates via SSE
 * - Auto-refresh (60s interval)
 * - Loading states
 * - Empty state handling
 *
 * @param props - PredictionTrendingPanel component props
 * @returns Prediction trending panel element
 */
interface PredictionTrendingPanelProps {
  onMarketClick?: (marketId: string) => void;
}

export function PredictionTrendingPanel({
  onMarketClick,
}: PredictionTrendingPanelProps) {
  const [markets, setMarkets] = useState<PredictionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/markets/predictions');
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data.questions)) {
          setMarkets(
            (data.questions as PredictionQuestion[]).map((question) => ({
              id: question.id.toString(),
              text: question.text,
              yesShares: Number(question.yesShares ?? 0),
              noShares: Number(question.noShares ?? 0),
              resolutionDate: question.resolutionDate ?? undefined,
            }))
          );
        }
      } catch (error) {
        logger.error(
          'Failed to fetch hot predictions',
          { error },
          'PredictionTrendingPanel'
        );
        // Keep existing data on error
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
    const interval = setInterval(fetchPredictions, 60000);
    return () => clearInterval(interval);
  }, []);

  usePredictionMarketsSubscription({
    onTrade: (event) => {
      setMarkets((prev) =>
        prev.map((market) =>
          market.id === event.marketId
            ? {
                ...market,
                yesShares: event.yesShares,
                noShares: event.noShares,
              }
            : market
        )
      );
    },
    onResolution: (event) => {
      setMarkets((prev) =>
        prev.map((market) =>
          market.id === event.marketId
            ? {
                ...market,
                yesShares: event.yesShares,
                noShares: event.noShares,
              }
            : market
        )
      );
    },
  });

  const sortedMarkets = useMemo(() => {
    return [...markets]
      .filter((m) => m.yesShares + m.noShares > 0)
      .sort((a, b) => b.yesShares + b.noShares - (a.yesShares + a.noShares))
      .slice(0, 4);
  }, [markets]);

  const renderProbability = (market: PredictionSummary) => {
    const total = market.yesShares + market.noShares;
    const yesPercent = total > 0 ? (market.yesShares / total) * 100 : 50;
    return yesPercent.toFixed(1);
  };

  return (
    <div className="flex flex-1 flex-col rounded-2xl bg-sidebar px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" />
        <h2 className="font-semibold text-foreground text-sm">
          Hot Predictions
        </h2>
      </div>
      {loading ? (
        <div className="flex-1 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : sortedMarkets.length === 0 ? (
        <div className="text-muted-foreground text-xs">
          No active prediction markets
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {sortedMarkets.map((market) => (
            <button
              key={market.id}
              onClick={() => onMarketClick?.(market.id)}
              className={cn(
                'w-full cursor-pointer rounded-lg p-2 text-left transition-colors hover:bg-muted/50'
              )}
            >
              <div className="line-clamp-2 font-medium text-foreground text-sm">
                {market.text}
              </div>
              <div className="flex items-center justify-between pt-1 text-muted-foreground text-xs">
                <span>
                  Volume: {(market.yesShares + market.noShares).toFixed(0)}{' '}
                  shares
                </span>
                <span className="font-semibold text-green-600">
                  {renderProbability(market)}% YES
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

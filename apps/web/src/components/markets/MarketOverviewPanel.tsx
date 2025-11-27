'use client';

import {
  Activity,
  BarChart3,
  DollarSign,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { usePredictionMarketsSubscription } from '@/hooks/usePredictionMarketStream';
import { cn } from '@babylon/shared';

/**
 * Perpetual market structure for market overview.
 */
interface PerpMarket {
  ticker: string;
  organizationId: string;
  name: string;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: {
    rate: number;
    nextFundingTime: string;
    predictedRate: number;
  };
  maxLeverage: number;
  minOrderSize: number;
}

/**
 * Market overview statistics structure.
 */
interface MarketOverview {
  totalMarkets: number;
  totalVolume24h: number;
  totalOpenInterest: number;
  avgChange24h: number;
  marketsUp: number;
  marketsDown: number;
}

/**
 * Prediction market statistics structure.
 */
interface PredictionStat {
  yesShares: number;
  noShares: number;
  resolved: boolean;
}

/**
 * Prediction question summary structure from API.
 */
interface PredictionQuestionSummary {
  id: string | number;
  yesShares?: number | null;
  noShares?: number | null;
  status?: string | null;
}

/**
 * Market overview panel component displaying aggregate market statistics.
 *
 * Displays summary statistics for both perpetual and prediction markets including
 * total markets, volume, open interest, and price changes. Subscribes to real-time
 * prediction market updates via SSE. Shows loading states while fetching data.
 *
 * Features:
 * - Total markets count
 * - 24h volume and open interest
 * - Average price change
 * - Markets up/down counts
 * - Real-time prediction market updates
 *
 * @returns Market overview panel element
 */
export function MarketOverviewPanel() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [predictionStats, setPredictionStats] = useState<
    Record<string, PredictionStat>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      const [perpsResponse, predictionsResponse] = await Promise.all([
        fetch('/api/markets/perps'),
        fetch('/api/markets/predictions'),
      ]);

      const data = await perpsResponse.json();
      const predictionsData = await predictionsResponse.json();

      if (data.markets && Array.isArray(data.markets)) {
        const markets = data.markets as PerpMarket[];
        const totalVolume = markets.reduce(
          (sum: number, m: PerpMarket) => sum + (m.volume24h || 0),
          0
        );
        const totalOI = markets.reduce(
          (sum: number, m: PerpMarket) => sum + (m.openInterest || 0),
          0
        );
        const avgChange =
          markets.length > 0
            ? markets.reduce(
                (sum: number, m: PerpMarket) => sum + (m.changePercent24h || 0),
                0
              ) / markets.length
            : 0;
        const marketsUp = markets.filter(
          (m: PerpMarket) => (m.changePercent24h || 0) > 0
        ).length;
        const marketsDown = markets.filter(
          (m: PerpMarket) => (m.changePercent24h || 0) < 0
        ).length;

        setOverview({
          totalMarkets: markets.length,
          totalVolume24h: totalVolume,
          totalOpenInterest: totalOI,
          avgChange24h: avgChange,
          marketsUp,
          marketsDown,
        });
      }

      if (
        predictionsData.questions &&
        Array.isArray(predictionsData.questions)
      ) {
        const stats: Record<string, PredictionStat> = {};
        (predictionsData.questions as PredictionQuestionSummary[]).forEach(
          (question) => {
            stats[question.id.toString()] = {
              yesShares: Number(question.yesShares ?? 0),
              noShares: Number(question.noShares ?? 0),
              resolved: question.status === 'resolved',
            };
          }
        );
        setPredictionStats(stats);
      }
      setLoading(false);
    };

    fetchOverview();
    const interval = setInterval(fetchOverview, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  usePredictionMarketsSubscription({
    onTrade: (event) => {
      setPredictionStats((prev) => ({
        ...prev,
        [event.marketId]: {
          yesShares: event.yesShares,
          noShares: event.noShares,
          resolved: false,
        },
      }));
    },
    onResolution: (event) => {
      setPredictionStats((prev) => ({
        ...prev,
        [event.marketId]: {
          yesShares: event.yesShares,
          noShares: event.noShares,
          resolved: true,
        },
      }));
    },
  });

  const predictionOverview = useMemo(() => {
    const entries = Object.values(predictionStats);
    const active = entries.filter((entry) => !entry.resolved);
    const totalVolume = active.reduce(
      (sum, entry) => sum + entry.yesShares + entry.noShares,
      0
    );

    return {
      activeCount: active.length,
      totalVolume,
    };
  }, [predictionStats]);

  const formatVolume = (v: number) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${(v / 1e3).toFixed(2)}K`;
  };

  return (
    <div className="flex flex-1 flex-col rounded-2xl bg-sidebar p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[#0066FF]" />
        <h2 className="font-bold text-foreground text-xl">Market Overview</h2>
      </div>
      {loading ? (
        <div className="flex-1 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : overview ? (
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Total Markets
              </span>
              <span className="font-semibold text-foreground text-sm">
                {overview.totalMarkets}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  24h Volume
                </span>
              </div>
              <span className="font-semibold text-foreground text-sm">
                {formatVolume(overview.totalVolume24h)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  Open Interest
                </span>
              </div>
              <span className="font-semibold text-foreground text-sm">
                {formatVolume(overview.totalOpenInterest)}
              </span>
            </div>
          </div>

          <div className="border-border border-t pt-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Avg Change 24h
              </span>
              <div
                className={cn(
                  'flex items-center gap-1 font-semibold text-sm',
                  overview.avgChange24h >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {overview.avgChange24h >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {overview.avgChange24h >= 0 ? '+' : ''}
                {overview.avgChange24h.toFixed(2)}%
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-green-600">
                <TrendingUp className="h-3 w-3" />
                <span>{overview.marketsUp} Up</span>
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <TrendingDown className="h-3 w-3" />
                <span>{overview.marketsDown} Down</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-border border-t pt-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#0066FF]" />
              <span className="font-semibold text-foreground text-sm">
                Prediction Markets
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Active</span>
              <span className="font-semibold text-foreground text-sm">
                {predictionOverview.activeCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Total Volume
              </span>
              <span className="font-semibold text-foreground text-sm">
                {predictionOverview.totalVolume.toFixed(0)} shares
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 text-muted-foreground text-sm">
          No data available
        </div>
      )}
    </div>
  );
}

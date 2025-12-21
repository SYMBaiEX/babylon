'use client';

import { logger } from '@babylon/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolioPnL } from '@/hooks/usePortfolioPnL';
import { useUserPositions } from '@/hooks/useUserPositions';
import { usePerpMarkets } from '@/stores/perpMarketsStore';
import type {
  PerpMarket,
  PredictionMarketWithPosition,
  PredictionSort,
} from '@/types/markets';

/**
 * Computed P&L data for a market category.
 */
export interface CategoryPnLData {
  unrealizedPnL: number;
  positionCount: number;
  totalValue: number;
  categorySpecific: {
    openInterest?: number;
    totalShares?: number;
  };
}

/**
 * Perp market with computed trending score.
 */
export interface TrendingPerpMarket extends PerpMarket {
  trendingScore: number;
}

/**
 * Prediction market with computed total shares.
 */
export interface TopPrediction extends PredictionMarketWithPosition {
  totalShares: number;
}

/**
 * Return type for the useMarketsPageData hook.
 */
export interface MarketsPageData {
  // Auth state
  user: ReturnType<typeof useAuth>['user'];
  authenticated: boolean;
  login: ReturnType<typeof useAuth>['login'];

  // Loading states
  loading: boolean;
  perpLoading: boolean;
  predictionsLoading: boolean;
  portfolioLoading: boolean;

  // Raw data
  perpMarkets: PerpMarket[];
  predictions: PredictionMarketWithPosition[];

  // Positions
  perpPositions: ReturnType<typeof useUserPositions>['perpPositions'];
  predictionPositions: ReturnType<
    typeof useUserPositions
  >['predictionPositions'];

  // Portfolio
  portfolioPnL: ReturnType<typeof usePortfolioPnL>['data'];
  portfolioError: ReturnType<typeof usePortfolioPnL>['error'];
  /** Timestamp of last portfolio update (ms since epoch) */
  portfolioUpdatedAt: number | null;

  // Computed data
  trendingMarkets: TrendingPerpMarket[];
  topPredictions: TopPrediction[];
  perpPnLData: CategoryPnLData | null;
  predictionPnLData: CategoryPnLData | null;

  // Filtered/sorted data (based on search and sort)
  filteredPerpMarkets: PerpMarket[];
  activePredictions: PredictionMarketWithPosition[];
  resolvedPredictions: PredictionMarketWithPosition[];

  // Search and sort state
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  deferredSearchQuery: string;
  predictionSort: PredictionSort;
  setPredictionSort: (sort: PredictionSort) => void;

  // Actions
  handlePositionsRefresh: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  refetchData: () => Promise<void>;

  // Modal triggers
  balanceRefreshTrigger: number;
  triggerBalanceRefresh: () => void;
}

/**
 * Centralized data hook for the Markets page.
 *
 * Handles all data fetching, caching, computed values, and filtering
 * for the markets dashboard. Extracts data logic from the page component
 * to improve maintainability and testability.
 *
 * @returns Markets page data and actions
 */
export function useMarketsPageData(): MarketsPageData {
  const { user, authenticated, login } = useAuth();

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [deferredSearchQuery, setDeferredSearchQuery] = useState('');
  const [predictionSort, setPredictionSort] =
    useState<PredictionSort>('trending');

  // Debounce search query for performance
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDeferredSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Perp markets from store
  const {
    markets: perpMarkets,
    loading: perpLoading,
    refetch: refetchPerps,
  } = usePerpMarkets();

  // Predictions state
  const [predictions, setPredictions] = useState<
    PredictionMarketWithPosition[]
  >([]);
  const [predictionsLoading, setPredictionsLoading] = useState(true);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0);

  // Portfolio P&L
  const {
    data: portfolioPnL,
    loading: portfolioLoading,
    error: portfolioError,
    refresh: refreshPortfolio,
    lastUpdated: portfolioUpdatedAt,
  } = usePortfolioPnL();

  // User positions
  const {
    perpPositions,
    predictionPositions,
    refresh: refreshUserPositions,
  } = useUserPositions(user?.id, { enabled: authenticated });

  // Refs to break dependency chains
  const fetchDataRef = useRef<((signal?: AbortSignal) => Promise<void>) | null>(
    null
  );
  const refreshPositionsRef = useRef(refreshUserPositions);
  const authenticatedRef = useRef(authenticated);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const prevAuthRef = useRef<{
    authenticated: boolean;
    userId: string | null | undefined;
  } | null>(null);
  const hasMountedRef = useRef(false);

  // Update refs when values change
  useEffect(() => {
    authenticatedRef.current = authenticated;
    userIdRef.current = user?.id ?? null;
  }, [authenticated, user?.id]);

  useEffect(() => {
    refreshPositionsRef.current = refreshUserPositions;
  }, [refreshUserPositions]);

  // Combined loading state - true while either is loading
  const loading = perpLoading || predictionsLoading;

  /**
   * Fetches prediction markets data.
   */
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    const isAuth = authenticatedRef.current;
    const userId = userIdRef.current;

    const url = `/api/markets/predictions${isAuth && userId ? `?userId=${userId}` : ''}`;

    const response = await fetch(url, { signal });

    if (!response.ok) {
      logger.error(
        'Failed to fetch predictions',
        { status: response.status },
        'useMarketsPageData'
      );
      setPredictionsLoading(false);
      return;
    }

    const data = await response.json();
    setPredictions(data.questions ?? []);

    if (isAuth && userId && refreshPositionsRef.current) {
      await refreshPositionsRef.current();
    }

    setBalanceRefreshTrigger(Date.now());
    setPredictionsLoading(false);
  }, []);

  // Store fetchData in ref
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Refresh portfolio when balance changes
  useEffect(() => {
    if (!authenticated || !balanceRefreshTrigger) return;
    void refreshPortfolio();
  }, [authenticated, balanceRefreshTrigger, refreshPortfolio]);

  // Initial fetch and auth state change handling
  useEffect(() => {
    const controller = new AbortController();
    const currentAuth = { authenticated, userId: user?.id };

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevAuthRef.current = currentAuth;
      fetchData(controller.signal).catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn(
            'Failed to fetch predictions',
            { error: err.message },
            'useMarketsPageData'
          );
        }
      });
      return () => controller.abort();
    }

    const prevAuth = prevAuthRef.current;
    if (
      prevAuth &&
      (prevAuth.authenticated !== currentAuth.authenticated ||
        prevAuth.userId !== currentAuth.userId)
    ) {
      prevAuthRef.current = currentAuth;
      fetchData(controller.signal).catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn(
            'Failed to fetch predictions',
            { error: err.message },
            'useMarketsPageData'
          );
        }
      });
    }

    return () => controller.abort();
  }, [authenticated, user?.id, fetchData]);

  /**
   * Refreshes all position data and markets.
   */
  const handlePositionsRefresh = useCallback(async () => {
    if (refreshPositionsRef.current) {
      await refreshPositionsRef.current();
    }
    await refetchPerps();
    if (fetchDataRef.current) {
      await fetchDataRef.current();
    }
  }, [refetchPerps]);

  /**
   * Triggers a balance refresh for dependent components.
   */
  const triggerBalanceRefresh = useCallback(() => {
    setBalanceRefreshTrigger(Date.now());
  }, []);

  /**
   * Refetches all data.
   */
  const refetchData = useCallback(async () => {
    if (fetchDataRef.current) {
      await fetchDataRef.current();
    }
  }, []);

  // ============================================================================
  // Computed values
  // ============================================================================

  /**
   * Filtered perp markets based on search query.
   */
  const filteredPerpMarkets = useMemo(() => {
    if (!deferredSearchQuery.trim()) return perpMarkets;
    const query = deferredSearchQuery.toLowerCase();
    return perpMarkets.filter(
      (m) =>
        m.ticker.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query)
    );
  }, [perpMarkets, deferredSearchQuery]);

  /**
   * Filtered predictions based on search query.
   */
  const filteredPredictions = useMemo(() => {
    if (!deferredSearchQuery.trim()) return predictions;
    const query = deferredSearchQuery.toLowerCase();
    return predictions.filter((p) => p.text.toLowerCase().includes(query));
  }, [predictions, deferredSearchQuery]);

  /**
   * Sorted active predictions based on selected sort option.
   */
  const sortedPredictions = useMemo(() => {
    const active = filteredPredictions.filter((p) => p.status === 'active');

    return [...active].sort((a, b) => {
      switch (predictionSort) {
        case 'trending': {
          const aVolume = (a.yesShares ?? 0) + (a.noShares ?? 0);
          const bVolume = (b.yesShares ?? 0) + (b.noShares ?? 0);
          const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
          const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;
          const aScore = aVolume * 0.7 + (aTime / 1_000_000) * 0.3;
          const bScore = bVolume * 0.7 + (bTime / 1_000_000) * 0.3;
          return bScore - aScore;
        }
        case 'newest':
          return (
            (b.createdDate ? new Date(b.createdDate).getTime() : 0) -
            (a.createdDate ? new Date(a.createdDate).getTime() : 0)
          );
        case 'ending-soon':
          return (
            (a.resolutionDate
              ? new Date(a.resolutionDate).getTime()
              : Number.POSITIVE_INFINITY) -
            (b.resolutionDate
              ? new Date(b.resolutionDate).getTime()
              : Number.POSITIVE_INFINITY)
          );
        case 'volume':
          return (
            (b.yesShares ?? 0) +
            (b.noShares ?? 0) -
            ((a.yesShares ?? 0) + (a.noShares ?? 0))
          );
        default:
          return 0;
      }
    });
  }, [filteredPredictions, predictionSort]);

  /**
   * Resolved predictions.
   */
  const resolvedPredictions = useMemo(
    () => filteredPredictions.filter((p) => p.status === 'resolved'),
    [filteredPredictions]
  );

  /**
   * Top trending perp markets (weighted by change % and volume).
   *
   * Trending score algorithm:
   * - Volume score: normalized to 0-30 range (volume / maxVolume * 30)
   *   This ensures high-volume markets get visibility regardless of price movement.
   * - Change score: absolute price change * 0.7
   *   Uses Math.abs so both gains and losses contribute to "trending".
   *   The 0.7 multiplier balances change impact against volume.
   *
   * Final score = volumeScore + changeScore
   * Returns top 6 markets sorted by trending score descending.
   */
  const trendingMarkets = useMemo((): TrendingPerpMarket[] => {
    if (perpMarkets.length === 0) return [];

    // Prevent division by zero when all markets have zero volume
    const maxVolume = Math.max(...perpMarkets.map((m) => m.volume24h), 1);

    return perpMarkets
      .map((market) => {
        // Volume normalized to 0-30 range for consistent weighting
        const volumeScore = (market.volume24h / maxVolume) * 30;
        // Absolute change * 0.7 - both gains and losses are "trending"
        const changeScore = Math.abs(market.changePercent24h) * 0.7;
        return {
          ...market,
          trendingScore: changeScore + volumeScore,
        };
      })
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, 6);
  }, [perpMarkets]);

  /**
   * Top predictions by volume.
   */
  const topPredictions = useMemo((): TopPrediction[] => {
    return predictions
      .filter((p) => p.status === 'active')
      .map((p) => ({
        ...p,
        totalShares: (p.yesShares ?? 0) + (p.noShares ?? 0),
      }))
      .sort((a, b) => b.totalShares - a.totalShares)
      .slice(0, 6);
  }, [predictions]);

  /**
   * Computed P&L data for perp positions.
   */
  const perpPnLData = useMemo((): CategoryPnLData | null => {
    if (perpPositions.length === 0) return null;

    const unrealizedPnL = perpPositions.reduce(
      (sum, pos) => sum + (pos.unrealizedPnL ?? 0),
      0
    );
    // totalValue and openInterest are equivalent for perps (sum of absolute position sizes)
    // In a more sophisticated implementation, totalValue could include notional (size * price)
    const openInterest = perpPositions.reduce(
      (sum, pos) => sum + Math.abs(pos.size ?? 0),
      0
    );

    return {
      unrealizedPnL,
      positionCount: perpPositions.length,
      totalValue: openInterest,
      categorySpecific: { openInterest },
    };
  }, [perpPositions]);

  /**
   * Computed P&L data for prediction positions.
   */
  const predictionPnLData = useMemo((): CategoryPnLData | null => {
    if (predictionPositions.length === 0) return null;

    const unrealizedPnL = predictionPositions.reduce((sum, pos) => {
      const currentValue = pos.shares * pos.currentPrice;
      const costBasis = pos.shares * pos.avgPrice;
      return sum + (currentValue - costBasis);
    }, 0);
    const totalShares = predictionPositions.reduce(
      (sum, pos) => sum + pos.shares,
      0
    );
    const totalValue = predictionPositions.reduce(
      (sum, pos) => sum + pos.shares * pos.currentPrice,
      0
    );

    return {
      unrealizedPnL,
      positionCount: predictionPositions.length,
      totalValue,
      categorySpecific: { totalShares },
    };
  }, [predictionPositions]);

  return {
    // Auth
    user,
    authenticated,
    login,

    // Loading
    loading,
    perpLoading,
    predictionsLoading,
    portfolioLoading,

    // Data
    perpMarkets,
    predictions,
    perpPositions,
    predictionPositions,
    portfolioPnL,
    portfolioError,
    portfolioUpdatedAt,

    // Computed
    trendingMarkets,
    topPredictions,
    perpPnLData,
    predictionPnLData,
    filteredPerpMarkets,
    activePredictions: sortedPredictions,
    resolvedPredictions,

    // Search/Sort
    searchQuery,
    setSearchQuery,
    deferredSearchQuery,
    predictionSort,
    setPredictionSort,

    // Actions
    handlePositionsRefresh,
    refreshPortfolio,
    refetchData,
    balanceRefreshTrigger,
    triggerBalanceRefresh,
  };
}

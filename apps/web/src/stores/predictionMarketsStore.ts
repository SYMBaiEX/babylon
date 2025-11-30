/**
 * Prediction Markets Store - Centralized state management for prediction markets data
 *
 * This store prevents duplicate API calls by:
 * 1. Caching data with a TTL (10 seconds)
 * 2. Deduplicating concurrent requests via a fetchPromise
 * 3. Providing a single polling mechanism that all components share
 *
 * Usage:
 * ```tsx
 * import { usePredictionMarkets, usePredictionMarketsPolling } from '@/stores/predictionMarketsStore';
 *
 * function MyComponent() {
 *   const { markets, loading, error, refetch } = usePredictionMarkets();
 *   usePredictionMarketsPolling(30000); // Optional: enable polling every 30s
 *   return <div>{markets.map(m => ...)}</div>;
 * }
 * ```
 */

import { create } from 'zustand';
import { useEffect, useCallback, useRef } from 'react';
import { logger } from '@babylon/shared/client';

/**
 * Prediction market data structure from API
 */
export interface PredictionMarket {
  id: number | string;
  text: string;
  status: 'active' | 'resolved' | 'cancelled';
  createdDate?: string;
  resolutionDate?: string;
  resolvedOutcome?: boolean;
  scenario: number;
  yesShares?: number;
  noShares?: number;
  oracleCommitTxHash?: string | null;
  oracleRevealTxHash?: string | null;
  oraclePublishedAt?: string | null;
}

interface PredictionMarketsState {
  // Data
  markets: PredictionMarket[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  // Internal state for request deduplication
  fetchPromise: Promise<void> | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  pollingRefCount: number;

  // Actions
  setMarkets: (markets: PredictionMarket[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchMarkets: (force?: boolean, userId?: string) => Promise<void>;
  startPolling: (intervalMs: number, userId?: string) => void;
  stopPolling: () => void;
  incrementPollingRef: () => void;
  decrementPollingRef: () => void;
}

// Cache TTL in milliseconds (10 seconds)
const CACHE_TTL = 10000;

export const usePredictionMarketsStore = create<PredictionMarketsState>(
  (set, get) => ({
    markets: [],
    loading: false,
    error: null,
    lastFetchedAt: null,
    fetchPromise: null,
    pollingInterval: null,
    pollingRefCount: 0,

    setMarkets: (markets) => set({ markets }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    fetchMarkets: async (force = false, userId?: string) => {
      const state = get();

      // Return existing promise if already fetching (deduplication)
      if (state.fetchPromise) {
        return state.fetchPromise;
      }

      // Return cached data if fresh and not forced
      if (
        !force &&
        state.lastFetchedAt &&
        Date.now() - state.lastFetchedAt < CACHE_TTL &&
        state.markets.length > 0
      ) {
        return;
      }

      // Create and store the fetch promise
      const fetchPromise = (async () => {
        set({ loading: state.markets.length === 0, error: null });

        try {
          const url = userId
            ? `/api/markets/predictions?userId=${encodeURIComponent(userId)}`
            : '/api/markets/predictions';
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch prediction markets: ${response.status}`
            );
          }

          const data = await response.json();
          if (data.questions && Array.isArray(data.questions)) {
            set({
              markets: data.questions,
              lastFetchedAt: Date.now(),
              error: null,
            });
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to fetch markets';
          logger.error(
            'Failed to fetch prediction markets',
            { error: err },
            'predictionMarketsStore'
          );
          set({ error: errorMessage });
        } finally {
          set({ loading: false, fetchPromise: null });
        }
      })();

      set({ fetchPromise });
      return fetchPromise;
    },

    startPolling: (intervalMs: number, userId?: string) => {
      const state = get();

      // Already polling
      if (state.pollingInterval) {
        return;
      }

      // Initial fetch
      get().fetchMarkets(false, userId);

      // Set up interval
      const interval = setInterval(() => {
        get().fetchMarkets(true, userId); // Force refresh on poll
      }, intervalMs);

      set({ pollingInterval: interval });
    },

    stopPolling: () => {
      const state = get();
      if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        set({ pollingInterval: null });
      }
    },

    incrementPollingRef: () => {
      set((state) => ({ pollingRefCount: state.pollingRefCount + 1 }));
    },

    decrementPollingRef: () => {
      set((state) => ({
        pollingRefCount: Math.max(0, state.pollingRefCount - 1),
      }));
    },
  })
);

/**
 * Hook for consuming prediction markets data
 * Automatically fetches data on mount if not cached
 */
export function usePredictionMarkets(userId?: string) {
  const markets = usePredictionMarketsStore((state) => state.markets);
  const loading = usePredictionMarketsStore((state) => state.loading);
  const error = usePredictionMarketsStore((state) => state.error);
  const fetchMarkets = usePredictionMarketsStore((state) => state.fetchMarkets);

  // Fetch on mount if needed
  useEffect(() => {
    fetchMarkets(false, userId);
  }, [fetchMarkets, userId]);

  const refetch = useCallback(() => {
    return fetchMarkets(true, userId);
  }, [fetchMarkets, userId]);

  return { markets, loading, error, refetch };
}

/**
 * Hook for enabling polling on prediction markets
 * Uses reference counting so multiple components can request polling
 * and it only stops when all components unmount
 *
 * @param intervalMs - Polling interval in milliseconds (default: 30000)
 * @param userId - Optional user ID for fetching with positions
 */
export function usePredictionMarketsPolling(
  intervalMs = 30000,
  userId?: string
) {
  const incrementPollingRef = usePredictionMarketsStore(
    (state) => state.incrementPollingRef
  );
  const decrementPollingRef = usePredictionMarketsStore(
    (state) => state.decrementPollingRef
  );
  const startPolling = usePredictionMarketsStore((state) => state.startPolling);
  const stopPolling = usePredictionMarketsStore((state) => state.stopPolling);
  const pollingRefCount = usePredictionMarketsStore(
    (state) => state.pollingRefCount
  );

  const intervalRef = useRef(intervalMs);
  const userIdRef = useRef(userId);
  intervalRef.current = intervalMs;
  userIdRef.current = userId;

  useEffect(() => {
    incrementPollingRef();

    // Start polling if we're the first subscriber
    if (pollingRefCount === 0) {
      startPolling(intervalRef.current, userIdRef.current);
    }

    return () => {
      decrementPollingRef();

      // Stop polling if we're the last subscriber
      // Use setTimeout to let the state update first
      setTimeout(() => {
        const currentCount =
          usePredictionMarketsStore.getState().pollingRefCount;
        if (currentCount === 0) {
          stopPolling();
        }
      }, 0);
    };
  }, [
    incrementPollingRef,
    decrementPollingRef,
    startPolling,
    stopPolling,
    pollingRefCount,
  ]);
}

/**
 * Get a specific market by ID
 */
export function usePredictionMarket(marketId: string | number) {
  const { markets, loading, error, refetch } = usePredictionMarkets();

  const market = markets.find(
    (m) => m.id.toString() === marketId.toString()
  );

  return { market, loading, error, refetch };
}

/**
 * Get active markets only
 */
export function useActivePredictionMarkets() {
  const { markets, loading, error, refetch } = usePredictionMarkets();

  const activeMarkets = markets.filter((m) => m.status === 'active');

  return { markets: activeMarkets, loading, error, refetch };
}

/**
 * Get market statistics
 */
export function usePredictionMarketsStats() {
  const { markets, loading } = usePredictionMarkets();

  const stats = {
    total: markets.length,
    active: markets.filter((m) => m.status === 'active').length,
    resolved: markets.filter((m) => m.status === 'resolved').length,
    totalVolume: markets.reduce(
      (sum, m) => sum + (m.yesShares || 0) + (m.noShares || 0),
      0
    ),
  };

  return { stats, loading };
}

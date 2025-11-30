/**
 * Perp Markets Store - Centralized state management for perpetual markets data
 *
 * This store prevents duplicate API calls by:
 * 1. Caching data with a TTL (10 seconds)
 * 2. Deduplicating concurrent requests via a fetchPromise
 * 3. Providing a single polling mechanism that all components share
 *
 * Usage:
 * ```tsx
 * import { usePerpMarkets, usePerpMarketsPolling } from '@/stores/perpMarketsStore';
 *
 * function MyComponent() {
 *   const { markets, loading, error, refetch } = usePerpMarkets();
 *   usePerpMarketsPolling(30000); // Optional: enable polling every 30s
 *   return <div>{markets.map(m => ...)}</div>;
 * }
 * ```
 */

import { create } from 'zustand';
import { useEffect, useCallback, useRef } from 'react';
import { logger } from '@babylon/shared';

/**
 * Perp market data structure from API
 */
export interface PerpMarket {
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

interface PerpMarketsState {
  // Data
  markets: PerpMarket[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  // Internal state for request deduplication
  fetchPromise: Promise<void> | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  pollingRefCount: number;

  // Actions
  setMarkets: (markets: PerpMarket[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchMarkets: (force?: boolean) => Promise<void>;
  startPolling: (intervalMs: number) => void;
  stopPolling: () => void;
  incrementPollingRef: () => void;
  decrementPollingRef: () => void;
}

// Cache TTL in milliseconds (10 seconds)
const CACHE_TTL = 10000;

export const usePerpMarketsStore = create<PerpMarketsState>((set, get) => ({
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

  fetchMarkets: async (force = false) => {
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
        const response = await fetch('/api/markets/perps');
        if (!response.ok) {
          throw new Error(`Failed to fetch perp markets: ${response.status}`);
        }

        const data = await response.json();
        if (data.markets && Array.isArray(data.markets)) {
          set({
            markets: data.markets,
            lastFetchedAt: Date.now(),
            error: null,
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch markets';
        logger.error('Failed to fetch perp markets', { error: err }, 'perpMarketsStore');
        set({ error: errorMessage });
      } finally {
        set({ loading: false, fetchPromise: null });
      }
    })();

    set({ fetchPromise });
    return fetchPromise;
  },

  startPolling: (intervalMs: number) => {
    const state = get();

    // Already polling
    if (state.pollingInterval) {
      return;
    }

    // Initial fetch
    get().fetchMarkets();

    // Set up interval
    const interval = setInterval(() => {
      get().fetchMarkets(true); // Force refresh on poll
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
}));

/**
 * Hook for consuming perp markets data
 * Automatically fetches data on mount if not cached
 */
export function usePerpMarkets() {
  const markets = usePerpMarketsStore((state) => state.markets);
  const loading = usePerpMarketsStore((state) => state.loading);
  const error = usePerpMarketsStore((state) => state.error);
  const fetchMarkets = usePerpMarketsStore((state) => state.fetchMarkets);

  // Fetch on mount if needed
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const refetch = useCallback(() => {
    return fetchMarkets(true);
  }, [fetchMarkets]);

  return { markets, loading, error, refetch };
}

/**
 * Hook for enabling polling on perp markets
 * Uses reference counting so multiple components can request polling
 * and it only stops when all components unmount
 *
 * @param intervalMs - Polling interval in milliseconds (default: 30000)
 */
export function usePerpMarketsPolling(intervalMs = 30000) {
  const incrementPollingRef = usePerpMarketsStore(
    (state) => state.incrementPollingRef
  );
  const decrementPollingRef = usePerpMarketsStore(
    (state) => state.decrementPollingRef
  );
  const startPolling = usePerpMarketsStore((state) => state.startPolling);
  const stopPolling = usePerpMarketsStore((state) => state.stopPolling);
  const pollingRefCount = usePerpMarketsStore((state) => state.pollingRefCount);

  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    incrementPollingRef();

    // Start polling if we're the first subscriber
    if (pollingRefCount === 0) {
      startPolling(intervalRef.current);
    }

    return () => {
      decrementPollingRef();

      // Stop polling if we're the last subscriber
      // Use setTimeout to let the state update first
      setTimeout(() => {
        const currentCount = usePerpMarketsStore.getState().pollingRefCount;
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
 * Get a specific market by ticker
 */
export function usePerpMarket(ticker: string) {
  const { markets, loading, error, refetch } = usePerpMarkets();

  const market = markets.find(
    (m) => m.ticker.toLowerCase() === ticker.toLowerCase()
  );

  return { market, loading, error, refetch };
}

/**
 * Get top movers (gainers and losers)
 */
export function usePerpTopMovers(count = 4) {
  const { markets, loading, error, refetch } = usePerpMarkets();

  const sorted = [...markets].sort(
    (a, b) => b.changePercent24h - a.changePercent24h
  );

  const topGainers = sorted.slice(0, count);
  const topLosers = sorted.slice(-count).reverse();

  return { topGainers, topLosers, loading, error, refetch };
}

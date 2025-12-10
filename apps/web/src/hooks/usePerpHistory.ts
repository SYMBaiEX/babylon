import { useCallback, useEffect, useRef, useState } from 'react';

import { useMarketPrices } from '@/hooks/useMarketPrices';

/**
 * Represents a single point in perpetual market price history.
 */
export interface PerpHistoryPoint {
  /** Timestamp in milliseconds */
  time: number;
  /** Price at this point */
  price: number;
  /** Price change from previous point */
  change?: number;
  /** Percentage change from previous point */
  changePercent?: number;
  /** Volume at this point */
  volume?: number;
}

/**
 * Seed data for initializing history when API data is unavailable.
 */
interface SeedSnapshot {
  /** Current price to seed with */
  currentPrice?: number;
}

/**
 * Options for configuring perp history loading.
 */
interface UsePerpHistoryOptions {
  /** Maximum number of history points to keep (default: 200) */
  limit?: number;
  /** Seed data to use if API fails or returns no data */
  seed?: SeedSnapshot;
}

/**
 * Hook for fetching and managing perpetual market price history.
 *
 * Loads historical price data from the API and maintains a rolling window
 * of price points. Automatically appends new points from real-time SSE
 * price updates. Falls back to seed data if API fails or returns no data.
 *
 * @param ticker - The ticker symbol of the perp market, or null to clear history
 * @param options - Configuration options including limit and seed data
 *
 * @returns An object containing:
 * - `history`: Array of price history points
 * - `loading`: Whether history is currently loading
 * - `error`: Any error that occurred while loading
 * - `refresh`: Function to manually reload history
 *
 * @example
 * ```tsx
 * const { history, loading } = usePerpHistory(ticker, { limit: 100 });
 *
 * // Use history for charting
 * const chartData = history.map(point => ({
 *   x: point.time,
 *   y: point.price
 * }));
 * ```
 */
export function usePerpHistory(
  ticker: string | null,
  options?: UsePerpHistoryOptions
) {
  const limit = options?.limit ?? 200;
  const seedRef = useRef<SeedSnapshot | undefined>(options?.seed);
  const [history, setHistory] = useState<PerpHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track live prices for real-time updates
  const livePrices = useMarketPrices(ticker ? [ticker] : []);
  const livePrice = ticker ? livePrices.get(ticker) : undefined;
  const lastAppendedPriceRef = useRef<number | null>(null);

  useEffect(() => {
    seedRef.current = options?.seed;
  }, [options?.seed?.currentPrice, options?.seed]);

  const formatHistory = useCallback(
    (
      points: Array<{
        price: number;
        change?: number;
        changePercent?: number;
        volume?: number | null;
        timestamp: string;
      }>
    ): PerpHistoryPoint[] => {
      return points
        .filter((point) => Number.isFinite(point.price) && point.price > 0)
        .map((point) => ({
          time: new Date(point.timestamp).getTime(),
          price: point.price,
          change: point.change,
          changePercent: point.changePercent,
          volume: point.volume ?? undefined,
        }));
    },
    []
  );

  const fallbackFromSeed = useCallback(() => {
    const seed = seedRef.current;
    if (!seed?.currentPrice) return [];
    return [
      {
        time: Date.now(),
        price: seed.currentPrice,
        change: 0,
        changePercent: 0,
        volume: 0,
      },
    ];
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!ticker) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const response = await fetch(
      `/api/markets/perps/${encodeURIComponent(ticker)}/history?limit=${limit}`
    );
    const data = await response.json();

    if (response.ok && Array.isArray(data.history) && data.history.length > 0) {
      const formatted = formatHistory(data.history);
      setHistory(formatted);
      // Track the last price we've seen
      if (formatted.length > 0) {
        lastAppendedPriceRef.current = formatted[formatted.length - 1]!.price;
      }
    } else {
      setHistory(fallbackFromSeed());
    }

    setLoading(false);
  }, [ticker, limit, formatHistory, fallbackFromSeed]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  // Append live price updates
  useEffect(() => {
    if (!livePrice?.price || !ticker) return;

    // Only append if price has changed significantly (0.01% threshold)
    const lastPrice = lastAppendedPriceRef.current;
    if (lastPrice) {
      const priceDiff = Math.abs(livePrice.price - lastPrice) / lastPrice;
      if (priceDiff < 0.0001) return; // Skip tiny changes
    }

    setHistory((prev) => {
      const lastPoint = prev.length > 0 ? prev[prev.length - 1] : null;
      const change = lastPoint ? livePrice.price - lastPoint.price : 0;
      const changePercent = lastPoint?.price
        ? (change / lastPoint.price) * 100
        : 0;

      const point: PerpHistoryPoint = {
        time: Date.now(),
        price: livePrice.price,
        change,
        changePercent,
        volume: 0,
      };

      const next = [...prev, point];
      if (next.length > limit) {
        next.shift();
      }

      lastAppendedPriceRef.current = livePrice.price;
      return next;
    });
  }, [livePrice?.price, ticker, limit]);

  return {
    history,
    loading,
    error,
    refresh: fetchHistory,
  };
}


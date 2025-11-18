import { useCallback, useEffect, useRef, useState } from 'react';

import { usePredictionMarketStream } from '@/hooks/usePredictionMarketStream';

/**
 * Represents a single point in prediction market price history.
 */
export interface PredictionHistoryPoint {
  /** Timestamp in milliseconds */
  time: number;
  /** Current YES outcome price (0-1) */
  yesPrice: number;
  /** Current NO outcome price (0-1) */
  noPrice: number;
  /** Trading volume since last point */
  volume: number;
  /** Total liquidity in the market */
  liquidity: number;
}

/**
 * Seed data for initializing history when API data is unavailable.
 */
interface SeedSnapshot {
  /** Initial YES shares */
  yesShares?: number;
  /** Initial NO shares */
  noShares?: number;
  /** Initial liquidity */
  liquidity?: number;
}

/**
 * Options for configuring prediction history loading.
 */
interface UsePredictionHistoryOptions {
  /** Maximum number of history points to keep (default: 200) */
  limit?: number;
  /** Seed data to use if API fails or returns no data */
  seed?: SeedSnapshot;
}

/**
 * Hook for fetching and managing prediction market price history.
 * 
 * Loads historical price data from the API and maintains a rolling window
 * of price points. Automatically appends new points from real-time SSE
 * updates. Falls back to seed data if API fails or returns no data.
 * 
 * @param marketId - The ID of the prediction market, or null to clear history
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
 * const { history, loading } = usePredictionHistory(marketId, { limit: 100 });
 * 
 * // Use history for charting
 * const chartData = history.map(point => ({
 *   x: point.time,
 *   y: point.yesPrice
 * }));
 * ```
 */
export function usePredictionHistory(
  marketId: string | null,
  options?: UsePredictionHistoryOptions
) {
  const limit = options?.limit ?? 200;
  const seedRef = useRef<SeedSnapshot | undefined>(options?.seed);
  const [history, setHistory] = useState<PredictionHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedRef.current = options?.seed;
  }, [options?.seed?.yesShares, options?.seed?.noShares, options?.seed?.liquidity]);

  const formatHistory = useCallback(
    (points: Array<{
      yesPrice: number;
      noPrice: number;
      liquidity?: number;
      timestamp: string;
    }>): PredictionHistoryPoint[] => {
      let prevLiquidity: number | null = null;
      return points.map((point) => {
        const liquidity = Number(point.liquidity ?? prevLiquidity ?? 0);
        const volume =
          prevLiquidity === null ? 0 : Math.max(0, Math.abs(liquidity - prevLiquidity));
        prevLiquidity = liquidity;
        return {
          time: new Date(point.timestamp).getTime(),
          yesPrice: point.yesPrice,
          noPrice: point.noPrice,
          volume,
          liquidity,
        };
      });
    },
    []
  );

  const fallbackFromSeed = useCallback(() => {
    const seed = seedRef.current;
    if (!seed) return [];
    const yesShares = seed.yesShares ?? 0;
    const noShares = seed.noShares ?? 0;
    const totalShares = yesShares + noShares;
    const yesPrice = totalShares === 0 ? 0.5 : yesShares / totalShares;
    return [
      {
        time: Date.now(),
        yesPrice,
        noPrice: 1 - yesPrice,
        volume: 0,
        liquidity: seed.liquidity ?? 0,
      },
    ];
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!marketId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const response = await fetch(
      `/api/markets/predictions/${marketId}/history?limit=${limit}`
    );
    const data = await response.json();

    if (response.ok && Array.isArray(data.history) && data.history.length > 0) {
      setHistory(formatHistory(data.history));
    } else {
      setHistory(fallbackFromSeed());
    }
    
    setLoading(false);
  }, [marketId, limit, formatHistory, fallbackFromSeed]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const appendPoint = useCallback(
    (yesPrice: number, noPrice: number, liquidity: number | undefined, timestamp: number) => {
      setHistory((prev) => {
        const lastPoint = prev.length > 0 ? prev[prev.length - 1] : null;
        const normalizedLiquidity = Number.isFinite(liquidity) ? Number(liquidity) : lastPoint?.liquidity ?? 0;
        const lastLiquidity = lastPoint?.liquidity ?? normalizedLiquidity;
        const volume = Math.max(0, Math.abs(normalizedLiquidity - lastLiquidity));
        const point: PredictionHistoryPoint = {
          time: timestamp,
          yesPrice,
          noPrice,
          volume,
          liquidity: normalizedLiquidity,
        };
        const next = [...prev, point];
        if (next.length > limit) {
          next.shift();
        }
        return next;
      });
    },
    [limit]
  );

  usePredictionMarketStream(marketId, {
    onTrade: (event) => {
      const timestamp = new Date(
        event.trade.timestamp ?? new Date().toISOString()
      ).getTime();
      appendPoint(event.yesPrice, event.noPrice, event.liquidity, timestamp);
    },
    onResolution: (event) => {
      const timestamp = new Date(event.timestamp).getTime();
      appendPoint(event.yesPrice, event.noPrice, event.liquidity, timestamp);
    },
  });

  return {
    history,
    loading,
    error,
    refresh: fetchHistory,
  };
}

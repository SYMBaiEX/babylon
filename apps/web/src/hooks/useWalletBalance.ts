'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Represents wallet balance state.
 */
interface WalletBalanceState {
  /** Current available balance */
  balance: number;
  /** Lifetime profit and loss */
  lifetimePnL: number;
}

/**
 * Options for configuring wallet balance loading.
 */
interface UseWalletBalanceOptions {
  /** Whether to enable balance fetching (default: true) */
  enabled?: boolean;
}

const defaultState: WalletBalanceState = {
  balance: 0,
  lifetimePnL: 0,
};

/**
 * Hook for fetching and managing user wallet balance.
 *
 * Loads the current balance and lifetime PnL for a user's wallet. Automatically
 * refreshes when the userId changes and polls every 30 seconds to keep balance
 * up-to-date. Supports cancellation of in-flight requests and error handling.
 *
 * @param userId - The user ID to fetch balance for, or null/undefined to clear balance
 * @param options - Configuration options including enabled flag
 *
 * @returns An object containing:
 * - `balance`: Current available balance
 * - `lifetimePnL`: Lifetime profit and loss
 * - `loading`: Whether balance is currently loading
 * - `error`: Any error that occurred while fetching
 * - `refresh`: Function to manually refresh balance
 *
 * @example
 * ```tsx
 * const { balance, lifetimePnL, loading } = useWalletBalance(userId);
 *
 * if (loading) return <div>Loading balance...</div>;
 *
 * return (
 *   <div>
 *     <p>Balance: ${balance.toFixed(2)}</p>
 *     <p>Lifetime PnL: ${lifetimePnL.toFixed(2)}</p>
 *   </div>
 * );
 * ```
 */
export function useWalletBalance(
  userId?: string | null,
  options: UseWalletBalanceOptions = {}
) {
  const { enabled = true } = options;
  const [state, setState] = useState<WalletBalanceState>(defaultState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !enabled) {
      setState(defaultState);
      setLoading(false);
      setError(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/balance`,
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error('Failed to fetch wallet balance');
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(
          `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      if (controller.signal.aborted) return;

      setState({
        balance: Number(data.balance) || 0,
        lifetimePnL: Number(data.lifetimePnL) || 0,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(
        err instanceof Error ? err : new Error('Failed to fetch wallet balance')
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [userId, enabled]);

  useEffect(() => {
    if (enabled && userId) {
      void refresh();
    } else {
      setState(defaultState);
      setLoading(false);
      setError(null);
    }

    return () => {
      controllerRef.current?.abort();
    };
  }, [refresh, userId, enabled]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const interval = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [enabled, userId, refresh]);

  return {
    balance: state.balance,
    lifetimePnL: state.lifetimePnL,
    loading,
    error,
    refresh,
  };
}

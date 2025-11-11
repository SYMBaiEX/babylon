'use client';

import { useCallback } from 'react';

type TradeSide = 'long' | 'short';

interface UsePerpTradeOptions {
  getAccessToken?: () => Promise | string | null;
}

interface OpenPerpPayload {
  ticker: string;
  side: TradeSide;
  size: number;
  leverage: number;
}

type ClosePerpResponse = Record;
type OpenPerpResponse = Record;

async function resolveToken(resolver?: () => Promise | string | null): Promise {
  if (!resolver) {
    if (typeof window === 'undefined') return null;
    return window.__privyAccessToken ?? null;
  }

  const value = typeof resolver === 'function' ? resolver() : resolver;
  const token = await Promise.resolve(value);
  if (token) return token;
  if (typeof window === 'undefined') return null;
  return window.__privyAccessToken ?? null;
}

export function usePerpTrade(options: UsePerpTradeOptions = {}) {
  const callApi = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');

      const token = await resolveToken(options.getAccessToken);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(url, {
        ...init,
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          data?.error || `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      return data;
    },
    [options.getAccessToken]
  );

  const openPosition = useCallback(
    async (payload: OpenPerpPayload): Promise => {
      return await callApi('/api/markets/perps/open', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    [callApi]
  );

  const closePosition = useCallback(
    async (positionId: string): Promise => {
      return await callApi(`/api/markets/perps/${positionId}/close`, {
        method: 'POST',
      });
    },
    [callApi]
  );

  return {
    openPosition,
    closePosition,
  };
}

import { useMemo, useState } from 'react';

import { useSSEChannel } from '@/hooks/useSSE';

interface LivePerpPrice {
  ticker: string;
  price: number;
  changePercent?: number;
}

const normalizeTicker = (ticker?: string | null) =>
  ticker ? ticker.toUpperCase() : null;

const deriveTicker = (update: Record<string, unknown>): string | null => {
  const direct = normalizeTicker(update.ticker as string | undefined);
  if (direct) return direct;

  if (update.metadata && typeof update.metadata === 'object') {
    const metaTicker = normalizeTicker(
      (update.metadata as Record<string, unknown>).ticker as string | undefined
    );
    if (metaTicker) return metaTicker;
  }

  const orgId =
    typeof update.organizationId === 'string'
      ? update.organizationId
      : undefined;
  return orgId ? orgId.toUpperCase().replace(/-/g, '') : null;
};

const derivePrice = (update: Record<string, unknown>): number | null => {
  const candidate = update.price ?? update.newPrice;
  const price = typeof candidate === 'number' ? candidate : Number(candidate);
  return Number.isFinite(price) ? Number(price) : null;
};

export function usePerpMarketSSE(targetTickers: string[]) {
  const [prices, setPrices] = useState<Map<string, LivePerpPrice>>(new Map());

  const normalizedTargets = useMemo(
    () => targetTickers.filter(Boolean).map((ticker) => ticker.toUpperCase()),
    [targetTickers]
  );

  useSSEChannel('markets', (payload) => {
    const type = typeof payload.type === 'string' ? payload.type : '';
    if (type !== 'price_update' && type !== 'perp_price_update') {
      return;
    }

    const updates = Array.isArray(payload.updates) ? payload.updates : [];
    if (updates.length === 0) return;

    setPrices((prev) => {
      const next = new Map(prev);

      for (const raw of updates) {
        if (!raw || typeof raw !== 'object') continue;
        const update = raw as Record<string, unknown>;

        const ticker = deriveTicker(update);
        if (!ticker) continue;

        if (
          normalizedTargets.length > 0 &&
          !normalizedTargets.includes(ticker)
        ) {
          continue;
        }

        const newPrice = derivePrice(update);
        if (newPrice === null) continue;

        next.set(ticker, {
          ticker,
          price: newPrice,
          changePercent:
            typeof update.changePercent === 'number'
              ? update.changePercent
              : undefined,
        });
      }

      return next;
    });
  });

  return prices;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  TickerNewsItem,
  TickerPerpItem,
  TickerPredictionItem,
  TickerResponse,
} from '@/types/ticker';

const DEFAULT_STREAMS = 'news,predictions,perps';
const DEFAULT_THEME = 'dark';
const DEFAULT_SPEED = 1;
const DEFAULT_HEIGHT = 48;

function useTickerParams() {
  if (typeof window === 'undefined') {
    return {
      streams: DEFAULT_STREAMS,
      theme: DEFAULT_THEME,
      speed: DEFAULT_SPEED,
      height: DEFAULT_HEIGHT,
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    streams: params.get('streams')?.trim() || DEFAULT_STREAMS,
    theme: (params.get('theme') || DEFAULT_THEME).toLowerCase(),
    speed: Math.min(
      2,
      Math.max(
        0.5,
        parseFloat(params.get('speed') || String(DEFAULT_SPEED)) ||
          DEFAULT_SPEED
      )
    ),
    height: Math.min(
      120,
      Math.max(
        32,
        parseInt(params.get('height') || String(DEFAULT_HEIGHT), 10) ||
          DEFAULT_HEIGHT
      )
    ),
  };
}

function buildItems(
  response: TickerResponse
): Array<{ key: string; label: string; text: string; type: string }> {
  const items: Array<{
    key: string;
    label: string;
    text: string;
    type: string;
  }> = [];
  (response.news ?? []).forEach((n: TickerNewsItem) => {
    items.push({
      key: `news-${n.id}`,
      label: 'News',
      text: n.title,
      type: 'news',
    });
  });
  (response.predictions ?? []).forEach((p: TickerPredictionItem) => {
    items.push({
      key: `pred-${p.id}`,
      label: 'Prediction',
      text: `${p.question} · Yes ${p.yesPercent}%`,
      type: 'prediction',
    });
  });
  (response.perps ?? []).forEach((p: TickerPerpItem) => {
    const sign = p.changePercent24h >= 0 ? '+' : '';
    items.push({
      key: `perp-${p.ticker}`,
      label: 'Perp',
      text: `${p.ticker} $${p.price.toFixed(2)} (${sign}${p.changePercent24h.toFixed(2)}%)`,
      type: 'perp',
    });
  });
  return items;
}

export function TickerClient() {
  const { streams, theme, speed, height } = useTickerParams();
  const [data, setData] = useState<TickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicker = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(
        `/api/ticker?streams=${encodeURIComponent(streams)}&limit=30`
      );
      if (!res.ok) throw new Error(`Ticker API ${res.status}`);
      const json = (await res.json()) as { success?: boolean } & TickerResponse;
      setData({
        news: json.news,
        predictions: json.predictions,
        perps: json.perps,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ticker');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [streams]);

  useEffect(() => {
    fetchTicker();
    const interval = setInterval(fetchTicker, 60_000);
    return () => clearInterval(interval);
  }, [fetchTicker]);

  const isDark = theme === 'dark';
  const bg = isDark ? '#0a0a0a' : '#fff';
  const fg = isDark ? '#fafafa' : '#0a0a0a';
  const muted = isDark ? '#71717a' : '#52525b';
  const duration = Math.round(60 / speed);

  if (loading && !data) {
    return (
      <div
        className="flex w-full items-center justify-center font-sans text-sm"
        style={{ height: `${height}px`, background: bg, color: muted }}
      >
        Loading ticker…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="flex w-full items-center justify-center font-sans text-sm"
        style={{ height: `${height}px`, background: bg, color: muted }}
      >
        {error}
      </div>
    );
  }

  const items = data ? buildItems(data) : [];
  if (items.length === 0) {
    return (
      <div
        className="flex w-full items-center justify-center font-sans text-sm"
        style={{ height: `${height}px`, background: bg, color: muted }}
      >
        No data yet
      </div>
    );
  }

  return (
    <div
      className="flex w-full items-center overflow-hidden font-sans"
      style={{
        height: `${height}px`,
        background: bg,
        color: fg,
      }}
    >
      <div
        className="flex shrink-0 items-center gap-8"
        style={{
          animation: `ticker-scroll ${duration}s linear infinite`,
        }}
      >
        {[...items, ...items].map((item) => (
          <span
            key={item.key}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm"
          >
            <span
              className="rounded px-1.5 py-0.5 font-medium text-xs"
              style={{
                background: isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.08)',
                color: muted,
              }}
            >
              {item.label}
            </span>
            <span>{item.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

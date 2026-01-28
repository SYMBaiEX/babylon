'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MarketKind = 'perp' | 'prediction';

export type MarketKey =
  | { kind: 'perp'; id: string }
  | { kind: 'prediction'; id: string };

interface MarketWatchlistState {
  favorites: string[];
  toggleFavorite: (key: MarketKey) => void;
  isFavorite: (key: MarketKey) => boolean;
  clear: () => void;
}

function serializeKey(key: MarketKey): string {
  const id = key.id.trim();
  return `${key.kind}:${key.kind === 'perp' ? id.toUpperCase() : id}`;
}

export const useMarketWatchlistStore = create<MarketWatchlistState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggleFavorite: (key) => {
        const serialized = serializeKey(key);
        if (!serialized) return;

        const next = new Set(get().favorites);
        if (next.has(serialized)) next.delete(serialized);
        else next.add(serialized);
        set({ favorites: Array.from(next) });
      },
      isFavorite: (key) => {
        const serialized = serializeKey(key);
        if (!serialized) return false;
        return get().favorites.includes(serialized);
      },
      clear: () => set({ favorites: [] }),
    }),
    {
      name: 'markets.watchlist.v2',
      version: 2,
      partialize: (state) => ({ favorites: state.favorites }),
    }
  )
);

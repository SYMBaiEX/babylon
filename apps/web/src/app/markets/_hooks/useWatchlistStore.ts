'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
  favorites: string[];
  toggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  clear: () => void;
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggleFavorite: (ticker: string) => {
        const normalized = normalizeTicker(ticker);
        if (!normalized) return;

        const existing = new Set(get().favorites.map(normalizeTicker));
        if (existing.has(normalized)) {
          existing.delete(normalized);
        } else {
          existing.add(normalized);
        }
        set({ favorites: Array.from(existing) });
      },
      isFavorite: (ticker: string) => {
        const normalized = normalizeTicker(ticker);
        if (!normalized) return false;
        return get().favorites.map(normalizeTicker).includes(normalized);
      },
      clear: () => set({ favorites: [] }),
    }),
    {
      name: 'markets.watchlist.v1',
      version: 1,
      partialize: (state) => ({ favorites: state.favorites }),
    }
  )
);

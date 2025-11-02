/**
 * Widget Cache Store - Caches widget data to prevent unnecessary refetches
 * when navigating between pages
 */

import { create } from 'zustand'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface StatsData {
  [key: string]: unknown
}

interface ProfileWidgetData {
  [key: string]: unknown
}

interface WidgetCacheState {
  breakingNews: CacheEntry<unknown[]> | null
  upcomingEvents: CacheEntry<unknown[]> | null
  stats: CacheEntry<StatsData> | null
  profileWidget: Map<string, CacheEntry<ProfileWidgetData>> // Keyed by userId
  
  // TTL in milliseconds (default: 30 seconds)
  ttl: number
  
  // Set cache entry
  setBreakingNews: (data: unknown[]) => void
  setUpcomingEvents: (data: unknown[]) => void
  setStats: (data: StatsData) => void
  setProfileWidget: (userId: string, data: ProfileWidgetData) => void
  
  // Get cache entry (returns null if stale or missing)
  getBreakingNews: () => unknown[] | null
  getUpcomingEvents: () => unknown[] | null
  getStats: () => StatsData | null
  getProfileWidget: (userId: string) => ProfileWidgetData | null
  
  // Check if cache is fresh
  isFresh: (entry: CacheEntry<unknown> | null) => boolean
  
  // Clear specific cache
  clearBreakingNews: () => void
  clearUpcomingEvents: () => void
  clearStats: () => void
  clearProfileWidget: (userId: string) => void
  clearAll: () => void
}

const DEFAULT_TTL = 30000 // 30 seconds

export const useWidgetCacheStore = create<WidgetCacheState>((set, get) => ({
  breakingNews: null,
  upcomingEvents: null,
  stats: null,
  profileWidget: new Map(),
  ttl: DEFAULT_TTL,
  
  isFresh: (entry: CacheEntry<unknown> | null) => {
    if (!entry) return false
    const age = Date.now() - entry.timestamp
    return age < get().ttl
  },
  
  setBreakingNews: (data: unknown[]) => {
    set({
      breakingNews: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setUpcomingEvents: (data: unknown[]) => {
    set({
      upcomingEvents: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setStats: (data: StatsData) => {
    set({
      stats: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setProfileWidget: (userId: string, data: ProfileWidgetData) => {
    const profileWidget = new Map(get().profileWidget)
    profileWidget.set(userId, {
      data,
      timestamp: Date.now(),
    })
    set({ profileWidget })
  },
  
  getBreakingNews: () => {
    const entry = get().breakingNews
    return get().isFresh(entry) && entry ? entry.data : null
  },
  
  getUpcomingEvents: () => {
    const entry = get().upcomingEvents
    return get().isFresh(entry) && entry ? entry.data : null
  },
  
  getStats: () => {
    const entry = get().stats
    return get().isFresh(entry) && entry ? entry.data : null
  },
  
  getProfileWidget: (userId: string) => {
    const profileWidget = get().profileWidget
    const entry = profileWidget.get(userId) || null
    return get().isFresh(entry) && entry ? entry.data : null
  },
  
  clearBreakingNews: () => set({ breakingNews: null }),
  clearUpcomingEvents: () => set({ upcomingEvents: null }),
  clearStats: () => set({ stats: null }),
  clearProfileWidget: (userId: string) => {
    const profileWidget = new Map(get().profileWidget)
    profileWidget.delete(userId)
    set({ profileWidget })
  },
  clearAll: () => set({
    breakingNews: null,
    upcomingEvents: null,
    stats: null,
    profileWidget: new Map(),
  }),
}))


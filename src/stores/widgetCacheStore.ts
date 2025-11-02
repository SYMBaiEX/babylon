/**
 * Widget Cache Store - Caches widget data to prevent unnecessary refetches
 * when navigating between pages
 */

import { create } from 'zustand'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface WidgetCacheState {
  breakingNews: CacheEntry<any[]> | null
  upcomingEvents: CacheEntry<any[]> | null
  stats: CacheEntry<any> | null
  profileWidget: Map<string, CacheEntry<any>> // Keyed by userId
  
  // TTL in milliseconds (default: 30 seconds)
  ttl: number
  
  // Set cache entry
  setBreakingNews: (data: any[]) => void
  setUpcomingEvents: (data: any[]) => void
  setStats: (data: any) => void
  setProfileWidget: (userId: string, data: any) => void
  
  // Get cache entry (returns null if stale or missing)
  getBreakingNews: () => any[] | null
  getUpcomingEvents: () => any[] | null
  getStats: () => any | null
  getProfileWidget: (userId: string) => any | null
  
  // Check if cache is fresh
  isFresh: (entry: CacheEntry<any> | null) => boolean
  
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
  
  isFresh: (entry: CacheEntry<any> | null) => {
    if (!entry) return false
    const age = Date.now() - entry.timestamp
    return age < get().ttl
  },
  
  setBreakingNews: (data: any[]) => {
    set({
      breakingNews: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setUpcomingEvents: (data: any[]) => {
    set({
      upcomingEvents: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setStats: (data: any) => {
    set({
      stats: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setProfileWidget: (userId: string, data: any) => {
    const profileWidget = new Map(get().profileWidget)
    profileWidget.set(userId, {
      data,
      timestamp: Date.now(),
    })
    set({ profileWidget })
  },
  
  getBreakingNews: () => {
    const entry = get().breakingNews
    return get().isFresh(entry) ? entry.data : null
  },
  
  getUpcomingEvents: () => {
    const entry = get().upcomingEvents
    return get().isFresh(entry) ? entry.data : null
  },
  
  getStats: () => {
    const entry = get().stats
    return get().isFresh(entry) ? entry.data : null
  },
  
  getProfileWidget: (userId: string) => {
    const profileWidget = get().profileWidget
    const entry = profileWidget.get(userId)
    return get().isFresh(entry || null) ? entry?.data : null
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


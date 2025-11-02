/**
 * Widget Cache Store - Caches widget data to prevent unnecessary refetches
 * when navigating between pages
 */

import { create } from 'zustand'
import type {
  UserBalanceData,
  PredictionPosition,
  UserProfileStats,
  ProfileWidgetPoolDeposit,
  PerpPositionFromAPI,
} from '@/types/profile'

interface BreakingNewsItem {
  id: string
  title: string
  description: string
  icon: 'chart' | 'calendar' | 'dollar' | 'trending'
  timestamp: string
  trending?: boolean
  source?: string
  fullDescription?: string
  imageUrl?: string
  relatedQuestion?: number
  relatedActorId?: string
  relatedOrganizationId?: string
}

interface UpcomingEvent {
  id: string
  title: string
  date: string
  time?: string
  isLive?: boolean
  hint?: string
  fullDescription?: string
  source?: string
  relatedQuestion?: number
  imageUrl?: string
  relatedActorId?: string
  relatedOrganizationId?: string
}

interface BabylonStats {
  activePlayers: number
  aiAgents: number
  totalHoots: number
  pointsInCirculation: string
}

interface ProfileWidgetData {
  balance: UserBalanceData | null
  predictions: PredictionPosition[]
  perps: PerpPositionFromAPI[]
  pools: ProfileWidgetPoolDeposit[]
  stats: UserProfileStats | null
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface WidgetCacheState {
  breakingNews: CacheEntry<BreakingNewsItem[]> | null
  upcomingEvents: CacheEntry<UpcomingEvent[]> | null
  stats: CacheEntry<BabylonStats> | null
  profileWidget: Map<string, CacheEntry<ProfileWidgetData>> // Keyed by userId
  
  // TTL in milliseconds (default: 30 seconds)
  ttl: number
  
  // Set cache entry
  setBreakingNews: (data: BreakingNewsItem[]) => void
  setUpcomingEvents: (data: UpcomingEvent[]) => void
  setStats: (data: BabylonStats) => void
  setProfileWidget: (userId: string, data: ProfileWidgetData) => void
  
  // Get cache entry (returns null if stale or missing)
  getBreakingNews: () => BreakingNewsItem[] | null
  getUpcomingEvents: () => UpcomingEvent[] | null
  getStats: () => BabylonStats | null
  getProfileWidget: (userId: string) => ProfileWidgetData | null
  
  // Check if cache is fresh
  isFresh: <T>(entry: CacheEntry<T> | null) => boolean
  
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
  
  isFresh: <T>(entry: CacheEntry<T> | null) => {
    if (!entry) return false
    const age = Date.now() - entry.timestamp
    return age < get().ttl
  },
  
  setBreakingNews: (data: BreakingNewsItem[]) => {
    set({
      breakingNews: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setUpcomingEvents: (data: UpcomingEvent[]) => {
    set({
      upcomingEvents: {
        data,
        timestamp: Date.now(),
      },
    })
  },
  
  setStats: (data: BabylonStats) => {
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
    return entry && get().isFresh(entry) ? entry.data : null
  },
  
  getUpcomingEvents: () => {
    const entry = get().upcomingEvents
    return entry && get().isFresh(entry) ? entry.data : null
  },
  
  getStats: () => {
    const entry = get().stats
    return entry && get().isFresh(entry) ? entry.data : null
  },
  
  getProfileWidget: (userId: string) => {
    const profileWidget = get().profileWidget
    const entry = profileWidget.get(userId)
    return entry && get().isFresh(entry) ? entry.data : null
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



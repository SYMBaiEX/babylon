'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { logger } from '@/lib/logger'
import { useChannelSubscription } from '@/hooks/useChannelSubscription'
import { useRouter } from 'next/navigation'
import { useWidgetCacheStore } from '@/stores/widgetCacheStore'

interface TrendingItem {
  id: string
  tag: string
  tagSlug: string
  category?: string | null
  postCount: number
  relatedContext?: string | null
  rank: number
}

export function TrendingPanel() {
  const router = useRouter()
  const [trending, setTrending] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const { getTrending, setTrending: cacheTrending } = useWidgetCacheStore()

  // Use ref to store fetchTrending function to break dependency chain
  const fetchTrendingRef = useRef<(() => void) | null>(null)

  const fetchTrending = useCallback(async (skipCache = false) => {
    // Check cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getTrending()
      if (cached) {
        setTrending(cached as TrendingItem[])
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch('/api/feed/widgets/trending')
      const data = await response.json()
      if (data.success) {
        const trendingData = data.trending || []
        setTrending(trendingData)
        cacheTrending(trendingData) // Cache the data
      }
    } catch (error) {
      logger.error('Error fetching trending:', error, 'TrendingPanel')
    } finally {
      setLoading(false)
    }
  }, [getTrending, cacheTrending])

  // Update ref when fetchTrending changes
  useEffect(() => {
    fetchTrendingRef.current = () => fetchTrending(true) // Skip cache on manual refresh
  }, [fetchTrending])

  useEffect(() => {
    fetchTrending()
  }, [fetchTrending])

  // Subscribe to trending channel for real-time updates
  const handleChannelUpdate = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'trending_updated') {
      // Refresh trending when calculation completes
      logger.debug('Trending update received, refreshing...', { data }, 'TrendingPanel')
      fetchTrendingRef.current?.()
    }
  }, [])

  useChannelSubscription('trending', handleChannelUpdate)

  const handleTrendingClick = (item: TrendingItem) => {
    router.push(`/trending/${item.tagSlug}`)
  }

  const formatPostCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toString()
  }

  return (
    <div className="bg-sidebar rounded-lg p-4 flex-1 flex flex-col">
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 text-left">
        What&apos;s happening
      </h2>
      {loading ? (
        <div className="text-base text-muted-foreground pl-3 flex-1">Loading...</div>
      ) : trending.length === 0 ? (
        <div className="text-base text-muted-foreground pl-3 flex-1">
          No trending topics at the moment.
        </div>
      ) : (
        <div className="space-y-2.5 pl-3 flex-1">
          {trending.map((item) => (
            <div
              key={item.id}
              onClick={() => handleTrendingClick(item)}
              className="flex items-start gap-2.5 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -ml-1.5 transition-colors duration-200"
            >
              <div className="flex-1 min-w-0">
                {/* Category and status */}
                <p className="text-sm text-muted-foreground">
                  {item.category || 'Trending'} · Trending
                </p>
                {/* Tag name */}
                <p className="text-lg sm:text-xl font-semibold text-foreground leading-relaxed">
                  {item.tag}
                </p>
                {/* Related context if available */}
                {item.relatedContext ? (
                  <p className="text-sm text-muted-foreground">
                    {item.relatedContext}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {formatPostCount(item.postCount)} posts
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


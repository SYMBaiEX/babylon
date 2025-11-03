'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useChannelSubscription } from '@/hooks/useChannelSubscription'
import { useRouter } from 'next/navigation'
import { useWidgetCacheStore, type MarketsWidgetData } from '@/stores/widgetCacheStore'

export function MarketsPanel() {
  const router = useRouter()
  const [data, setData] = useState<MarketsWidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const { getMarkets, setMarkets } = useWidgetCacheStore()

  // Use ref to store fetchData function to break dependency chain
  const fetchDataRef = useRef<(() => void) | null>(null)

  const fetchData = useCallback(async (skipCache = false) => {
    // Check cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getMarkets()
      if (cached) {
        setData(cached)
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch('/api/feed/widgets/markets')
      const result = await response.json()
      if (result.success) {
        const marketsData: MarketsWidgetData = {
          topPerpGainers: result.topPerpGainers || [],
          topPoolGainers: result.topPoolGainers || [],
          topVolumeQuestions: result.topVolumeQuestions || [],
          lastUpdated: result.lastUpdated || new Date().toISOString(),
        }
        setData(marketsData)
        setMarkets(marketsData) // Cache the data
      }
    } catch (error) {
      logger.error('Error fetching markets widget:', error, 'MarketsPanel')
    } finally {
      setLoading(false)
    }
  }, [getMarkets, setMarkets])

  // Update ref when fetchData changes
  useEffect(() => {
    fetchDataRef.current = () => fetchData(true) // Skip cache on manual refresh
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Subscribe to markets channel for real-time updates
  const handleChannelUpdate = useCallback((updateData: Record<string, unknown>) => {
    if (updateData.type === 'market_update') {
      logger.debug('Market update received, refreshing...', { data: updateData }, 'MarketsPanel')
      // Use ref to avoid dependency on fetchData
      fetchDataRef.current?.()
    }
  }, []) // Empty dependency array prevents re-creation

  useChannelSubscription('markets', handleChannelUpdate)

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
  }

  const formatPrice = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  const handlePerpClick = (organizationId: string) => {
    router.push(`/markets/perps/${organizationId}`)
  }

  const handlePoolClick = (poolId: string) => {
    router.push(`/markets/pools/${poolId}`)
  }

  const handleQuestionClick = (questionId: number) => {
    router.push(`/markets/predictions/${questionId}`)
  }

  if (loading) {
    return (
      <div className="bg-sidebar rounded-lg p-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">Markets</h2>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="bg-sidebar rounded-lg p-4 space-y-4">
      <h2 className="text-xl sm:text-2xl font-bold text-foreground">Markets</h2>

      {/* Top Perp Gainers */}
      {data.topPerpGainers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Top Perp Movers
          </h3>
          <div className="space-y-1.5">
            {data.topPerpGainers.map((perp) => (
              <div
                key={perp.organizationId}
                onClick={() => handlePerpClick(perp.organizationId)}
                className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {perp.changePercent24h >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {perp.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(perp.currentPrice)}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold flex-shrink-0 ${
                    perp.changePercent24h >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {formatPercent(perp.changePercent24h)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Pool Gainers */}
      {data.topPoolGainers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Top Pools
          </h3>
          <div className="space-y-1.5">
            {data.topPoolGainers.map((pool) => (
              <div
                key={pool.id}
                onClick={() => handlePoolClick(pool.id)}
                className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {pool.totalReturn >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {pool.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {pool.npcActorName}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold flex-shrink-0 ${
                    pool.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {formatPercent(pool.totalReturn)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Volume Questions */}
      {data.topVolumeQuestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Hot Questions
          </h3>
          <div className="space-y-1.5">
            {data.topVolumeQuestions.map((question) => (
              <div
                key={question.id}
                onClick={() => handleQuestionClick(question.id)}
                className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              >
                <DollarSign className="w-4 h-4 text-[#1c9cf0] flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground leading-snug line-clamp-2">
                    {question.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(question.totalVolume)} vol
                    </span>
                    <span className="text-xs text-[#1c9cf0] font-semibold">
                      {Math.round(question.yesPrice * 100)}¢ YES
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.topPerpGainers.length === 0 &&
        data.topPoolGainers.length === 0 &&
        data.topVolumeQuestions.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            No market data available yet
          </div>
        )}
    </div>
  )
}


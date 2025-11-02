'use client'

import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useWidgetCacheStore } from '@/stores/widgetCacheStore'

interface BabylonStats {
  activePlayers: number
  aiAgents: number
  totalHoots: number
  pointsInCirculation: string
}

export function BabylonStatsPanel() {
  const [stats, setStats] = useState<BabylonStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { getStats, setStats: setCachedStats } = useWidgetCacheStore()

  useEffect(() => {
    const fetchStats = async (skipCache = false) => {
      // Check cache first (unless explicitly skipping)
      if (!skipCache) {
        const cached = getStats()
        if (cached) {
          setStats(cached)
          setLoading(false)
          return
        }
      }

      try {
        const response = await fetch('/api/feed/widgets/stats')
        const data = await response.json()
        if (data.success) {
          setStats(data.stats)
          setCachedStats(data.stats) // Cache the data
        }
      } catch (error) {
        logger.error('Error fetching Babylon stats:', error, 'BabylonStatsPanel')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(() => fetchStats(true), 30000) // Refresh every 30 seconds (skip cache)
    return () => clearInterval(interval)
  }, [getStats, setCachedStats])

  return (
    <div className="bg-sidebar rounded-lg p-4 flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground text-left">Babylon Stats</h2>
        <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
      </div>
      {loading ? (
        <div className="text-base text-muted-foreground pl-3 flex-1">Loading...</div>
      ) : stats ? (
        <div className="space-y-2 pl-3 flex-1">
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg text-muted-foreground">Active Players</span>
            <span className="text-base sm:text-lg font-semibold text-foreground">
              {stats.activePlayers.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg text-muted-foreground">AI Agents</span>
            <span className="text-base sm:text-lg font-semibold text-foreground">
              {stats.aiAgents.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg text-muted-foreground">Total Hoots</span>
            <span className="text-base sm:text-lg font-semibold text-foreground">
              {stats.totalHoots.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg text-muted-foreground">Points in Circulation</span>
            <span className="text-base sm:text-lg font-semibold text-foreground">
              {stats.pointsInCirculation}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-base text-muted-foreground pl-3 flex-1">Unable to load stats.</div>
      )}
    </div>
  )
}


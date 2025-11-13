'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Activity,
  DollarSign,
  BarChart3,
  Clock,
  Target
} from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import { TradesFeed } from '@/components/trades/TradesFeed'

interface TradingProfileProps {
  userId: string
  isOwner?: boolean // Is this the current user's profile?
}

interface UserStats {
  rank: number
  totalPlayers: number
  balance: number
  reputationPoints: number
  lifetimePnL: number
  totalDeposited: number
  totalWithdrawn: number
}

interface PortfolioPnL {
  totalPnL: number
  perpPnL: number
  predictionPnL: number
  totalPositions: number
  perpPositions: number
  predictionPositions: number
  roi: number
}

export function TradingProfile({ userId, isOwner = false }: TradingProfileProps) {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [portfolioPnL, setPortfolioPnL] = useState<PortfolioPnL | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'positions' | 'history'>('positions')

  const fetchTradingData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // Fetch user profile, leaderboard, portfolio P&L in parallel
      const [profileRes, leaderboardRes, portfolioRes] = await Promise.all([
        fetch(`/api/users/${encodeURIComponent(userId)}/profile`, { headers }).catch(() => null),
        fetch(`/api/leaderboard?page=1&pageSize=1000`, { headers }).catch(() => null),
        fetch(`/api/markets/pnl`, { headers }).catch(() => null)
      ])

      // Parse user profile
      let userProfile = null
      if (profileRes?.ok) {
        const data = await profileRes.json()
        userProfile = data.user
      }

      // Find user rank in leaderboard
      let rank = null
      let totalPlayers = 0
      if (leaderboardRes?.ok) {
        const leaderboardData = await leaderboardRes.json()
        totalPlayers = leaderboardData.pagination?.totalCount || 0
        const userInLeaderboard = leaderboardData.leaderboard?.find((u: any) => u.id === userId)
        if (userInLeaderboard) {
          rank = userInLeaderboard.rank
        }
      }

      // Parse portfolio P&L (only for own profile)
      let pnlData = null
      if (isOwner && portfolioRes?.ok) {
        pnlData = await portfolioRes.json()
      }

      if (userProfile) {
        setStats({
          rank: rank || 0,
          totalPlayers,
          balance: Number(userProfile.virtualBalance || 0),
          reputationPoints: userProfile.reputationPoints || 0,
          lifetimePnL: Number(userProfile.lifetimePnL || 0),
          totalDeposited: Number(userProfile.earnedPoints || 0),
          totalWithdrawn: Number(userProfile.bonusPoints || 0),
        })
      }

      if (pnlData) {
        setPortfolioPnL({
          totalPnL: pnlData.totalPnL || 0,
          perpPnL: pnlData.perpPnL || 0,
          predictionPnL: pnlData.predictionPnL || 0,
          totalPositions: pnlData.totalPositions || 0,
          perpPositions: pnlData.perpPositions || 0,
          predictionPositions: pnlData.predictionPositions || 0,
          roi: pnlData.roi || 0,
        })
      }

      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch trading data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load trading data')
      setLoading(false)
    }
  }, [userId, isOwner])

  useEffect(() => {
    fetchTradingData()
  }, [fetchTradingData])

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="w-full space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="w-16 h-16 text-muted-foreground opacity-50 mb-4" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  const lifetimePnL = stats?.lifetimePnL || 0
  const isProfitable = lifetimePnL >= 0

  return (
    <div className="w-full space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4">
        {/* Balance */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground font-medium">Balance</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats?.balance || 0)}</p>
        </div>

        {/* Lifetime P&L */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            {isProfitable ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className="text-xs text-muted-foreground font-medium">Lifetime P&L</span>
          </div>
          <p className={cn(
            'text-2xl font-bold',
            isProfitable ? 'text-green-600' : 'text-red-600'
          )}>
            {isProfitable ? '+' : ''}{formatCurrency(lifetimePnL)}
          </p>
        </div>

        {/* Points */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground font-medium">Points</span>
          </div>
          <p className="text-2xl font-bold">{(stats?.reputationPoints || 0).toLocaleString()}</p>
        </div>

        {/* Rank */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground font-medium">Rank</span>
          </div>
          <p className="text-2xl font-bold">
            {(stats?.rank && stats.rank > 0) ? `#${stats.rank}` : '-'}
            {(stats?.totalPlayers && stats.totalPlayers > 0) && (
              <span className="text-sm text-muted-foreground font-normal ml-1">
                / {stats.totalPlayers.toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Portfolio P&L Card (only for owner) */}
      {isOwner && portfolioPnL && (
        <div className="px-4">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">Portfolio Performance</h3>
              </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total P&L</p>
                <p className={cn(
                  'text-xl font-bold',
                  portfolioPnL.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {portfolioPnL.totalPnL >= 0 ? '+' : ''}{formatCurrency(portfolioPnL.totalPnL)}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">ROI</p>
                <p className={cn(
                  'text-xl font-bold',
                  portfolioPnL.roi >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {portfolioPnL.roi >= 0 ? '+' : ''}{portfolioPnL.roi.toFixed(2)}%
                </p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Open Positions</p>
                <p className="text-xl font-bold">{portfolioPnL.totalPositions}</p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Perps P&L</p>
                <p className={cn(
                  'text-lg font-semibold',
                  portfolioPnL.perpPnL >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {portfolioPnL.perpPnL >= 0 ? '+' : ''}{formatCurrency(portfolioPnL.perpPnL)}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Predictions P&L</p>
                <p className={cn(
                  'text-lg font-semibold',
                  portfolioPnL.predictionPnL >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {portfolioPnL.predictionPnL >= 0 ? '+' : ''}{formatCurrency(portfolioPnL.predictionPnL)}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Position Count</p>
                <p className="text-lg font-semibold">
                  {portfolioPnL.perpPositions} perps / {portfolioPnL.predictionPositions} predictions
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Toggle */}
      <div className="border-b border-border sticky top-0 bg-background z-10">
        <div className="flex px-4">
          <button
            onClick={() => setActiveSection('positions')}
            className={cn(
              'flex-1 py-4 font-semibold transition-colors relative hover:bg-muted/30',
              activeSection === 'positions' ? 'text-foreground opacity-100' : 'text-foreground opacity-50'
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-4 h-4" />
              <span>Open Positions</span>
            </div>
            {activeSection === 'positions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveSection('history')}
            className={cn(
              'flex-1 py-4 font-semibold transition-colors relative hover:bg-muted/30',
              activeSection === 'history' ? 'text-foreground opacity-100' : 'text-foreground opacity-50'
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Trade History</span>
            </div>
            {activeSection === 'history' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4">
        {activeSection === 'positions' ? (
          <div className="space-y-6">
            {/* Perpetual Positions */}
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                Perpetual Futures
              </h3>
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading positions...
              </div>
            </div>

            {/* Prediction Positions */}
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-500" />
                Prediction Markets
              </h3>
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading positions...
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Recent Trades
            </h3>
            <TradesFeed userId={userId} />
          </div>
        )}
      </div>
    </div>
  )
}


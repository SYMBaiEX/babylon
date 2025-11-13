'use client'

import { useCallback, useEffect, useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, Activity, DollarSign, Trophy } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface UserWalletProps {
  userId: string
}

interface WalletBalance {
  balance: string
  totalDeposited: string
  totalWithdrawn: string
  lifetimePnL: string
}

interface PredictionPosition {
  id: string
  side: string
  shares: string
  avgPrice: string
  createdAt: string
  Market: {
    id: string
    question: string
    endDate: string
    resolved: boolean
    resolution: boolean | null
    yesShares: string
    noShares: string
  }
}

interface PerpPosition {
  id: string
  userId: string
  ticker: string
  side: string
  entryPrice: string
  currentPrice: string
  size: string
  leverage: number
  unrealizedPnL: string
  liquidationPrice: string
  fundingPaid: string
  closedAt: string | null
  createdAt: string
}

interface PositionsData {
  perpetuals: {
    positions: PerpPosition[]
    stats: {
      totalPositions: number
      totalPnL: number
      totalFunding: number
    }
  }
  predictions: PredictionPosition[]
}

export function UserWallet({ userId }: UserWalletProps) {
  const router = useRouter()
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [positions, setPositions] = useState<PositionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWalletData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // Fetch balance and positions in parallel
      const [balanceRes, positionsRes] = await Promise.all([
        fetch(`/api/users/${encodeURIComponent(userId)}/balance`, { headers }).catch(() => null),
        fetch(`/api/markets/positions/${encodeURIComponent(userId)}?status=open`, { headers }).catch(() => null)
      ])

      if (balanceRes?.ok) {
        const balanceData = await balanceRes.json()
        setBalance(balanceData)
      }

      if (positionsRes?.ok) {
        const positionsData = await positionsRes.json()
        setPositions(positionsData)
      }

      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch wallet data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchWalletData()
  }, [fetchWalletData])

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '$0.00'
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  const calculateCurrentPrice = (market: PredictionPosition['Market']) => {
    const yesShares = parseFloat(market.yesShares)
    const noShares = parseFloat(market.noShares)
    const totalShares = yesShares + noShares
    return totalShares === 0 ? 0.5 : yesShares / totalShares
  }

  if (loading) {
    return (
      <div className="w-full space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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

  const totalPerpPositions = positions?.perpetuals?.positions?.length || 0
  const totalPredictionPositions = positions?.predictions?.length || 0
  const totalPositions = totalPerpPositions + totalPredictionPositions

  const lifetimePnL = balance?.lifetimePnL ? parseFloat(balance.lifetimePnL) : 0
  const isPnLPositive = lifetimePnL >= 0

  return (
    <div className="w-full space-y-4">
      {/* Wallet Balance Card */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-bold">Wallet Overview</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-2xl font-bold">{formatCurrency(balance?.balance || '0')}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Lifetime P&L</p>
            <p className={cn(
              'text-2xl font-bold',
              isPnLPositive ? 'text-green-600' : 'text-red-600'
            )}>
              {isPnLPositive ? '+' : ''}{formatCurrency(lifetimePnL)}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Deposited</p>
            <p className="text-lg font-semibold">{formatCurrency(balance?.totalDeposited || '0')}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Withdrawn</p>
            <p className="text-lg font-semibold">{formatCurrency(balance?.totalWithdrawn || '0')}</p>
          </div>
        </div>
      </div>

      {/* Positions Summary */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <h3 className="text-lg font-bold">Open Positions</h3>
          <span className="ml-auto text-sm text-muted-foreground">
            {totalPositions} {totalPositions === 1 ? 'position' : 'positions'}
          </span>
        </div>

        {totalPositions === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No open positions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Perpetual Positions */}
            {positions?.perpetuals?.positions && positions.perpetuals.positions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                  Perpetual Futures ({positions.perpetuals.positions.length})
                </h4>
                <div className="space-y-2">
                  {positions.perpetuals.positions.map((position) => {
                    const isLong = position.side === 'long'
                    const pnl = parseFloat(position.unrealizedPnL)
                    const isPnLPositive = pnl >= 0

                    return (
                      <div
                        key={position.id}
                        onClick={() => router.push(`/markets/perps/${position.ticker}`)}
                        className="bg-muted/30 hover:bg-muted/50 rounded-lg p-4 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {isLong ? (
                              <TrendingUp className="w-4 h-4 text-green-500" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                            <span className="font-bold">{position.ticker}</span>
                            <span className={cn(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              isLong ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                            )}>
                              {position.side.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {position.leverage}x
                            </span>
                          </div>
                          <span className={cn(
                            'text-sm font-semibold',
                            isPnLPositive ? 'text-green-600' : 'text-red-600'
                          )}>
                            {isPnLPositive ? '+' : ''}{formatCurrency(pnl)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Size: {formatCurrency(position.size)}</span>
                          <span>Entry: {formatCurrency(position.entryPrice)}</span>
                          <span>Current: {formatCurrency(position.currentPrice)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Prediction Market Positions */}
            {positions?.predictions && positions.predictions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                  Prediction Markets ({positions.predictions.length})
                </h4>
                <div className="space-y-2">
                  {positions.predictions.map((position) => {
                    const isYes = position.side === 'YES'
                    const currentPrice = calculateCurrentPrice(position.Market)
                    const avgPrice = parseFloat(position.avgPrice)
                    const shares = parseFloat(position.shares)
                    const currentValue = shares * currentPrice
                    const costBasis = shares * avgPrice
                    const unrealizedPnL = currentValue - costBasis
                    const isPnLPositive = unrealizedPnL >= 0

                    return (
                      <div
                        key={position.id}
                        onClick={() => router.push(`/markets/predictions/${position.Market.id}`)}
                        className="bg-muted/30 hover:bg-muted/50 rounded-lg p-4 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-blue-500" />
                            <span className={cn(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              isYes ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                            )}>
                              {position.side}
                            </span>
                          </div>
                          <span className={cn(
                            'text-sm font-semibold',
                            isPnLPositive ? 'text-green-600' : 'text-red-600'
                          )}>
                            {isPnLPositive ? '+' : ''}{formatCurrency(unrealizedPnL)}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-2 line-clamp-2">
                          {position.Market.question}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Shares: {shares.toFixed(2)}</span>
                          <span>Avg: {formatCurrency(avgPrice)}</span>
                          <span>Current: {formatCurrency(currentPrice)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


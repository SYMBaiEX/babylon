'use client'

import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, Users, Activity, Clock, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

interface PoolDetailModalProps {
  poolId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PoolDetailModal({ poolId, isOpen, onClose, onSuccess }: PoolDetailModalProps) {
  const { user, authenticated, login } = useAuth()
  const [pool, setPool] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'overview' | 'positions' | 'trades'>('overview')

  useEffect(() => {
    if (isOpen) {
      fetchPoolDetails()
    }
  }, [isOpen, poolId])

  const fetchPoolDetails = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/pools/${poolId}`)
      const data = await res.json()
      setPool(data)
    } catch (error) {
      console.error('Error fetching pool details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async () => {
    if (!authenticated || !user) {
      login()
      return
    }

    const amount = parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch(`/api/pools/${poolId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amount,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Deposit failed')
      }

      logger.info('Pool deposit successful', { poolId, amount }, 'PoolDetailModal')
      setDepositAmount('')
      fetchPoolDetails()
      onSuccess?.()
    } catch (error: any) {
      console.error('Deposit error:', error)
      alert(error.message || 'Failed to deposit')
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`
  }

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl">
        <div className="bg-popover border border-border rounded-lg shadow-lg p-6 m-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : pool ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-1">{pool.pool.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Managed by {pool.pool.npcActor.name}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground transition-colors p-2"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Performance Banner */}
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total Return</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      pool.pool.totalReturn >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {formatPercent(pool.pool.totalReturn)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total Value</div>
                    <div className="text-2xl font-bold">{formatCurrency(pool.pool.totalValue)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Investors</div>
                    <div className="text-2xl font-bold">{pool.pool.activeInvestors}</div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mb-6 border-b border-border">
                <button
                  onClick={() => setTab('overview')}
                  className={cn(
                    'px-4 py-2 font-medium transition-colors border-b-2',
                    tab === 'overview'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Overview
                </button>
                <button
                  onClick={() => setTab('positions')}
                  className={cn(
                    'px-4 py-2 font-medium transition-colors border-b-2',
                    tab === 'positions'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Positions ({pool.positions.length})
                </button>
                <button
                  onClick={() => setTab('trades')}
                  className={cn(
                    'px-4 py-2 font-medium transition-colors border-b-2',
                    tab === 'trades'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Recent Trades
                </button>
              </div>

              {/* Tab Content */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  {/* Deposit Section */}
                  {authenticated && (
                    <div className="p-4 bg-muted rounded-lg">
                      <h3 className="font-bold mb-3">Deposit into Pool</h3>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="Amount"
                          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                          onClick={handleDeposit}
                          disabled={submitting || !depositAmount}
                          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {submitting ? 'Depositing...' : 'Deposit'}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Performance fee: {pool.pool.performanceFeeRate * 100}% on profits only
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Lifetime P&L</div>
                      <div className={cn(
                        "text-xl font-bold",
                        pool.pool.lifetimePnL >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(pool.pool.lifetimePnL)}
                      </div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Available Balance</div>
                      <div className="text-xl font-bold">{formatCurrency(pool.pool.availableBalance)}</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Open Positions</div>
                      <div className="text-xl font-bold">{pool.pool.openPositions}</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
                      <div className="text-xl font-bold">{pool.pool.totalTrades}</div>
                    </div>
                  </div>

                  {/* Strategy */}
                  <div>
                    <h3 className="font-bold mb-2">Strategy</h3>
                    <p className="text-sm text-muted-foreground">{pool.pool.description}</p>
                  </div>
                </div>
              )}

              {tab === 'positions' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {pool.positions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No open positions</p>
                  ) : (
                    pool.positions.map((pos: any) => (
                      <div key={pos.id} className="p-3 bg-muted rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-semibold">
                              {pos.ticker || pos.marketId}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pos.marketType} • {pos.side}
                              {pos.leverage && ` • ${pos.leverage}x`}
                            </div>
                          </div>
                          <div className={cn(
                            "font-bold",
                            pos.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {formatCurrency(pos.unrealizedPnL)}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">Entry</div>
                            <div className="font-medium">${pos.entryPrice.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Current</div>
                            <div className="font-medium">${pos.currentPrice.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Size</div>
                            <div className="font-medium">${pos.size.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'trades' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {pool.recentTrades.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No trades yet</p>
                  ) : (
                    pool.recentTrades.map((trade: any) => (
                      <div key={trade.id} className="p-3 bg-muted rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold">
                              {trade.action.toUpperCase()} {trade.ticker || trade.marketId}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {trade.side} • ${trade.amount.toFixed(2)} @ ${trade.price.toFixed(2)}
                            </div>
                            {trade.reason && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {trade.reason}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground text-right">
                            {new Date(trade.executedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Pool not found</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}


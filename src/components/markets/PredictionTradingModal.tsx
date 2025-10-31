'use client'

import { useState } from 'react'
import { X, CheckCircle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { PredictionPricing, calculateExpectedPayout } from '@/lib/prediction-pricing'
import { logger } from '@/lib/logger'

interface PredictionMarket {
  id: number
  text: string
  status: 'active' | 'resolved' | 'cancelled'
  createdDate?: string
  resolutionDate?: string
  resolvedOutcome?: boolean
  scenario: number
  yesShares?: number
  noShares?: number
}

interface PredictionTradingModalProps {
  question: PredictionMarket
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PredictionTradingModal({
  question,
  isOpen,
  onClose,
  onSuccess,
}: PredictionTradingModalProps) {
  const { user } = useAuth()
  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('10')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const amountNum = parseFloat(amount) || 0
  
  // Use AMM to calculate current prices and shares
  const yesShares = question.yesShares || 500
  const noShares = question.noShares || 500
  
  const currentYesPrice = PredictionPricing.getCurrentPrice(yesShares, noShares, 'yes')
  const currentNoPrice = PredictionPricing.getCurrentPrice(yesShares, noShares, 'no')
  
  // Calculate what would happen if user buys
  const calculation = amountNum > 0
    ? PredictionPricing.calculateBuy(yesShares, noShares, side, amountNum)
    : null

  const expectedPayout = calculation
    ? calculateExpectedPayout(calculation.sharesBought)
    : 0
  const expectedProfit = expectedPayout - amountNum

  const getDaysUntilResolution = () => {
    if (!question.resolutionDate) return null
    const now = new Date()
    const resolution = new Date(question.resolutionDate)
    const diffDays = Math.ceil((resolution.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  const daysLeft = getDaysUntilResolution()

  const handleSubmit = async () => {
    if (!user) return

    if (amountNum < 1) {
      toast.error('Minimum bet is $1')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/markets/predictions/${question.id}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.__privyAccessToken || ''}`,
        },
        body: JSON.stringify({
          side,
          amount: amountNum,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to buy shares')
        return
      }

      toast.success(`Bought ${side.toUpperCase()} shares!`, {
        description: `${calculation?.sharesBought.toFixed(2)} shares at ${(calculation?.avgPrice || 0).toFixed(3)} each`,
      })

      onClose()
      if (onSuccess) onSuccess()
    } catch (buyError) {
      const errorMessage = buyError instanceof Error ? buyError.message : 'Failed to buy shares'
      logger.error('Error buying shares:', errorMessage, 'PredictionTradingModal')
      toast.error('Failed to buy shares')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
        <div className="bg-popover border border-border rounded-lg shadow-lg p-6 m-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">Prediction Market</h2>
              {daysLeft !== null && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                  <Clock size={14} />
                  {daysLeft}d left
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-2"
            >
              <X size={20} />
            </button>
          </div>

          {/* Question */}
          <div className="mb-6 p-4 bg-muted rounded-lg">
            <p className="text-foreground font-medium">{question.text}</p>
          </div>

          {/* Current Odds */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 bg-green-600/10 border border-green-600/20 rounded-lg">
              <div className="text-xs text-green-600 mb-1">YES</div>
              <div className="text-2xl font-bold text-green-600">
                {(currentYesPrice * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-lg">
              <div className="text-xs text-red-600 mb-1">NO</div>
              <div className="text-2xl font-bold text-red-600">
                {(currentNoPrice * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* YES/NO Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setSide('yes')}
              className={cn(
                'flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2',
                side === 'yes'
                  ? 'bg-green-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <CheckCircle size={20} />
              BUY YES
            </button>
            <button
              onClick={() => setSide('no')}
              className={cn(
                'flex-1 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2',
                side === 'no'
                  ? 'bg-red-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <XCircle size={20} />
              BUY NO
            </button>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="text-sm text-muted-foreground mb-2 block">Amount (USD)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              step="1"
              className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Min: $1"
            />
          </div>

          {/* Trade Preview */}
          {calculation && (
            <div className="bg-muted p-4 rounded-lg mb-6 space-y-2">
              <div className="text-sm font-bold text-foreground mb-2">Trade Preview</div>
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shares Received</span>
                <span className="font-bold text-foreground">{calculation.sharesBought.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg Price/Share</span>
                <span className="font-medium text-foreground">{formatPrice(calculation.avgPrice)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New {side.toUpperCase()} Price</span>
                <span className="font-medium text-foreground">
                  {(side === 'yes' ? calculation.newYesPrice : calculation.newNoPrice * 100).toFixed(1)}%
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price Impact</span>
                <span className="font-medium text-orange-500">
                  +{Math.abs(calculation.priceImpact).toFixed(2)}%
                </span>
              </div>

              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">If {side.toUpperCase()} Wins</span>
                  <span className="font-bold text-green-600">{formatPrice(expectedPayout)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={cn(
                    "font-bold",
                    expectedProfit >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {expectedProfit >= 0 ? '+' : ''}{formatPrice(expectedProfit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || amountNum < 1}
            className={cn(
              'w-full py-4 rounded-lg font-bold text-white transition-all text-lg',
              side === 'yes'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700',
              (loading || amountNum < 1) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Buying Shares...
              </span>
            ) : (
              `BUY ${side.toUpperCase()} - ${formatPrice(amountNum)}`
            )}
          </button>

          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full mt-3 py-3 rounded-lg font-medium text-muted-foreground hover:bg-muted transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}


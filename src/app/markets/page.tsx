'use client'

import { useState, useEffect } from 'react'
import { Search, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { WalletBalance } from '@/components/shared/WalletBalance'
import { PerpTradingModal } from '@/components/markets/PerpTradingModal'
import { PredictionTradingModal } from '@/components/markets/PredictionTradingModal'
import { PerpPositionsList } from '@/components/markets/PerpPositionsList'
import { PredictionPositionsList } from '@/components/markets/PredictionPositionsList'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'
import type { PerpPosition } from '@/shared/perps-types'

interface PredictionPosition {
  id: string
  marketId: string
  question: string
  side: 'YES' | 'NO'
  shares: number
  avgPrice: number
  currentPrice: number
  resolved: boolean
  resolution?: boolean | null
}

interface PerpMarket {
  ticker: string
  organizationId: string
  name: string
  currentPrice: number
  change24h: number
  changePercent24h: number
  high24h: number
  low24h: number
  volume24h: number
  openInterest: number
  fundingRate: {
    rate: number
    nextFundingTime: string
    predictedRate: number
  }
  maxLeverage: number
  minOrderSize: number
}

interface PredictionMarket {
  id: number | string
  text: string
  status: 'active' | 'resolved' | 'cancelled'
  createdDate?: string
  resolutionDate?: string
  resolvedOutcome?: boolean
  scenario: number
  yesShares?: number
  noShares?: number
  userPosition?: {
    id: string
    side: 'YES' | 'NO'
    shares: number
    avgPrice: number
    currentPrice: number
    currentValue: number
    costBasis: number
    unrealizedPnL: number
  } | null
}

type MarketTab = 'futures' | 'predictions'

export default function MarketsPage() {
  const { user, authenticated, login } = useAuth()
  const [activeTab, setActiveTab] = useState<MarketTab>('futures')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modals
  const [perpModalOpen, setPerpModalOpen] = useState(false)
  const [predictionModalOpen, setPredictionModalOpen] = useState(false)
  const [selectedPerpMarket, setSelectedPerpMarket] = useState<PerpMarket | null>(null)
  const [selectedPrediction, setSelectedPrediction] = useState<PredictionMarket | null>(null)
  
  // Data
  const [perpMarkets, setPerpMarkets] = useState<PerpMarket[]>([])
  const [predictions, setPredictions] = useState<PredictionMarket[]>([])
  const [perpPositions, setPerpPositions] = useState<PerpPosition[]>([])
  const [predictionPositions, setPredictionPositions] = useState<PredictionPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0)

  // Fetch data
  const fetchData = async () => {
    try {
      const [perpsRes, predictionsRes] = await Promise.all([
        fetch('/api/markets/perps'),
        fetch(`/api/markets/predictions${authenticated && user ? `?userId=${user.id}` : ''}`),
      ])

      const perpsData = await perpsRes.json()
      const predictionsData = await predictionsRes.json()

      setPerpMarkets(perpsData.markets || [])
      setPredictions(predictionsData.questions || [])

      if (authenticated && user) {
        const positionsRes = await fetch(`/api/markets/positions/${user.id}`)
        const positionsData = await positionsRes.json()
        
        const perpPos = positionsData.perpetuals?.positions || []
        const predPos = positionsData.predictions?.positions || []
        
        setPerpPositions(perpPos)
        setPredictionPositions(predPos)
        
        // Debug logging
        logger.info(`Loaded positions: ${perpPos.length} perps, ${predPos.length} predictions`, 
          { perpCount: perpPos.length, predCount: predPos.length, userId: user.id }, 
          'MarketsPage'
        )
        
        // Console log for immediate visibility
        console.log('🎯 POSITIONS LOADED:', {
          perpetuals: perpPos.length,
          predictions: predPos.length,
          userId: user.id,
          predictionDetails: predPos.map((p: any) => ({
            question: p.question,
            side: p.side,
            shares: p.shares,
          }))
        })
      }
      
      // Trigger balance refresh after data fetch (after trades)
      setBalanceRefreshTrigger(Date.now())
    } catch (error) {
      logger.error('Error fetching markets data:', error, 'MarketsPage')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user])

  const filteredPerpMarkets = perpMarkets.filter(m =>
    !searchQuery.trim() ||
    m.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredPredictions = predictions.filter(p =>
    !searchQuery.trim() ||
    p.text.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activePredictions = predictions.filter(p => p.status === 'active')
  const resolvedPredictions = predictions.filter(p => p.status === 'resolved')

  const handleMarketClick = (market: PerpMarket) => {
    if (!authenticated) {
      // Go directly to Privy wallet connect
      login()
      return
    }
    setSelectedPerpMarket(market)
    setPerpModalOpen(true)
  }

  const handlePredictionClick = (prediction: PredictionMarket) => {
    if (!authenticated) {
      // Go directly to Privy wallet connect
      login()
      return
    }
    // Convert to format expected by modal (id as number if possible, otherwise string)
    setSelectedPrediction({
      ...prediction,
      id: typeof prediction.id === 'number' ? prediction.id : (typeof prediction.id === 'string' ? parseInt(prediction.id) || prediction.id : prediction.id)
    } as PredictionMarket)
    setPredictionModalOpen(true)
  }

  const formatPrice = (p: number) => `$${p.toFixed(2)}`
  const formatVolume = (v: number) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
    return `$${(v / 1e3).toFixed(2)}K`
  }

  const getDaysLeft = (date?: string) => {
    if (!date) return null
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading markets...</p>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('futures')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all',
                activeTab === 'futures'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Perpetual Futures ({perpMarkets.length})
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all',
                activeTab === 'predictions'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Prediction Markets ({activePredictions.length})
            </button>
          </div>

          {/* Wallet Balance */}
          {authenticated && <WalletBalance refreshTrigger={balanceRefreshTrigger} />}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="search"
              placeholder={activeTab === 'futures' ? "Search tickers..." : "Search questions..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'futures' ? (
          <div className="p-4">
            {/* Show positions section FIRST if authenticated */}
            {authenticated && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3">YOUR POSITIONS ({perpPositions.length})</h2>
                {perpPositions.length > 0 ? (
                  <div className="mb-6">
                    <PerpPositionsList positions={perpPositions} onPositionClosed={fetchData} />
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-muted/50 text-center mb-6">
                    <p className="text-sm text-muted-foreground">
                      No perpetual positions yet. Open a long or short position to start trading!
                    </p>
                  </div>
                )}
              </>
            )}
            
            <h2 className="text-sm font-bold text-muted-foreground mb-3">ALL MARKETS</h2>
            <div className="space-y-2">
              {filteredPerpMarkets.map((market, idx) => (
                <button
                  key={`market-${market.ticker}-${idx}`}
                  onClick={() => handleMarketClick(market)}
                  className="w-full p-3 rounded-lg text-left hover:bg-accent border bg-card border-border transition-all"
                >
                  <div className="flex justify-between mb-2">
                    <div>
                      <div className="font-bold">${market.ticker}</div>
                      <div className="text-xs text-muted-foreground">{market.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatPrice(market.currentPrice)}</div>
                      <div className={cn(
                        "text-xs font-medium flex items-center gap-1 justify-end",
                        market.change24h >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {market.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {market.change24h >= 0 ? '+' : ''}{market.changePercent24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <div>Vol: {formatVolume(market.volume24h)}</div>
                    <div>OI: {formatVolume(market.openInterest)}</div>
                    <div className={market.fundingRate.rate >= 0 ? "text-orange-500" : "text-blue-500"}>
                      Fund: {(market.fundingRate.rate * 100).toFixed(4)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4">
            {/* Show positions section FIRST if authenticated */}
            {authenticated && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3">YOUR POSITIONS ({predictionPositions.length})</h2>
                {predictionPositions.length > 0 ? (
                  <div className="mb-6">
                    <PredictionPositionsList positions={predictionPositions} onPositionSold={fetchData} />
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-muted/50 text-center mb-6">
                    <p className="text-sm text-muted-foreground">
                      No prediction positions yet. Buy YES or NO shares to start trading!
                    </p>
                  </div>
                )}
              </>
            )}

            <h2 className="text-sm font-bold text-muted-foreground mb-3">ACTIVE MARKETS ({activePredictions.length})</h2>
            <div className="space-y-2 mb-6">
              {filteredPredictions.filter(p => p.status === 'active').map((prediction, idx) => {
                const daysLeft = getDaysLeft(prediction.resolutionDate)
                const totalShares = (prediction.yesShares || 0) + (prediction.noShares || 0)
                const yesPrice = totalShares > 0 ? ((prediction.yesShares || 0) / totalShares * 100).toFixed(1) : '50'
                const noPrice = totalShares > 0 ? ((prediction.noShares || 0) / totalShares * 100).toFixed(1) : '50'
                const hasPosition = prediction.userPosition !== null && prediction.userPosition !== undefined
                
                return (
                  <button
                    key={`prediction-${prediction.id}-${idx}`}
                    onClick={() => handlePredictionClick(prediction)}
                    className={cn(
                      "w-full p-3 rounded-lg text-left hover:bg-accent border transition-all",
                      hasPosition ? "bg-card border-primary/30" : "bg-card border-border"
                    )}
                  >
                    <div className="font-medium mb-2">{prediction.text}</div>
                    <div className="flex gap-3 text-xs text-muted-foreground items-center justify-between">
                      <div className="flex gap-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysLeft !== null ? `${daysLeft}d` : 'Soon'}
                        </div>
                        <div className="text-green-600">{yesPrice}% YES</div>
                        <div className="text-red-600">{noPrice}% NO</div>
                      </div>
                      {hasPosition && prediction.userPosition && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            "px-2 py-0.5 rounded font-medium",
                            prediction.userPosition.side === 'YES'
                              ? "bg-green-600/20 text-green-600"
                              : "bg-red-600/20 text-red-600"
                          )}>
                            {prediction.userPosition.side} {prediction.userPosition.shares.toFixed(2)}
                          </span>
                          <span className={cn(
                            "font-medium",
                            prediction.userPosition.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {prediction.userPosition.unrealizedPnL >= 0 ? '+' : ''}${prediction.userPosition.unrealizedPnL.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {resolvedPredictions.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3 mt-6">RESOLVED ({resolvedPredictions.length})</h2>
                <div className="space-y-2">
                  {filteredPredictions.filter(p => p.status === 'resolved').map((prediction, idx) => (
                    <div key={`resolved-${prediction.id}-${idx}`} className="p-3 rounded-lg bg-card border border-border opacity-60">
                      <div className="font-medium mb-2">{prediction.text}</div>
                      <div className="flex gap-2 text-xs">
                        <span className="text-muted-foreground">Resolved:</span>
                        <span className={prediction.resolvedOutcome ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                          {prediction.resolvedOutcome ? 'YES' : 'NO'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!authenticated && (
        <div className="border-t border-border bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-3">Connect your wallet to trade</p>
          <button
            onClick={login}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Trading Modals */}
      {selectedPerpMarket && (
        <PerpTradingModal
          market={selectedPerpMarket}
          isOpen={perpModalOpen}
          onClose={() => setPerpModalOpen(false)}
          onSuccess={fetchData}
        />
      )}

      {selectedPrediction && (
        <PredictionTradingModal
          question={selectedPrediction as any}
          isOpen={predictionModalOpen}
          onClose={() => setPredictionModalOpen(false)}
          onSuccess={fetchData}
        />
      )}
    </PageContainer>
  )
}


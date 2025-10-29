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
import { useLoginModal } from '@/hooks/useLoginModal'

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

type MarketTab = 'futures' | 'predictions'

export default function MarketsPage() {
  const { user, authenticated } = useAuth()
  const { showLoginModal } = useLoginModal()
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
  const [perpPositions, setPerpPositions] = useState<any[]>([])
  const [predictionPositions, setPredictionPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch data
  const fetchData = async () => {
    try {
      const [perpsRes, predictionsRes] = await Promise.all([
        fetch('/api/markets/perps'),
        fetch('/api/markets/predictions'),
      ])

      const perpsData = await perpsRes.json()
      const predictionsData = await predictionsRes.json()

      setPerpMarkets(perpsData.markets || [])
      setPredictions(predictionsData.questions || [])

      if (authenticated && user) {
        const positionsRes = await fetch(`/api/markets/positions/${user.id}`)
        const positionsData = await positionsRes.json()
        setPerpPositions(positionsData.perpetuals?.positions || [])
        setPredictionPositions(positionsData.predictions?.positions || [])
      }
    } catch (error) {
      console.error('Error fetching markets data:', error)
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
  const totalPnL = perpPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0)

  const handleMarketClick = (market: PerpMarket) => {
    if (!authenticated) {
      showLoginModal({
        title: 'Login to Trade',
        message: 'Connect your wallet to trade perpetual futures with up to 100x leverage.',
      })
      return
    }
    setSelectedPerpMarket(market)
    setPerpModalOpen(true)
  }

  const handlePredictionClick = (prediction: PredictionMarket) => {
    if (!authenticated) {
      showLoginModal({
        title: 'Login to Trade',
        message: 'Connect your wallet to bet on prediction markets.',
      })
      return
    }
    setSelectedPrediction(prediction)
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
          {authenticated && <WalletBalance />}

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
            <h2 className="text-sm font-bold text-muted-foreground mb-3">MARKETS</h2>
            <div className="space-y-2 mb-6">
              {filteredPerpMarkets.map((market) => (
                <button
                  key={market.ticker}
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
            
            {authenticated && perpPositions.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3">YOUR POSITIONS</h2>
                <PerpPositionsList positions={perpPositions} onPositionClosed={fetchData} />
              </>
            )}
          </div>
        ) : (
          <div className="p-4">
            <h2 className="text-sm font-bold text-muted-foreground mb-3">ACTIVE ({activePredictions.length})</h2>
            <div className="space-y-2 mb-6">
              {filteredPredictions.filter(p => p.status === 'active').map((prediction) => {
                const daysLeft = getDaysLeft(prediction.resolutionDate)
                return (
                  <button
                    key={prediction.id}
                    onClick={() => handlePredictionClick(prediction)}
                    className="w-full p-3 rounded-lg text-left hover:bg-accent border bg-card border-border transition-all"
                  >
                    <div className="font-medium mb-2">{prediction.text}</div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {daysLeft !== null ? `${daysLeft}d` : 'Soon'}
                      </div>
                      <div className="text-green-600">50% YES</div>
                      <div className="text-red-600">50% NO</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {authenticated && predictionPositions.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3">YOUR POSITIONS</h2>
                <PredictionPositionsList positions={predictionPositions} onPositionSold={fetchData} />
              </>
            )}

            {resolvedPredictions.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-muted-foreground mb-3 mt-6">RESOLVED ({resolvedPredictions.length})</h2>
                <div className="space-y-2">
                  {filteredPredictions.filter(p => p.status === 'resolved').map((prediction) => (
                    <div key={prediction.id} className="p-3 rounded-lg bg-card border border-border opacity-60">
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
            onClick={() => showLoginModal({ title: 'Login to Trade' })}
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
          question={selectedPrediction}
          isOpen={predictionModalOpen}
          onClose={() => setPredictionModalOpen(false)}
          onSuccess={fetchData}
        />
      )}
    </PageContainer>
  )
}


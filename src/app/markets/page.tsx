'use client'

import { useState, useMemo } from 'react'
import { Search, Activity } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

// Placeholder - would come from API/WebSocket in production
interface PerpMarket {
  ticker: string
  name: string
  currentPrice: number
  change24h: number
  changePercent24h: number
  high24h: number
  low24h: number
  volume24h: number
  fundingRate: number
  openInterest: number
}

interface Position {
  id: string
  ticker: string
  side: 'long' | 'short'
  entryPrice: number
  currentPrice: number
  size: number
  leverage: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
  liquidationPrice: number
  fundingPaid: number
}

export default function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMarket, setSelectedMarket] = useState<PerpMarket | null>(null)
  const [orderSide, setOrderSide] = useState<'long' | 'short'>('long')
  const [orderSize, setOrderSize] = useState('100')
  const [leverage, setLeverage] = useState(10)

  // Mock data - would come from realtime engine via API
  const markets: PerpMarket[] = useMemo(() => [
    {
      ticker: 'FACEHOOK',
      name: 'FaceHook (Meta)',
      currentPrice: 520.50,
      change24h: -5.30,
      changePercent24h: -1.01,
      high24h: 527.20,
      low24h: 518.10,
      volume24h: 45600000,
      fundingRate: 0.0001, // 0.01% per 8h
      openInterest: 125000000,
    },
    {
      ticker: 'NVIDIOT',
      name: 'NVIDIOT',
      currentPrice: 1248.75,
      change24h: 23.50,
      changePercent24h: 1.92,
      high24h: 1252.00,
      low24h: 1225.25,
      volume24h: 89200000,
      fundingRate: 0.0003,
      openInterest: 342000000,
    },
    {
      ticker: 'XITTER',
      name: 'Xitter (X)',
      currentPrice: 41.85,
      change24h: -2.15,
      changePercent24h: -4.89,
      high24h: 44.50,
      low24h: 41.20,
      volume24h: 12400000,
      fundingRate: -0.0002, // Negative funding
      openInterest: 28000000,
    },
    {
      ticker: 'TESLABOT',
      name: 'TeslaBot',
      currentPrice: 247.20,
      change24h: 3.70,
      changePercent24h: 1.52,
      high24h: 249.00,
      low24h: 243.50,
      volume24h: 67800000,
      fundingRate: 0.00015,
      openInterest: 198000000,
    },
    {
      ticker: 'OPENLIE',
      name: 'OpenLIE',
      currentPrice: 448.30,
      change24h: -8.20,
      changePercent24h: -1.80,
      high24h: 458.50,
      low24h: 445.00,
      volume24h: 54200000,
      fundingRate: 0.0002,
      openInterest: 156000000,
    },
  ], [])

  // Mock positions - would come from user's account
  const positions: Position[] = useMemo(() => [
    {
      id: 'pos-1',
      ticker: 'FACEHOOK',
      side: 'long',
      entryPrice: 525.00,
      currentPrice: 520.50,
      size: 1000,
      leverage: 10,
      unrealizedPnL: -85.71,
      unrealizedPnLPercent: -8.57,
      liquidationPrice: 472.50,
      fundingPaid: 2.50,
    },
    {
      id: 'pos-2',
      ticker: 'XITTER',
      side: 'short',
      entryPrice: 44.00,
      currentPrice: 41.85,
      size: 500,
      leverage: 20,
      unrealizedPnL: 24.43,
      unrealizedPnLPercent: 4.89,
      liquidationPrice: 46.20,
      fundingPaid: -1.20, // Receiving funding
    },
  ], [])

  const filteredMarkets = useMemo(() => {
    if (!searchQuery.trim()) return markets

    const query = searchQuery.toLowerCase()
    return markets.filter(m =>
      m.ticker.toLowerCase().includes(query) ||
      m.name.toLowerCase().includes(query)
    )
  }, [markets, searchQuery])

  const totalPnL = useMemo(() => {
    return positions.reduce((sum, p) => sum + p.unrealizedPnL, 0)
  }, [positions])

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`
    return `$${volume.toFixed(0)}`
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header with Portfolio Summary */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4 space-y-4">
          {/* Portfolio Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Total PnL</div>
              <div className={cn(
                "text-lg font-bold",
                totalPnL >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatPrice(totalPnL)}
              </div>
            </div>
            <div className="bg-muted p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Open Positions</div>
              <div className="text-lg font-bold text-foreground">{positions.length}</div>
            </div>
            <div className="bg-muted p-3 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Markets</div>
              <div className="text-lg font-bold text-foreground">{markets.length}</div>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search tickers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full pl-10 pr-4 py-3 rounded-lg',
                'bg-muted border border-border text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'transition-all duration-200'
              )}
            />
          </div>
        </div>
      </div>

      {/* Main content - 2 column layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Markets List */}
        <div className="flex-1 overflow-y-auto border-r border-border">
          <div className="p-4 space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground mb-3">PERPETUAL MARKETS</h2>
            
            {filteredMarkets.map((market) => (
              <button
                key={market.ticker}
                onClick={() => setSelectedMarket(market)}
                className={cn(
                  'w-full p-3 rounded-lg text-left transition-all',
                  'hover:bg-accent border',
                  selectedMarket?.ticker === market.ticker
                    ? 'bg-accent border-primary'
                    : 'bg-card border-border'
                )}
              >
                {/* Ticker and name */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-foreground">${market.ticker}</div>
                    <div className="text-xs text-muted-foreground">{market.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-foreground">{formatPrice(market.currentPrice)}</div>
                    <div className={cn(
                      "text-xs font-medium",
                      market.change24h >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {market.change24h >= 0 ? '+' : ''}{market.changePercent24h.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div>Vol: {formatVolume(market.volume24h)}</div>
                  <div>OI: {formatVolume(market.openInterest)}</div>
                  <div className={cn(
                    "font-medium",
                    market.fundingRate >= 0 ? "text-orange-500" : "text-blue-500"
                  )}>
                    Fund: {(market.fundingRate * 100).toFixed(4)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Trading Panel */}
        <div className="w-[400px] flex flex-col">
          {selectedMarket ? (
            <>
              {/* Market details */}
              <div className="p-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground mb-1">${selectedMarket.ticker}</h2>
                <p className="text-sm text-muted-foreground mb-3">{selectedMarket.name}</p>
                
                <div className="text-3xl font-bold text-foreground mb-1">
                  {formatPrice(selectedMarket.currentPrice)}
                </div>
                <div className={cn(
                  "text-sm font-medium",
                  selectedMarket.change24h >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {selectedMarket.change24h >= 0 ? '+' : ''}{formatPrice(selectedMarket.change24h)} ({selectedMarket.changePercent24h.toFixed(2)}%)
                </div>

                {/* 24h stats */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">24h High</div>
                    <div className="font-medium text-foreground">{formatPrice(selectedMarket.high24h)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">24h Low</div>
                    <div className="font-medium text-foreground">{formatPrice(selectedMarket.low24h)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">24h Volume</div>
                    <div className="font-medium text-foreground">{formatVolume(selectedMarket.volume24h)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Funding Rate</div>
                    <div className={cn(
                      "font-medium",
                      selectedMarket.fundingRate >= 0 ? "text-orange-500" : "text-blue-500"
                    )}>
                      {(selectedMarket.fundingRate * 100).toFixed(4)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Order form */}
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-bold text-foreground mb-3">OPEN POSITION</h3>

                {/* Long/Short tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setOrderSide('long')}
                    className={cn(
                      'flex-1 py-2 rounded-lg font-medium transition-all',
                      orderSide === 'long'
                        ? 'bg-green-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    LONG
                  </button>
                  <button
                    onClick={() => setOrderSide('short')}
                    className={cn(
                      'flex-1 py-2 rounded-lg font-medium transition-all',
                      orderSide === 'short'
                        ? 'bg-red-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    SHORT
                  </button>
                </div>

                {/* Size input */}
                <div className="mb-4">
                  <label className="text-xs text-muted-foreground mb-1 block">Size (USD)</label>
                  <input
                    type="number"
                    value={orderSize}
                    onChange={(e) => setOrderSize(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground"
                    placeholder="100"
                  />
                </div>

                {/* Leverage slider */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">Leverage</label>
                    <span className="text-sm font-bold text-foreground">{leverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={leverage}
                    onChange={(e) => setLeverage(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1x</span>
                    <span>25x</span>
                    <span>50x</span>
                    <span>100x</span>
                  </div>
                </div>

                {/* Order summary */}
                <div className="bg-muted p-3 rounded-lg mb-4 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry Price</span>
                    <span className="text-foreground font-medium">{formatPrice(selectedMarket.currentPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Position Value</span>
                    <span className="text-foreground font-medium">{formatPrice(parseFloat(orderSize) * leverage)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Liquidation Price</span>
                    <span className="text-red-600 font-medium">
                      {formatPrice(
                        orderSide === 'long'
                          ? selectedMarket.currentPrice * (1 - 0.9 / leverage)
                          : selectedMarket.currentPrice * (1 + 0.9 / leverage)
                      )}
                    </span>
                  </div>
                </div>

                {/* Place order button */}
                <button
                  className={cn(
                    'w-full py-3 rounded-lg font-bold text-white transition-all',
                    orderSide === 'long'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  )}
                >
                  {orderSide === 'long' ? 'LONG' : 'SHORT'} ${selectedMarket.ticker}
                </button>
              </div>

              {/* Current positions for this ticker */}
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-bold text-muted-foreground mb-3">YOUR POSITIONS</h3>
                
                {positions.filter(p => p.ticker === selectedMarket.ticker).length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No open positions for ${selectedMarket.ticker}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {positions
                      .filter(p => p.ticker === selectedMarket.ticker)
                      .map((position) => (
                        <div
                          key={position.id}
                          className="p-3 rounded-lg bg-card border border-border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded",
                                position.side === 'long'
                                  ? "bg-green-600/20 text-green-600"
                                  : "bg-red-600/20 text-red-600"
                              )}>
                                {position.leverage}x {position.side.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className={cn(
                                "text-sm font-bold",
                                position.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                              )}>
                                {position.unrealizedPnL >= 0 ? '+' : ''}{formatPrice(position.unrealizedPnL)}
                              </div>
                              <div className={cn(
                                "text-xs",
                                position.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                              )}>
                                {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          <div className="text-xs space-y-1">
                            <div className="flex justify-between text-muted-foreground">
                              <span>Entry</span>
                              <span className="text-foreground">{formatPrice(position.entryPrice)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Current</span>
                              <span className="text-foreground">{formatPrice(position.currentPrice)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Liquidation</span>
                              <span className="text-red-600">{formatPrice(position.liquidationPrice)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Size</span>
                              <span className="text-foreground">{formatPrice(position.size)}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Funding Paid</span>
                              <span className={position.fundingPaid >= 0 ? "text-red-600" : "text-green-600"}>
                                {position.fundingPaid >= 0 ? '-' : '+'}{formatPrice(Math.abs(position.fundingPaid))}
                              </span>
                            </div>
                          </div>

                          <button className="w-full mt-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all">
                            Close Position
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
              <div>
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a market to start trading</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All positions summary at bottom */}
      {positions.length > 0 && (
        <div className="border-t border-border bg-muted/50">
          <div className="p-4">
            <h3 className="text-sm font-bold text-muted-foreground mb-3">ALL POSITIONS ({positions.length})</h3>
            <div className="space-y-2">
              {positions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between p-2 rounded bg-card border border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded",
                      position.side === 'long'
                        ? "bg-green-600/20 text-green-600"
                        : "bg-red-600/20 text-red-600"
                    )}>
                      {position.leverage}x {position.side.toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-foreground">${position.ticker}</span>
                    <span className="text-xs text-muted-foreground">{formatPrice(position.size)}</span>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "text-sm font-bold",
                      position.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {position.unrealizedPnL >= 0 ? '+' : ''}{formatPrice(position.unrealizedPnL)}
                    </div>
                    <div className={cn(
                      "text-xs",
                      position.unrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

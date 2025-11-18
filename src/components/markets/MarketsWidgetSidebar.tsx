'use client'

import { MarketOverviewPanel } from './MarketOverviewPanel'
import { TopMoversPanel } from './TopMoversPanel'
import { PredictionTrendingPanel } from './PredictionTrendingPanel'

/**
 * Markets widget sidebar component for displaying market panels.
 * 
 * Container component that displays multiple market-related panels in a sidebar:
 * - Market overview statistics
 * - Top movers (gainers/losers)
 * - Trending prediction markets
 * 
 * Only visible on extra-large screens (xl breakpoint). Provides click handlers
 * for navigating to market detail pages.
 * 
 * @param props - MarketsWidgetSidebar component props
 * @returns Markets widget sidebar element (hidden on smaller screens)
 * 
 * @example
 * ```tsx
 * <MarketsWidgetSidebar
 *   onMarketClick={(market) => router.push(`/markets/${market.ticker}`)}
 *   onPredictionClick={(id) => router.push(`/markets/predictions/${id}`)}
 * />
 * ```
 */
interface MarketsWidgetSidebarProps {
  onMarketClick?: (market: {
    ticker: string
    name: string
    currentPrice: number
    change24h: number
    changePercent24h: number
    organizationId?: string
    high24h?: number
    low24h?: number
    volume24h?: number
    openInterest?: number
    fundingRate?: {
      rate: number
      nextFundingTime: string
      predictedRate: number
    }
    maxLeverage?: number
    minOrderSize?: number
  }) => void
  onPredictionClick?: (marketId: string) => void
}

export function MarketsWidgetSidebar({ onMarketClick, onPredictionClick }: MarketsWidgetSidebarProps) {
  return (
    <div className="hidden xl:flex flex-col w-96 shrink-0 overflow-y-auto bg-sidebar p-4 gap-4">
      {/* Top: Market Overview */}
      <div className="shrink-0">
        <MarketOverviewPanel />
      </div>

      {/* Middle: Top Movers */}
      <div className="flex-1 flex flex-col min-h-[200px]">
        <TopMoversPanel onMarketClick={onMarketClick} />
      </div>

      {/* Bottom: Prediction Markets */}
      <div className="flex-1 flex flex-col min-h-[200px]">
        <PredictionTrendingPanel onMarketClick={onPredictionClick} />
      </div>
    </div>
  )
}

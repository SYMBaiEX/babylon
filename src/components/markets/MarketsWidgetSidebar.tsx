'use client'

import { MarketOverviewPanel } from './MarketOverviewPanel'
import { TopMoversPanel } from './TopMoversPanel'
import { EconomicCalendarPanel } from './EconomicCalendarPanel'

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
  onEventClick?: (event: {
    id: string
    title: string
    date: string
    time: string
    impact: 'high' | 'medium' | 'low'
    country?: string
  }) => void
}

export function MarketsWidgetSidebar({ onMarketClick, onEventClick }: MarketsWidgetSidebarProps) {
  return (
    <div className="hidden xl:flex flex-col w-96 flex-shrink-0 overflow-y-auto bg-sidebar p-4 gap-4">
      {/* Top: Market Overview */}
      <div className="flex-shrink-0">
        <MarketOverviewPanel />
      </div>

      {/* Middle: Top Movers */}
      <div className="flex-1 flex flex-col min-h-[200px]">
        <TopMoversPanel onMarketClick={onMarketClick} />
      </div>

      {/* Bottom: Economic Calendar */}
      <div className="flex-shrink-0 min-h-[200px] flex flex-col">
        <EconomicCalendarPanel onEventClick={onEventClick} />
      </div>
    </div>
  )
}


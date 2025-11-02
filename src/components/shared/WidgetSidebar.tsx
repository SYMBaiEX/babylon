'use client'

import { TrendingPostsPanel } from '@/components/feed/TrendingPostsPanel'
import { MarketOverviewPanel } from '@/components/markets/MarketOverviewPanel'
import { TopMoversPanel } from '@/components/markets/TopMoversPanel'

export function WidgetSidebar() {
  return (
    <div className="hidden xl:flex flex-col w-96 flex-shrink-0 overflow-y-auto bg-sidebar px-4 py-6 gap-6">
      {/* Top: Trending Posts */}
      <div className="flex-shrink-0 min-h-[250px] flex flex-col">
        <TrendingPostsPanel />
      </div>

      {/* Middle: Market Overview */}
      <div className="flex-shrink-0 min-h-[200px] flex flex-col">
        <MarketOverviewPanel />
      </div>

      {/* Bottom: Top Movers */}
      <div className="flex-shrink-0 min-h-[250px] flex flex-col">
        <TopMoversPanel />
      </div>
    </div>
  )
}


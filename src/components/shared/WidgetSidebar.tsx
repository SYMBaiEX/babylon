'use client'

import { LatestNewsPanel } from '@/components/feed/LatestNewsPanel'
import { TrendingPanel } from '@/components/feed/TrendingPanel'
import { MarketsPanel } from '@/components/feed/MarketsPanel'

export function WidgetSidebar() {
  return (
    <div className="hidden xl:flex flex-col w-96 flex-shrink-0 bg-sidebar">
      {/* Sticky container that scrolls with feed */}
      <div className="sticky top-0 flex flex-col px-4 py-6 gap-6 max-h-screen overflow-y-auto">
        {/* Top: Latest News (Long-form articles) */}
        <div className="flex-shrink-0">
          <LatestNewsPanel />
        </div>

        {/* Middle: Trending */}
        <div className="flex-shrink-0">
          <TrendingPanel />
        </div>

        {/* Bottom: Markets Widget */}
        <div className="flex-shrink-0">
          <MarketsPanel />
        </div>
      </div>
    </div>
  )
}


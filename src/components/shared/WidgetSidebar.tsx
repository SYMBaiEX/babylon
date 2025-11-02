'use client'

import { BreakingNewsPanel } from '@/components/feed/BreakingNewsPanel'
import { UpcomingEventsPanel } from '@/components/feed/UpcomingEventsPanel'
import { BabylonStatsPanel } from '@/components/feed/BabylonStatsPanel'

export function WidgetSidebar() {
  return (
    <div className="hidden xl:flex flex-col w-96 flex-shrink-0 overflow-y-auto bg-sidebar p-4 justify-between">
      {/* Top: Breaking News */}
      <div className="flex-shrink-0 min-h-[200px] flex flex-col">
        <BreakingNewsPanel />
      </div>

      {/* Middle: Upcoming Events - vertically centered */}
      <div className="flex-1 flex flex-col justify-center min-h-[200px]">
        <UpcomingEventsPanel />
      </div>

      {/* Bottom: Babylon Stats */}
      <div className="flex-shrink-0 min-h-[150px] flex flex-col">
        <BabylonStatsPanel />
      </div>
    </div>
  )
}


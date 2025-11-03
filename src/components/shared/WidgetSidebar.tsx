'use client'

import { BreakingNewsPanel } from '@/components/feed/BreakingNewsPanel'
import { UpcomingEventsPanel } from '@/components/feed/UpcomingEventsPanel'

export function WidgetSidebar() {
  return (
    <div className="hidden xl:flex flex-col w-96 flex-shrink-0 overflow-y-auto bg-sidebar px-4 py-6 gap-6">
      {/* Top: Breaking News */}
      <div className="flex-shrink-0 min-h-[250px] flex flex-col">
        <BreakingNewsPanel />
      </div>

      {/* Bottom: Upcoming Events */}
      <div className="flex-1 flex flex-col justify-center min-h-[200px]">
        <UpcomingEventsPanel />
      </div>
    </div>
  )
}


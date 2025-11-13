'use client'

import { useEffect, useRef, useState } from 'react'
import StickySidebar from 'sticky-sidebar-v2'
import { LatestNewsPanel } from '@/components/feed/LatestNewsPanel'
import { TrendingPanel } from '@/components/feed/TrendingPanel'
import { MarketsPanel } from '@/components/feed/MarketsPanel'
import { EntitySearchAutocomplete } from '@/components/explore/EntitySearchAutocomplete'

export function WidgetSidebar() {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const stickyInstance = useRef<StickySidebar | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!sidebarRef.current) return

    // Initialize sticky sidebar
    stickyInstance.current = new StickySidebar(sidebarRef.current, {
      topSpacing: 0,
      bottomSpacing: 0,
      containerSelector: false, // Use parent container
      innerWrapperSelector: '.sidebar__inner',
      resizeSensor: true,
      stickyClass: 'is-affixed',
      minWidth: 1280, // xl breakpoint
    })

    return () => {
      // Cleanup on unmount
      if (stickyInstance.current) {
        stickyInstance.current.destroy()
      }
    }
  }, [])

  return (
    <div
      ref={sidebarRef}
      className="hidden xl:flex flex-col w-96 flex-shrink-0 sidebar"
    >
      <div className="sidebar__inner flex flex-col px-4 py-6 gap-6">
        <div className="flex-shrink-0">
          <EntitySearchAutocomplete
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search users..."
          />
        </div>

        <div className="flex-shrink-0">
          <LatestNewsPanel />
        </div>

        <div className="flex-shrink-0">
          <TrendingPanel />
        </div>

        <div className="flex-shrink-0">
          <MarketsPanel />
        </div>
      </div>
    </div>
  )
}



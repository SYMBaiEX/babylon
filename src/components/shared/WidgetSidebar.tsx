'use client'

import { useEffect, useRef, useState } from 'react'
import { LatestNewsPanel } from '@/components/feed/LatestNewsPanel'
import { TrendingPanel } from '@/components/feed/TrendingPanel'
import { MarketsPanel } from '@/components/feed/MarketsPanel'

type StickyState = 'relative' | 'sticky-top' | 'sticky-bottom'

export function WidgetSidebar() {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [stickyState, setStickyState] = useState<StickyState>('relative')

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !contentRef.current) return

      const container = containerRef.current
      const content = contentRef.current
      const windowHeight = window.innerHeight
      const contentHeight = content.offsetHeight

      // Get positions relative to viewport
      const containerRect = container.getBoundingClientRect()
      const containerTop = containerRect.top

      // If content is shorter than viewport, just stick to top
      if (contentHeight <= windowHeight) {
        setStickyState('sticky-top')
        return
      }

      // Calculate content positions based on current state
      const contentTop = stickyState === 'sticky-bottom' 
        ? windowHeight - contentHeight 
        : containerTop
      const contentBottom = contentTop + contentHeight

      // Determine new state based on scroll position
      if (contentTop >= 0) {
        // Content top is below viewport top - use relative (scroll naturally)
        setStickyState('relative')
      } else if (contentBottom <= windowHeight) {
        // Content bottom has reached or passed viewport bottom - stick to bottom
        setStickyState('sticky-bottom')
      } else {
        // Content top is above viewport top but bottom hasn't reached viewport bottom
        // Stick to top
        setStickyState('sticky-top')
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [stickyState])

  return (
    <div ref={containerRef} className="hidden xl:flex flex-col w-96 flex-shrink-0 bg-sidebar">
      <div
        ref={contentRef}
        className="flex flex-col px-4 py-6 gap-6"
        style={{
          position: stickyState === 'relative' ? 'relative' : 'sticky',
          ...(stickyState === 'sticky-top' && { top: 0 }),
          ...(stickyState === 'sticky-bottom' && { bottom: 0 }),
        }}
      >
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


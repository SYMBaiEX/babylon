'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useChannelSubscription } from '@/hooks/useChannelSubscription'
import { UpcomingEventsDetailModal } from './UpcomingEventsDetailModal'
import { useWidgetCacheStore } from '@/stores/widgetCacheStore'

interface UpcomingEvent {
  id: string
  title: string
  date: string
  time?: string
  isLive?: boolean
  hint?: string
  fullDescription?: string
  source?: string
  relatedQuestion?: number
  imageUrl?: string
  relatedActorId?: string
  relatedOrganizationId?: string
}

export function UpcomingEventsPanel() {
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<UpcomingEvent | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { getUpcomingEvents, setUpcomingEvents } = useWidgetCacheStore()

  // Use ref to store fetchEvents function to break dependency chain
  const fetchEventsRef = useRef<(() => void) | null>(null)

  const fetchEvents = useCallback(async (skipCache = false) => {
    // Check cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getUpcomingEvents()
      if (cached) {
        setEvents(cached)
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch('/api/feed/widgets/upcoming-events')
      const data = await response.json()
      if (data.success) {
        const eventsData = data.events || []
        setEvents(eventsData)
        setUpcomingEvents(eventsData) // Cache the data
      }
    } catch (error) {
      logger.error('Error fetching upcoming events:', error, 'UpcomingEventsPanel')
    } finally {
      setLoading(false)
    }
  }, [getUpcomingEvents, setUpcomingEvents])

  // Update ref when fetchEvents changes
  useEffect(() => {
    fetchEventsRef.current = () => fetchEvents(true) // Skip cache on manual refresh
  }, [fetchEvents])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Subscribe to upcoming-events channel for real-time updates
  const handleChannelUpdate = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'new_questions') {
      // Refresh upcoming events when new questions are created
      logger.debug('Upcoming events update received, refreshing...', { data }, 'UpcomingEventsPanel')
      // Use ref to avoid dependency on fetchEvents
      fetchEventsRef.current?.()
    }
  }, []) // Empty dependency array prevents re-creation

  useChannelSubscription('upcoming-events', handleChannelUpdate)

  const handleEventClick = (event: UpcomingEvent) => {
    setSelectedEvent(event)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedEvent(null)
  }

  return (
    <>
      <div className="bg-sidebar rounded-lg p-4 flex-1 flex flex-col">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 text-left">Upcoming Events</h2>
        {loading ? (
          <div className="text-base text-muted-foreground pl-3 flex-1">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-base text-muted-foreground pl-3 flex-1">No upcoming events.</div>
        ) : (
          <div className="space-y-2.5 pl-3 flex-1">
            {events.map((event) => (
              <div
                key={event.id}
                onClick={() => handleEventClick(event)}
                className="flex items-start gap-2.5 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -ml-1.5 transition-colors duration-200"
              >
                <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-[#1c9cf0] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg sm:text-xl font-semibold text-foreground leading-relaxed">
                      {event.title}
                    </p>
                    {event.isLive && (
                      <span className="text-sm font-semibold text-[#1c9cf0] bg-[#1c9cf0]/10 px-2.5 py-1 rounded flex-shrink-0">
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-base sm:text-lg text-muted-foreground mt-1">
                    {event.date}
                    {event.time && `, ${event.time}`}
                  </p>
                  {event.hint && (
                    <p className="text-base sm:text-lg text-muted-foreground mt-1 italic">
                      {event.hint}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UpcomingEventsDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        event={selectedEvent}
      />
    </>
  )
}


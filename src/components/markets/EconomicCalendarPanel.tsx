'use client'

import { useEffect, useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface EconomicEvent {
  id: string
  title: string
  date: string
  time: string
  impact: 'high' | 'medium' | 'low'
  country?: string
}

interface EconomicCalendarPanelProps {
  onEventClick?: (event: EconomicEvent) => void
}

export function EconomicCalendarPanel({ onEventClick }: EconomicCalendarPanelProps) {
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // For now, generate mock events - replace with actual API call later
        const mockEvents: EconomicEvent[] = [
          {
            id: '1',
            title: 'Federal Reserve Interest Rate Decision',
            date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: '14:00 ET',
            impact: 'high',
            country: 'US',
          },
          {
            id: '2',
            title: 'Non-Farm Payrolls',
            date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: '08:30 ET',
            impact: 'high',
            country: 'US',
          },
          {
            id: '3',
            title: 'CPI Data Release',
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: '08:30 ET',
            impact: 'high',
            country: 'US',
          },
          {
            id: '4',
            title: 'GDP Growth Rate',
            date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: '08:30 ET',
            impact: 'medium',
            country: 'US',
          },
        ]

        setEvents(mockEvents)
        // TODO: Replace with actual API call
        // const response = await fetch('/api/markets/economic-calendar')
        // const data = await response.json()
        // if (data.success) {
        //   setEvents(data.events || [])
        // }
      } catch (error) {
        logger.error('Error fetching economic calendar:', error, 'EconomicCalendarPanel')
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
    const interval = setInterval(fetchEvents, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const getImpactColor = (impact: EconomicEvent['impact']) => {
    switch (impact) {
      case 'high':
        return 'bg-red-500/20 text-red-600 border-red-500/30'
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30'
      case 'low':
        return 'bg-blue-500/20 text-blue-600 border-blue-500/30'
    }
  }

  return (
    <div className="bg-sidebar rounded-lg p-4 flex-1 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-5 h-5 text-[#1c9cf0]" />
        <h2 className="text-xl font-bold text-foreground">Economic Calendar</h2>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground flex-1">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground flex-1">No upcoming events</div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => onEventClick?.(event)}
              className="w-full p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-foreground flex-1">{event.title}</h3>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-xs font-medium border",
                  getImpactColor(event.impact)
                )}>
                  {event.impact.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{event.date}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{event.time}</span>
                </div>
                {event.country && (
                  <span className="text-xs">{event.country}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


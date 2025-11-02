'use client'

import { X, Calendar, Clock, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EconomicEvent {
  id: string
  title: string
  date: string
  time: string
  impact: 'high' | 'medium' | 'low'
  country?: string
}

interface EconomicCalendarModalProps {
  event: EconomicEvent | null
  isOpen: boolean
  onClose: () => void
}

export function EconomicCalendarModal({ event, isOpen, onClose }: EconomicCalendarModalProps) {
  if (!isOpen || !event) return null

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

  const getImpactDescription = (impact: EconomicEvent['impact']) => {
    switch (impact) {
      case 'high':
        return 'This event typically has a significant impact on markets and can cause high volatility.'
      case 'medium':
        return 'This event has a moderate impact on markets and may cause some volatility.'
      case 'low':
        return 'This event has a minor impact on markets with limited volatility expected.'
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg">
        <div className="bg-popover rounded shadow-xl p-4 sm:p-6 m-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">{event.title}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{event.date}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{event.time}</span>
                </div>
                {event.country && (
                  <span className="px-2 py-0.5 rounded bg-muted text-xs">{event.country}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-2 flex-shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* Impact Badge */}
          <div className="mb-6">
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border",
              getImpactColor(event.impact)
            )}>
              <AlertCircle className="w-4 h-4" />
              <span className="font-semibold text-sm">{event.impact.toUpperCase()} IMPACT</span>
            </div>
          </div>

          {/* Event Details */}
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-[#1c9cf0] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground mb-1">What to Expect</h3>
                  <p className="text-sm text-muted-foreground">
                    {getImpactDescription(event.impact)}
                  </p>
                </div>
              </div>
            </div>

            {/* Market Impact */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Market Impact</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Monitor price movements around {event.time}</li>
                <li>• Expect increased volatility during the announcement</li>
                <li>• Consider adjusting positions based on the outcome</li>
                {event.impact === 'high' && (
                  <li className="text-red-600 font-medium">• High impact events can cause significant price swings</li>
                )}
              </ul>
            </div>

            {/* Additional Info */}
            {event.country && (
              <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                This is a {event.country} economic indicator
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#1c9cf0] text-white rounded-lg font-medium hover:bg-[#1a8cd8] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}


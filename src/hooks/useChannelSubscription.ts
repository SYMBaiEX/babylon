'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useSSEChannel } from './useSSE'
import type { Channel } from './useSSE'

/**
 * Hook for subscribing to a channel for real-time updates
 * Uses Server-Sent Events (SSE) instead of WebSocket for Vercel compatibility
 */
export function useChannelSubscription(
  channel: Channel | null,
  onUpdate: (data: Record<string, unknown>) => void
) {
  // Use a ref to store the latest callback without causing re-subscriptions
  const onUpdateRef = useRef(onUpdate)
  
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  // Stable callback that won't change between renders
  const handleMessage = useCallback((data: Record<string, unknown>) => {
    onUpdateRef.current(data)
  }, []) // Empty deps - callback never changes, but accesses latest onUpdate via ref

  const { isConnected } = useSSEChannel(channel, handleMessage)

  return {
    isSubscribed: isConnected && channel !== null,
  }
}


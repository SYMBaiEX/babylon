'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useWebSocket } from './useWebSocket'
import { logger } from '@/lib/logger'

type Channel = 'feed' | 'markets' | 'breaking-news' | 'upcoming-events'

interface ChannelUpdate {
  type: string
  channel: Channel
  data: Record<string, unknown>
}

export function useChannelSubscription(
  channel: Channel | null,
  onUpdate: (data: ChannelUpdate['data']) => void
) {
  const { socket, isConnected } = useWebSocket()
  const subscribedChannelRef = useRef<Channel | null>(null)
  const socketInstanceRef = useRef<WebSocket | null>(null)
  const isConnectedRef = useRef(false)
  const onUpdateRef = useRef(onUpdate)
  const isSubscribingRef = useRef(false)
  const lastChannelRef = useRef<Channel | null>(null)
  const prevSocketRef = useRef<WebSocket | null>(null)
  const prevConnectedRef = useRef(false)

  // Keep refs up to date
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    socketInstanceRef.current = socket
    isConnectedRef.current = isConnected
  }, [socket, isConnected])

  // Subscribe/unsubscribe ONLY when channel changes or socket connection state genuinely changes
  useEffect(() => {
    const currentSocket = socketInstanceRef.current
    const currentConnected = isConnectedRef.current
    const currentChannel = channel

    // Early returns for invalid states
    if (!currentSocket || !currentConnected || currentSocket.readyState !== WebSocket.OPEN) {
      // Only reset if socket instance actually changed (not just a re-render)
      if (socketInstanceRef.current && socketInstanceRef.current !== currentSocket) {
        isSubscribingRef.current = false
        subscribedChannelRef.current = null
      }
      return
    }

    // If already subscribed to this exact channel with this exact socket, do nothing
    if (subscribedChannelRef.current === currentChannel && socketInstanceRef.current === currentSocket) {
      return
    }

    // Prevent rapid re-subscription cycles
    if (isSubscribingRef.current) {
      return
    }

    // Mark as subscribing
    isSubscribingRef.current = true

    // Unsubscribe from previous channel ONLY if switching to a different channel
    const previousChannel = subscribedChannelRef.current
    if (previousChannel && previousChannel !== currentChannel) {
      try {
        currentSocket.send(JSON.stringify({
          type: 'unsubscribe',
          data: { channel: previousChannel }
        }))
        logger.debug(`Unsubscribed from channel: ${previousChannel}`, undefined, 'useChannelSubscription')
      } catch (error) {
        logger.error('Error unsubscribing:', error, 'useChannelSubscription')
      }
    }

    // Subscribe to new channel
    if (currentChannel) {
      try {
        currentSocket.send(JSON.stringify({
          type: 'subscribe',
          data: { channel: currentChannel }
        }))
        subscribedChannelRef.current = currentChannel
        lastChannelRef.current = currentChannel
        logger.debug(`Subscribed to channel: ${currentChannel}`, undefined, 'useChannelSubscription')
      } catch (error) {
        logger.error('Error subscribing:', error, 'useChannelSubscription')
        isSubscribingRef.current = false
        return
      }
    } else {
      subscribedChannelRef.current = null
      lastChannelRef.current = null
    }

    // Reset subscribing flag after a delay
    const timeoutId = setTimeout(() => {
      isSubscribingRef.current = false
    }, 100)

    // Cleanup: Only unsubscribe if channel actually changed (real change, not just re-render)
    return () => {
      clearTimeout(timeoutId)
      
      // Only unsubscribe if channel prop actually changed
      const lastChannel = lastChannelRef.current
      const currentSocketAtCleanup = socketInstanceRef.current
      
      if (
        lastChannel && 
        currentSocketAtCleanup &&
        currentSocketAtCleanup.readyState === WebSocket.OPEN &&
        lastChannel !== currentChannel
      ) {
        try {
          currentSocketAtCleanup.send(JSON.stringify({
            type: 'unsubscribe',
            data: { channel: lastChannel }
          }))
          logger.debug(`Cleanup: Unsubscribed from channel: ${lastChannel}`, undefined, 'useChannelSubscription')
        } catch (error) {
          logger.error('Error unsubscribing in cleanup:', error, 'useChannelSubscription')
        }
        subscribedChannelRef.current = null
      }
      
      isSubscribingRef.current = false
    }
  }, [channel]) // ONLY depend on channel - use refs for socket/connected state

  // Separate effect to handle socket connection changes (reconnection after disconnect)
  // Only subscribe if socket just became connected AND we have a channel to subscribe to
  useEffect(() => {
    const currentSocket = socketInstanceRef.current
    const currentConnected = isConnectedRef.current
    const currentChannel = subscribedChannelRef.current
    const prevSocket = prevSocketRef.current
    const prevConnected = prevConnectedRef.current

    // Update refs
    prevSocketRef.current = currentSocket
    prevConnectedRef.current = currentConnected

    // Only act if socket JUST became connected (was disconnected, now connected)
    const justConnected = !prevConnected && currentConnected
    const socketChanged = prevSocket !== currentSocket

    // If socket just became connected or changed, and we have a channel, subscribe
    if ((justConnected || socketChanged) && currentSocket && currentConnected && currentSocket.readyState === WebSocket.OPEN && currentChannel && !isSubscribingRef.current) {
      // Double-check we're not already subscribed
      if (subscribedChannelRef.current === currentChannel) {
        return
      }

      // Need to subscribe
      isSubscribingRef.current = true
      try {
        currentSocket.send(JSON.stringify({
          type: 'subscribe',
          data: { channel: currentChannel }
        }))
        subscribedChannelRef.current = currentChannel
        logger.debug(`Re-subscribed to channel after reconnect: ${currentChannel}`, undefined, 'useChannelSubscription')
      } catch (error) {
        logger.error('Error re-subscribing after reconnect:', error, 'useChannelSubscription')
      }
      setTimeout(() => {
        isSubscribingRef.current = false
      }, 100)
    }
  }, [socket, isConnected]) // Watch socket/connected but use refs inside

  // Listen for channel updates
  useEffect(() => {
    const currentSocket = socketInstanceRef.current
    if (!currentSocket) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as ChannelUpdate & { type: string }

        if (message.type === 'channel_update' && message.channel === channel && message.data) {
          onUpdateRef.current(message.data)
        }
      } catch {
        // Ignore parse errors - might be other message types
      }
    }

    currentSocket.addEventListener('message', handleMessage)
    return () => currentSocket.removeEventListener('message', handleMessage)
  }, [socket, channel]) // Keep socket dependency but use ref inside

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    isSubscribed: subscribedChannelRef.current === channel && isConnectedRef.current,
  }), [channel, isConnected])
}


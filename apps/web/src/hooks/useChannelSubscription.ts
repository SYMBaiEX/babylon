'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Channel } from './useSSE';
import { useSSEChannel } from './useSSE';

/**
 * Hook for subscribing to a channel for real-time updates.
 *
 * Uses Server-Sent Events (SSE) instead of WebSocket for Vercel compatibility.
 * Automatically handles subscription lifecycle and ensures the callback always
 * receives the latest version without causing re-subscriptions.
 *
 * @param channel - The channel name to subscribe to, or null to unsubscribe.
 * @param onUpdate - Callback function called when updates are received for the channel.
 * The callback receives the update data as a record of key-value pairs.
 *
 * @returns An object with `isSubscribed` boolean indicating subscription status.
 *
 * @example
 * ```tsx
 * const { isSubscribed } = useChannelSubscription('markets', (data) => {
 *   console.log('Market update:', data);
 * });
 * ```
 */
export function useChannelSubscription(
  channel: Channel | null,
  onUpdate: (data: Record<string, unknown>) => void
) {
  // Use a ref to store the latest callback without causing re-subscriptions
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Stable callback that won't change between renders
  const handleMessage = useCallback((data: Record<string, unknown>) => {
    onUpdateRef.current(data);
  }, []); // Empty deps - callback never changes, but accesses latest onUpdate via ref

  const { isConnected } = useSSEChannel(channel, handleMessage);

  return {
    isSubscribed: isConnected && channel !== null,
  };
}

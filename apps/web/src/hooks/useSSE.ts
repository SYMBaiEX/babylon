/**
 * React hooks for Server-Sent Events (SSE) connection management.
 *
 * These hooks provide React integration with the SSEManager singleton,
 * handling subscription lifecycle, authentication state, and connection
 * state updates automatically.
 *
 * @example
 * ```tsx
 * // Single channel subscription
 * const { isConnected } = useSSEChannel('markets', (data) => {
 *   console.log('Market update:', data);
 * });
 *
 * // Multi-channel with manual control
 * const { isConnected, subscribe, unsubscribe, reconnect } = useSSE();
 * ```
 */

import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Channel,
  type ConnectionState,
  type SSECallback,
  SSEManager,
} from '@/lib/sse';

// Re-export types for backwards compatibility
export type {
  Channel,
  DynamicChannel,
  SSECallback,
  SSEMessage,
  StaticChannel,
} from '@/lib/sse';

/**
 * Options for configuring the SSE hook.
 */
interface SSEHookOptions {
  /** Initial channels to subscribe to */
  channels?: Channel[];
  /** Whether to automatically reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
  /** Delay between reconnection attempts in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
}

/**
 * Return type for the useSSE hook.
 */
interface SSEHookReturn {
  /** Whether currently connected to SSE endpoint */
  isConnected: boolean;
  /** Any connection error message */
  error: string | null;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Function to subscribe to a channel */
  subscribe: (channel: Channel, callback: SSECallback) => () => void;
  /** Function to unsubscribe all callbacks from a channel */
  unsubscribe: (channel: Channel) => void;
  /** Function to manually trigger reconnection */
  reconnect: () => void;
}

/**
 * Main hook for Server-Sent Events (SSE) connection management.
 *
 * Provides React integration with the SSEManager singleton, automatically
 * handling authentication state, connection lifecycle, and cleanup.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Shared connection across components (efficient)
 * - Channel-based subscription model
 * - Authentication token management via Privy
 * - Connection state tracking
 * - Online/offline support
 *
 * @param options - Configuration options for connection behavior
 * @returns SSE connection state and subscription management functions.
 *
 * @example
 * ```tsx
 * const { isConnected, subscribe, unsubscribe } = useSSE();
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe('markets', (msg) => {
 *     console.log('Received:', msg);
 *   });
 *   return unsubscribe;
 * }, [subscribe]);
 * ```
 */
export function useSSE(options: SSEHookOptions = {}): SSEHookReturn {
  const {
    channels: initialChannels = [],
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const { getAccessToken, authenticated } = usePrivy();

  // Connection state - initialized to match SSR
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Track subscriptions made by this hook instance for cleanup
  const subscriptionsRef = useRef<Map<Channel, Set<SSECallback>>>(new Map());
  const initialChannelCallbacksRef = useRef<Map<Channel, SSECallback>>(
    new Map()
  );

  // Get manager instance (singleton)
  const manager = useMemo(() => {
    const instance = SSEManager.getInstance({
      autoReconnect,
      reconnectDelay,
      maxReconnectAttempts,
    });
    return instance;
  }, [autoReconnect, reconnectDelay, maxReconnectAttempts]);

  // Set auth provider when it changes
  useEffect(() => {
    manager.setAuthProvider(getAccessToken);
  }, [manager, getAccessToken]);

  // Update auth state
  useEffect(() => {
    manager.setAuthenticated(authenticated);
  }, [manager, authenticated]);

  // Listen for connection state changes
  useEffect(() => {
    const unsubscribe = manager.addConnectionStateListener(
      (state, connectionError) => {
        setConnectionState(state);
        setError(connectionError);
      }
    );

    return unsubscribe;
  }, [manager]);

  // Listen for online/offline state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe function - tracks subscriptions for this hook instance
  const subscribe = useCallback(
    (channel: Channel, callback: SSECallback): (() => void) => {
      if (!channel) return () => {};

      // Track in local ref
      let hookSubs = subscriptionsRef.current.get(channel);
      if (!hookSubs) {
        hookSubs = new Set();
        subscriptionsRef.current.set(channel, hookSubs);
      }
      hookSubs.add(callback);

      // Subscribe via manager (returns unsubscribe function)
      const managerUnsubscribe = manager.subscribe(channel, callback);

      // Return combined unsubscribe
      return () => {
        const subs = subscriptionsRef.current.get(channel);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) {
            subscriptionsRef.current.delete(channel);
          }
        }
        managerUnsubscribe();
      };
    },
    [manager]
  );

  // Unsubscribe all callbacks for a channel from this hook instance
  const unsubscribe = useCallback(
    (channel: Channel) => {
      const hookSubs = subscriptionsRef.current.get(channel);
      if (!hookSubs) return;

      // Clear local tracking
      hookSubs.clear();
      subscriptionsRef.current.delete(channel);

      // Unsubscribe all from manager
      manager.unsubscribeAll(channel);
    },
    [manager]
  );

  // Reconnect function
  const reconnect = useCallback(() => {
    manager.reconnect();
  }, [manager]);

  // Handle initial channels - memoize based on string key for stable reference
  // This prevents re-subscriptions when array reference changes but contents are the same
  const memoizedInitialChannels = useMemo(
    () => initialChannels,
    [initialChannels]
  );

  useEffect(() => {
    if (memoizedInitialChannels.length === 0) return;

    // Subscribe to initial channels with no-op callbacks
    for (const channel of memoizedInitialChannels) {
      if (!initialChannelCallbacksRef.current.has(channel)) {
        const noopCallback: SSECallback = () => {};
        initialChannelCallbacksRef.current.set(channel, noopCallback);
        manager.subscribe(channel, noopCallback);
      }
    }

    return () => {
      // Cleanup initial channel subscriptions
      for (const [channel] of initialChannelCallbacksRef.current) {
        manager.unsubscribeAll(channel);
      }
      initialChannelCallbacksRef.current.clear();
    };
  }, [memoizedInitialChannels, manager]);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      // Unsubscribe all tracked subscriptions
      for (const [channel] of subscriptionsRef.current) {
        manager.unsubscribeAll(channel);
      }
      subscriptionsRef.current.clear();
    };
  }, [manager]);

  return {
    isConnected: connectionState === 'connected',
    error,
    connectionState,
    isOnline,
    subscribe,
    unsubscribe,
    reconnect,
  };
}

/**
 * Simplified hook for subscribing to a single SSE channel.
 *
 * Wrapper around useSSE that provides a simpler API for single-channel
 * subscriptions. Automatically handles subscription lifecycle and ensures
 * the callback always receives the latest version.
 *
 * @param channel - The channel name to subscribe to, or null to skip subscription
 * @param onMessage - Callback function called when messages are received.
 *
 * @returns An object with connection state information.
 *
 * @example
 * ```tsx
 * const { isConnected, isOnline } = useSSEChannel('markets', (data) => {
 *   console.log('Market update:', data);
 * });
 * ```
 */
export function useSSEChannel(
  channel: Channel | null,
  onMessage: (data: Record<string, unknown>) => void
) {
  const { isConnected, connectionState, isOnline, subscribe } = useSSE();

  // Keep callback ref stable
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!channel) return;

    const callback: SSECallback = (message) => {
      if (message.channel === channel) {
        onMessageRef.current(message.data);
      }
    };

    const unsubscribe = subscribe(channel, callback);
    return unsubscribe;
  }, [channel, subscribe]);

  return { isConnected, connectionState, isOnline };
}

/**
 * Hook to get current SSE connection status without subscribing to any channels.
 *
 * Useful for displaying connection indicators in the UI.
 *
 * @returns Connection state information.
 *
 * @example
 * ```tsx
 * const { isConnected, isOnline, connectionState } = useSSEStatus();
 *
 * return (
 *   <div>
 *     {!isOnline && <span>Offline</span>}
 *     {isOnline && !isConnected && <span>Connecting...</span>}
 *     {isConnected && <span>Connected</span>}
 *   </div>
 * );
 * ```
 */
export function useSSEStatus() {
  const { isConnected, connectionState, isOnline, error, reconnect } = useSSE();

  return {
    isConnected,
    connectionState,
    isOnline,
    error,
    reconnect,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { usePrivy } from '@privy-io/react-auth';

import { logger } from '@/lib/logger';

/**
 * SSE channel names for different event types.
 * 
 * Standard channels include:
 * - 'feed': General feed updates
 * - 'markets': Market price and trade updates
 * - 'breaking-news': Breaking news events
 * - 'upcoming-events': Upcoming event notifications
 * 
 * Custom channel names (strings) are also supported.
 */
export type Channel =
  | 'feed'
  | 'markets'
  | 'breaking-news'
  | 'upcoming-events'
  | string;

/**
 * Represents a message received via SSE.
 */
export interface SSEMessage {
  /** The channel this message was received on */
  channel: Channel;
  /** Message type identifier */
  type: string;
  /** Message payload data */
  data: Record<string, unknown>;
  /** Timestamp when the message was received */
  timestamp: number;
}

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
  /** Function to subscribe to a channel */
  subscribe: (
    channel: Channel,
    callback: (message: SSEMessage) => void
  ) => void;
  /** Function to unsubscribe from a channel */
  unsubscribe: (channel: Channel) => void;
  /** Function to manually trigger reconnection */
  reconnect: () => void;
}

type SSECallback = (message: SSEMessage) => void;
type ConnectionListener = (connected: boolean, error: string | null) => void;

const channelSubscribers = new Map<Channel, Set<SSECallback>>();
const requestedChannels = new Set<Channel>();
let connectedChannels = new Set<Channel>();
let globalEventSource: EventSource | null = null;
let connecting = false;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let lastConnectionError: string | null = null;
let pendingTokenRetry: ReturnType<typeof setTimeout> | null = null;
const connectionListeners = new Set<ConnectionListener>();
let getAccessTokenRef: (() => Promise<string | null>) | null = null;
let authenticatedRef = false;
let autoReconnectRef = true;
let reconnectDelayRef = 3000;
let maxReconnectAttemptsRef = 5;

const hasBrowserEnv = () =>
  typeof window !== 'undefined' && typeof EventSource !== 'undefined';

const notifyConnectionStatus = (connected: boolean, error: string | null) => {
  lastConnectionError = error;
  connectionListeners.forEach((listener) => {
    listener(connected, error);
  });
};

const closeEventSource = () => {
  if (pendingTokenRetry) {
    clearTimeout(pendingTokenRetry);
    pendingTokenRetry = null;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (globalEventSource) {
    try {
      // Remove all event listeners to prevent callbacks after close
      globalEventSource.onopen = null;
      globalEventSource.onerror = null;
      globalEventSource.close();
    } catch (error) {
      logger.debug('Error closing EventSource', { error }, 'useSSE');
    }
    globalEventSource = null;
  }

  connectedChannels.clear();
  connecting = false;
};

const scheduleTokenRetry = () => {
  if (pendingTokenRetry || !authenticatedRef) {
    return;
  }

  const delay = Math.min(reconnectDelayRef, 1000);
  pendingTokenRetry = setTimeout(() => {
    pendingTokenRetry = null;
    void ensureConnection();
  }, delay);
};

const channelsInSync = () => {
  if (!globalEventSource || globalEventSource.readyState !== EventSource.OPEN) {
    return false;
  }

  if (connectedChannels.size !== requestedChannels.size) {
    return false;
  }

  for (const channel of requestedChannels) {
    if (!connectedChannels.has(channel)) {
      return false;
    }
  }

  return true;
};

async function ensureConnection(forceReconnect = false) {
  if (!hasBrowserEnv()) return;
  if (!authenticatedRef) return;
  if (requestedChannels.size === 0) {
    closeEventSource();
    notifyConnectionStatus(false, null);
    return;
  }

  if (!forceReconnect && channelsInSync()) {
    notifyConnectionStatus(true, null);
    return;
  }

  // Prevent duplicate connection attempts
  if (connecting) {
    logger.debug('SSE connection already in progress, skipping', undefined, 'useSSE');
    return;
  }

  // If there's already a connection and we're not forcing reconnect, check if it's valid
  if (!forceReconnect && globalEventSource && globalEventSource.readyState === EventSource.OPEN) {
    logger.debug('SSE already connected, skipping', undefined, 'useSSE');
    return;
  }

  const getToken = getAccessTokenRef;
  if (!getToken) {
    notifyConnectionStatus(false, 'Missing access token for SSE');
    return;
  }

  connecting = true;
  closeEventSource();

  const token = await getToken().catch((error) => {
    logger.warn('SSE: failed to obtain access token', { error }, 'useSSE');
    return null;
  });

  if (!token) {
    connecting = false;
    notifyConnectionStatus(false, 'Missing access token for SSE');
    scheduleTokenRetry();
    return;
  }

  const channelsList = Array.from(requestedChannels);
  const url = `${window.location.origin}/api/sse/events?channels=${encodeURIComponent(channelsList.join(','))}&token=${encodeURIComponent(token)}`;

  logger.debug(
    'Connecting to SSE endpoint...',
    { channels: channelsList.join(',') },
    'useSSE'
  );

  const eventSource = new EventSource(url);
  let errorHandled = false;

  eventSource.onopen = () => {
    // Reset error flag on successful open
    errorHandled = false;
    connecting = false;
    globalEventSource = eventSource;
    connectedChannels = new Set(requestedChannels);
    reconnectAttempts = 0;
    notifyConnectionStatus(true, null);
    logger.info('SSE connected', { channels: channelsList }, 'useSSE');
  };

  // Handle the 'connected' event from server
  eventSource.addEventListener('connected', (event) => {
    try {
      const data = JSON.parse(event.data);
      logger.debug('SSE connected event received', { clientId: data.clientId, channels: data.channels }, 'useSSE');
      // Connection is confirmed, update state
      connecting = false;
      reconnectAttempts = 0;
      notifyConnectionStatus(true, null);
    } catch (error) {
      logger.error('Failed to parse connected event', { error, data: event.data }, 'useSSE');
    }
  });

  eventSource.addEventListener('message', (event) => {
    try {
      const message: SSEMessage = JSON.parse(event.data);
      const subs = channelSubscribers.get(message.channel);
      if (subs && subs.size > 0) {
        subs.forEach((callback) => {
          callback(message);
        });
      }
    } catch (error) {
      logger.error('Failed to parse SSE message', { error, data: event.data }, 'useSSE');
    }
  });

  eventSource.onerror = () => {
    // Prevent duplicate error handling
    if (errorHandled) {
      return;
    }

    // Only handle error if connection is actually closed or failed
    if (eventSource.readyState === EventSource.CLOSED) {
      errorHandled = true;
      connecting = false;
      
      // Close immediately to prevent EventSource auto-reconnect
      if (globalEventSource === eventSource) {
        globalEventSource = null;
      }
      eventSource.close();

      notifyConnectionStatus(false, 'SSE connection error');
      logger.warn(
        'SSE connection lost, scheduling reconnect',
        { reconnectAttempts, maxAttempts: maxReconnectAttemptsRef },
        'useSSE'
      );

      if (!autoReconnectRef) {
        return;
      }

      if (reconnectAttempts >= maxReconnectAttemptsRef) {
        notifyConnectionStatus(
          false,
          'Unable to connect to real-time updates. Please refresh the page.'
        );
        logger.error(
          'SSE: Max reconnection attempts reached',
          undefined,
          'useSSE'
        );
        return;
      }

      // Cancel any existing reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      const baseDelay = reconnectDelayRef * Math.pow(2, reconnectAttempts);
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.min(baseDelay + jitter, 30000);

      reconnectAttempts += 1;
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        void ensureConnection();
      }, delay);
    } else if (eventSource.readyState === EventSource.CONNECTING) {
      // Connection is still trying, don't handle as error yet
      logger.debug('SSE connection in progress...', undefined, 'useSSE');
    }
  };

  globalEventSource = eventSource;
}

/**
 * Main hook for Server-Sent Events (SSE) connection management.
 * 
 * Replaces WebSocket for real-time updates, providing better compatibility
 * with Vercel's serverless architecture. Manages a single global SSE
 * connection shared across all hook instances, with automatic channel
 * subscription and reconnection handling.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Shared connection across components (efficient)
 * - Channel-based subscription model
 * - Authentication token management
 * - Connection state tracking
 * 
 * @param options - Configuration options for connection behavior
 * 
 * @returns SSE connection state and subscription management functions.
 * 
 * @example
 * ```tsx
 * const { isConnected, subscribe, unsubscribe } = useSSE();
 * 
 * useEffect(() => {
 *   const handleMessage = (msg) => {
 *     console.log('Received:', msg);
 *   };
 *   
 *   subscribe('markets', handleMessage);
 *   return () => unsubscribe('markets');
 * }, []);
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
  const [isConnected, setIsConnected] = useState(() =>
    Boolean(
      globalEventSource && globalEventSource.readyState === EventSource.OPEN
    )
  );
  const [error, setError] = useState<string | null>(lastConnectionError);

  const subscriptionsRef = useRef<
    Map<Channel, Set<(message: SSEMessage) => void>>
  >(new Map());

  useEffect(() => {
    getAccessTokenRef = getAccessToken;
    autoReconnectRef = autoReconnect;
    reconnectDelayRef = reconnectDelay;
    maxReconnectAttemptsRef = maxReconnectAttempts;
  }, [getAccessToken, autoReconnect, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    authenticatedRef = authenticated;
    if (!authenticated) {
      closeEventSource();
      notifyConnectionStatus(false, null);
      return;
    }

    if (requestedChannels.size > 0) {
      void ensureConnection();
    }
  }, [authenticated]);

  useEffect(() => {
    const listener: ConnectionListener = (connectedState, connectionError) => {
      setIsConnected(connectedState);
      setError(connectionError);
    };

    connectionListeners.add(listener);

    return () => {
      connectionListeners.delete(listener);
    };
  }, []);

  const subscribe = useCallback(
    (channel: Channel, callback: (message: SSEMessage) => void) => {
      if (!channel) return;

      if (!subscriptionsRef.current.has(channel)) {
        subscriptionsRef.current.set(channel, new Set());
      }
      const refSubs = subscriptionsRef.current.get(channel);
      if (refSubs) {
        refSubs.add(callback);
      }

      if (!channelSubscribers.has(channel)) {
        channelSubscribers.set(channel, new Set());
      }
      const globalSubs = channelSubscribers.get(channel);
      if (globalSubs) {
        globalSubs.add(callback);
      }

      const previousSize = requestedChannels.size;
      requestedChannels.add(channel);

      logger.debug(`Subscribed to channel: ${channel}`, { channel }, 'useSSE');

      if (!globalEventSource || previousSize !== requestedChannels.size) {
        void ensureConnection();
      } else if (!connectedChannels.has(channel)) {
        void ensureConnection(true);
      }
    },
    []
  );

  const unsubscribe = useCallback((channel: Channel) => {
    const hookSubscribers = subscriptionsRef.current.get(channel);
    if (!hookSubscribers) return;

    const globalSubscribers = channelSubscribers.get(channel);
    if (globalSubscribers) {
      hookSubscribers.forEach((callback) => {
        globalSubscribers.delete(callback);
      });

      if (globalSubscribers.size === 0) {
        channelSubscribers.delete(channel);
        requestedChannels.delete(channel);
      }
    }

    hookSubscribers.clear();
    subscriptionsRef.current.delete(channel);

    logger.debug(
      `Unsubscribed from channel: ${channel}`,
      { channel },
      'useSSE'
    );

    if (requestedChannels.size === 0) {
      closeEventSource();
      notifyConnectionStatus(false, null);
    } else if (!channelsInSync()) {
      void ensureConnection(true);
    }
  }, []);

  useEffect(() => {
    // Subscribe to initial channels provided in options
    if (initialChannels.length > 0) {
      initialChannels.forEach(channel => subscribe(channel, () => {}));
      return () => {
        initialChannels.forEach(channel => unsubscribe(channel));
      };
    }
    return undefined;
  }, [initialChannels, subscribe, unsubscribe]);

  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach((_, channel) => {
        unsubscribe(channel);
      });
      subscriptionsRef.current.clear();
    };
  }, [unsubscribe]);

  const reconnect = useCallback(() => {
    reconnectAttempts = 0;
    closeEventSource();
    void ensureConnection(true);
  }, []);

  return {
    isConnected,
    error,
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
 * @param channel - The channel name to subscribe to, or null to unsubscribe
 * @param onMessage - Callback function called when messages are received.
 * Receives the message data as a record of key-value pairs.
 * 
 * @returns An object with `isConnected` boolean indicating connection status.
 * 
 * @example
 * ```tsx
 * const { isConnected } = useSSEChannel('markets', (data) => {
 *   console.log('Market update:', data);
 * });
 * ```
 */
export function useSSEChannel(
  channel: Channel | null,
  onMessage: (data: Record<string, unknown>) => void
) {
  const { isConnected, subscribe, unsubscribe } = useSSE({
    channels: channel ? [channel] : [],
  });

  const onMessageRef = useRef(onMessage);
  const callbackRef = useRef<((message: SSEMessage) => void) | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!channel) return;

    const callback = (message: SSEMessage) => {
      if (message.channel === channel) {
        onMessageRef.current(message.data);
      }
    };

    callbackRef.current = callback;
    subscribe(channel, callback);

    return () => {
      if (callbackRef.current) {
        unsubscribe(channel);
        callbackRef.current = null;
      }
    };
  }, [channel, subscribe, unsubscribe]); // Only re-subscribe when channel changes

  return { isConnected };
}

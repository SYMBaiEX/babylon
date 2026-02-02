/**
 * Session Heartbeat Hook
 *
 * Sends periodic heartbeat pings to track user sessions for engagement metrics.
 * Creates/manages a session ID in sessionStorage and pings the heartbeat
 * endpoint every 5 minutes while the user is active.
 *
 * Features:
 * - Creates unique session ID per browser tab
 * - Sends heartbeat every 5 minutes
 * - Tracks page views between heartbeats
 * - Pauses when tab is hidden (Page Visibility API)
 * - Resumes and sends heartbeat when tab becomes visible
 * - Uses keepalive for reliable delivery during navigation
 *
 * @module useSessionHeartbeat
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_STORAGE_KEY = 'bab_session_id';

/**
 * Generates a UUID v4 for session identification
 */
function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets or creates a session ID from sessionStorage
 */
function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return generateSessionId();
  }

  let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Hook to track user sessions via periodic heartbeat
 *
 * Only runs when user is authenticated. Automatically handles
 * visibility changes and cleanup on unmount.
 *
 * @example
 * ```tsx
 * // In your app layout or provider
 * function AppProviders({ children }) {
 *   useSessionHeartbeat();
 *   return <>{children}</>;
 * }
 * ```
 */
export function useSessionHeartbeat(): void {
  const { authenticated, ready, user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const pageViewsRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    // Only run for authenticated users
    if (!ready || !authenticated || !user) {
      return;
    }

    // Get or create session ID
    if (!sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId();
    }

    const sessionId = sessionIdRef.current;

    /**
     * Send heartbeat to server
     */
    const sendHeartbeat = (): void => {
      if (!sessionId) return;

      const pageViews = pageViewsRef.current;
      pageViewsRef.current = 0; // Reset counter

      // Use fetch with keepalive for reliable delivery during navigation
      fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          pageViews,
          lastPath:
            typeof window !== 'undefined' ? window.location.pathname : '',
        }),
        keepalive: true,
      }).catch(() => {
        // Silently ignore errors - heartbeat is non-critical
      });
    };

    /**
     * Handle visibility change
     */
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        isVisibleRef.current = true;
        // Send heartbeat when coming back to tab
        sendHeartbeat();
      } else {
        isVisibleRef.current = false;
      }
    };

    /**
     * Track page views (navigation within SPA)
     */
    const handlePageView = (): void => {
      pageViewsRef.current += 1;
    };

    // Initial heartbeat on mount
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(() => {
      // Only send if tab is visible
      if (isVisibleRef.current) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track navigation (for SPAs using History API)
    window.addEventListener('popstate', handlePageView);

    // Track initial page view
    pageViewsRef.current = 1;

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePageView);
    };
  }, [authenticated, ready, user]);
}

/**
 * Provider component that enables session heartbeat globally
 *
 * Add this near the top of your component tree for authenticated routes.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <SessionHeartbeatProvider>
 *   {children}
 * </SessionHeartbeatProvider>
 * ```
 */
export function SessionHeartbeatProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  useSessionHeartbeat();
  return children;
}

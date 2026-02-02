/**
 * Session Heartbeat Hook
 *
 * Tracks user sessions via periodic heartbeats for engagement metrics.
 * Heartbeats are sent every 5 minutes while the tab is visible.
 *
 * @module useSessionHeartbeat
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_KEY = 'bab_session_id';

/** Generates a UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Gets or creates a session ID from sessionStorage */
function getSessionId(): string {
  if (typeof window === 'undefined') return generateUUID();
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Tracks user sessions via periodic heartbeat. Only active for authenticated users.
 */
export function useSessionHeartbeat(): void {
  const { authenticated, ready, user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const pageViewsRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;

    if (!sessionIdRef.current) {
      sessionIdRef.current = getSessionId();
    }
    const sessionId = sessionIdRef.current;

    const sendHeartbeat = (): void => {
      const pageViews = pageViewsRef.current;
      pageViewsRef.current = 0;

      fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          pageViews,
          lastPath:
            typeof window !== 'undefined' ? window.location.pathname : '',
        }),
        keepalive: true,
      }).catch(() => {});
    };

    const onVisibilityChange = (): void => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) sendHeartbeat();
    };

    const onNavigation = (): void => {
      pageViewsRef.current += 1;
    };

    // Initial heartbeat
    sendHeartbeat();

    // Periodic heartbeat (only when visible)
    intervalRef.current = setInterval(() => {
      if (isVisibleRef.current) sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('popstate', onNavigation);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('popstate', onNavigation);
    };
  }, [authenticated, ready, user]);
}

/** Provider that enables session heartbeat for its subtree */
export function SessionHeartbeatProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  useSessionHeartbeat();
  return children;
}

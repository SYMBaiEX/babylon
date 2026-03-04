import type { NarrativeStory } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSSEChannel } from '@/hooks/useSSE';

interface UseNarrativeFeedOptions {
  enabled?: boolean;
}

interface UseNarrativeFeedResult {
  stories: NarrativeStory[];
  /** True once the first fetch attempt (success or error) has completed. */
  ready: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Fallback polling interval — SSE `feed` channel events trigger immediate
// refreshes, so this only fires when the SSE connection is down.
const FALLBACK_INTERVAL_MS = 300_000; // 5 minutes

// Debounce SSE-triggered refreshes so a burst of new posts resolves once.
const SSE_DEBOUNCE_MS = 2_000;

/**
 * Hook for fetching the narrative feed — story-grouped posts ranked by
 * engagement, recency, arc state, and resolution proximity.
 *
 * Refresh strategy (in priority order):
 * 1. SSE `feed` channel event → debounced 2 s refresh (real-time)
 * 2. Pull-to-refresh via `refresh()` (user-initiated)
 * 3. 5-minute fallback interval (SSE down / unauthenticated)
 *
 * Error handling:
 * - Initial fetch failure: sets `error`, shows error screen with retry.
 * - Background refresh failure when live stories are visible: logs only —
 *   does NOT replace content the user is reading with an error screen.
 *
 * Race condition prevention:
 * - `refresh()` cancels any in-flight interval request before starting.
 * - `isManualRefreshRef` prevents the interval from spawning a concurrent
 *   fetch while a manual refresh is already in-flight.
 */
export function useNarrativeFeed(
  options: UseNarrativeFeedOptions = {}
): UseNarrativeFeedResult {
  const { enabled = true } = options;
  const [stories, setStories] = useState<NarrativeStory[]>([]);
  // `ready` starts false; becomes true after first fetch attempt completes.
  // FeedClient uses this to show the loading skeleton rather than an empty
  // state on the first tab switch (before any data has been fetched).
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFetched = useRef(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const intervalControllerRef = useRef<AbortController | null>(null);
  // Prevents the auto-refresh interval from starting a new request while a
  // manual refresh is in-flight, eliminating the last-write-wins stale race.
  const isManualRefreshRef = useRef(false);
  // Tracks current stories so fetchStories can decide whether background
  // failures should surface as blocking errors (when empty) or just log.
  const storiesRef = useRef<NarrativeStory[]>([]);
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStories = useCallback(
    async (isInitial: boolean, signal?: AbortSignal) => {
      if (isInitial) setLoading(true);

      try {
        const response = await fetch('/api/feed/narrative', { signal });

        if (signal?.aborted) return;

        if (response.ok) {
          let data: { stories?: NarrativeStory[] };
          try {
            data = (await response.json()) as { stories?: NarrativeStory[] };
          } catch {
            // JSON parse failure on an apparently-OK response (e.g. CDN HTML on 200)
            const msg = 'Failed to parse narrative feed response';
            logger.error(msg, {}, 'useNarrativeFeed');
            if (isInitial || storiesRef.current.length === 0) {
              setError(msg);
            }
            return;
          }

          // Guard against unexpected API contract changes where the key is absent
          if (!Array.isArray(data.stories)) {
            const msg = 'Narrative feed response missing stories array';
            logger.error(msg, { keys: Object.keys(data) }, 'useNarrativeFeed');
            if (isInitial || storiesRef.current.length === 0) {
              setError(msg);
            }
            return;
          }

          setStories(data.stories);
          storiesRef.current = data.stories;
          setError(null);
        } else {
          const errorText = await response.text().catch(() => null);
          const msg = `Failed to fetch narrative feed: ${response.status}`;
          logger.error(
            msg,
            { status: response.status, errorText },
            'useNarrativeFeed'
          );
          // Background refresh: preserve live content — only surface the error
          // as a blocking screen when there's nothing else to show.
          if (isInitial || storiesRef.current.length === 0) {
            setError(msg);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = 'Network error while fetching narrative feed';
        logger.error(msg, { error: err }, 'useNarrativeFeed');
        if (isInitial || storiesRef.current.length === 0) {
          setError(msg);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setReady(true);
        }
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    isManualRefreshRef.current = true;
    refreshControllerRef.current?.abort();
    // Cancel in-flight interval fetch to prevent stale-response race
    intervalControllerRef.current?.abort();
    intervalControllerRef.current = null;
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    try {
      await fetchStories(storiesRef.current.length === 0, controller.signal);
    } finally {
      isManualRefreshRef.current = false;
    }
  }, [fetchStories]);

  // SSE subscription — new posts on the `feed` channel invalidate the
  // narrative cache server-side (see posts/route.ts); debounce the client
  // refresh to coalesce rapid-fire posts into a single fetch.
  useSSEChannel(
    enabled ? 'feed' : null,
    useCallback(() => {
      if (!isMountedRef.current) return;
      if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
      sseDebounceRef.current = setTimeout(() => {
        if (isMountedRef.current) void refresh();
      }, SSE_DEBOUNCE_MS);
    }, [refresh])
  );

  // Initial fetch when enabled
  useEffect(() => {
    if (!enabled) {
      hasFetched.current = false;
      setReady(false);
      setLoading(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      refreshControllerRef.current?.abort();
      refreshControllerRef.current = null;
      intervalControllerRef.current?.abort();
      intervalControllerRef.current = null;
      if (sseDebounceRef.current) {
        clearTimeout(sseDebounceRef.current);
        sseDebounceRef.current = null;
      }
      return;
    }
    // Reset mount flag for SSE callbacks (cleanup sets this false)
    isMountedRef.current = true;

    if (hasFetched.current) return;
    hasFetched.current = true;

    // Set loading synchronously to prevent the EmptyFeed flash that would
    // occur if we waited for fetchStories to call setLoading inside its body.
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchStories(true, controller.signal);

    return () => {
      // Reset so Strict Mode double-invoke and tab re-enable re-fetch correctly
      hasFetched.current = false;
      isMountedRef.current = false;
      controller.abort();
      refreshControllerRef.current?.abort();
      if (isManualRefreshRef.current) isManualRefreshRef.current = false;
      if (sseDebounceRef.current) {
        clearTimeout(sseDebounceRef.current);
        sseDebounceRef.current = null;
      }
    };
  }, [enabled, fetchStories]);

  // Fallback polling — fires only when SSE is unavailable or not connected.
  // Skips tick when a manual refresh is already in-flight.
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      // Skip interval tick when a manual refresh is running to prevent the
      // concurrent-fetch race where the slower response overwrites fresh data.
      if (isManualRefreshRef.current) return;

      intervalControllerRef.current?.abort();
      const controller = new AbortController();
      intervalControllerRef.current = controller;
      void fetchStories(false, controller.signal);
    }, FALLBACK_INTERVAL_MS);

    return () => {
      clearInterval(id);
      intervalControllerRef.current?.abort();
      intervalControllerRef.current = null;
    };
  }, [enabled, fetchStories]);

  return { stories, ready, loading, error, refresh };
}

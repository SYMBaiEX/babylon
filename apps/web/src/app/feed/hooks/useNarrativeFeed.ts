import { logger } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NarrativeStory } from '@/app/feed/types/narrative';

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

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Hook for fetching the narrative feed — story-grouped posts ranked by
 * engagement, recency, arc state, and resolution proximity.
 *
 * Error handling:
 * - Initial fetch failure: sets `error`, shows error screen with retry.
 * - Background refresh failure (60s interval or pull-to-refresh) when live
 *   stories are already visible: logs only — does NOT replace the content
 *   the user is reading with an error screen. The user sees a non-blocking
 *   warning; the next successful refresh will update the view.
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const intervalControllerRef = useRef<AbortController | null>(null);
  // Prevents the auto-refresh interval from starting a new request while a
  // manual refresh is in-flight, eliminating the last-write-wins stale race.
  const isManualRefreshRef = useRef(false);
  // Tracks current stories so fetchStories can decide whether background
  // failures should surface as blocking errors (when empty) or just log.
  const storiesRef = useRef<NarrativeStory[]>([]);

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
      return;
    }
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
      controller.abort();
      refreshControllerRef.current?.abort();
      if (isManualRefreshRef.current) isManualRefreshRef.current = false;
    };
  }, [enabled, fetchStories]);

  // Auto-refresh interval — skips if a manual refresh is already in-flight
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
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(id);
      intervalControllerRef.current?.abort();
      intervalControllerRef.current = null;
    };
  }, [enabled, fetchStories]);

  return { stories, ready, loading, error, refresh };
}

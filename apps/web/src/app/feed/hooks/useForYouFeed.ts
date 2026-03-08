import type { NarrativeStory } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSSEChannel } from '@/hooks/useSSE';

interface UseForYouFeedOptions {
  enabled?: boolean;
}

interface UseForYouFeedResult {
  stories: NarrativeStory[];
  ready: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const FALLBACK_INTERVAL_MS = 300_000;
const SSE_DEBOUNCE_MS = 2_000;

export function useForYouFeed(
  options: UseForYouFeedOptions = {}
): UseForYouFeedResult {
  const { enabled = true } = options;
  const { authenticated, getAccessToken } = useAuth();
  const [stories, setStories] = useState<NarrativeStory[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFetched = useRef(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const intervalControllerRef = useRef<AbortController | null>(null);
  const isManualRefreshRef = useRef(false);
  const storiesRef = useRef<NarrativeStory[]>([]);
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStories = useCallback(
    async (isInitial: boolean, signal?: AbortSignal) => {
      if (isInitial) setLoading(true);

      try {
        const token = authenticated ? await getAccessToken() : null;
        const headers: HeadersInit = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch('/api/feed/for-you', {
          signal,
          headers,
        });

        if (signal?.aborted) return;

        if (response.ok) {
          let data: { stories?: NarrativeStory[] };
          try {
            data = (await response.json()) as { stories?: NarrativeStory[] };
          } catch {
            const msg = 'Failed to parse For You feed response';
            logger.error(msg, {}, 'useForYouFeed');
            if (isInitial || storiesRef.current.length === 0) {
              setError(msg);
            }
            return;
          }

          if (!Array.isArray(data.stories)) {
            const msg = 'For You feed response missing stories array';
            logger.error(msg, { keys: Object.keys(data) }, 'useForYouFeed');
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
          const msg = `Failed to fetch For You feed: ${response.status}`;
          logger.error(
            msg,
            { status: response.status, errorText },
            'useForYouFeed'
          );
          if (isInitial || storiesRef.current.length === 0) {
            setError(msg);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = 'Network error while fetching For You feed';
        logger.error(msg, { error: err }, 'useForYouFeed');
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
    [authenticated, getAccessToken]
  );

  const refresh = useCallback(async () => {
    isManualRefreshRef.current = true;
    refreshControllerRef.current?.abort();
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

    isMountedRef.current = true;

    if (hasFetched.current) return;
    hasFetched.current = true;

    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchStories(true, controller.signal);

    return () => {
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

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
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

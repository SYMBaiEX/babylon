import { logger } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NarrativeStory } from '@/app/feed/types/narrative';

interface UseNarrativeFeedOptions {
  enabled?: boolean;
}

interface UseNarrativeFeedResult {
  stories: NarrativeStory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Hook for fetching the narrative feed — story-grouped posts ranked by
 * engagement, recency, arc state, and resolution proximity.
 * Auto-refreshes every 60 seconds when enabled.
 */
export function useNarrativeFeed(
  options: UseNarrativeFeedOptions = {}
): UseNarrativeFeedResult {
  const { enabled = true } = options;
  const [stories, setStories] = useState<NarrativeStory[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const intervalControllerRef = useRef<AbortController | null>(null);

  const fetchStories = useCallback(
    async (showLoading = true, signal?: AbortSignal) => {
      if (showLoading) setLoading(true);

      try {
        const response = await fetch('/api/feed/narrative', { signal });

        if (signal?.aborted) return;

        if (response.ok) {
          const data = (await response.json()) as {
            stories?: NarrativeStory[];
          };
          setStories(data.stories ?? []);
          setError(null);
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          logger.error(
            'Failed to fetch narrative feed',
            { status: response.status, errorText },
            'useNarrativeFeed'
          );
          setError(`Failed to fetch narrative feed: ${response.status}`);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error(
          'Error fetching narrative feed',
          { error: err },
          'useNarrativeFeed'
        );
        setError('Network error while fetching narrative feed');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  const refresh = useCallback(() => {
    refreshControllerRef.current?.abort();
    // Also cancel any in-flight interval request to prevent stale data race
    intervalControllerRef.current?.abort();
    intervalControllerRef.current = null;
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    return fetchStories(false, controller.signal);
  }, [fetchStories]);

  // Initial fetch when enabled
  useEffect(() => {
    if (!enabled) {
      hasFetched.current = false;
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchStories(true, controller.signal);

    return () => {
      // Reset so Strict Mode double-invoke and re-enables re-fetch correctly
      hasFetched.current = false;
      controller.abort();
      refreshControllerRef.current?.abort();
    };
  }, [enabled, fetchStories]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
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

  return { stories, loading, error, refresh };
}

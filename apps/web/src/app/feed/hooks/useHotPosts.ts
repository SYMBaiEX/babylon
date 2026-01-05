import type { FeedPost } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseHotPostsOptions {
  enabled?: boolean;
}

interface UseHotPostsResult {
  posts: FeedPost[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Hook for fetching hot/trending posts ranked by engagement score.
 * Auto-refreshes every 60 seconds when enabled.
 */
export function useHotPosts(
  options: UseHotPostsOptions = {}
): UseHotPostsResult {
  const { enabled = true } = options;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(enabled);
  const hasFetched = useRef(false);

  const fetchPosts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    const response = await fetch('/api/feed/hot?limit=50');
    if (response.ok) {
      const data = await response.json();
      setPosts((data.posts ?? []) as FeedPost[]);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(() => fetchPosts(false), [fetchPosts]);

  // Initial fetch when enabled
  useEffect(() => {
    if (!enabled) {
      hasFetched.current = false;
      setLoading(false);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchPosts();
  }, [enabled, fetchPosts]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => void fetchPosts(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchPosts]);

  return { posts, loading, refresh };
}

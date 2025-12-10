import type { FeedPost } from '@babylon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSSEChannel } from '@/hooks/useSSE';

const PAGE_SIZE = 20;

interface UseFeedPostsOptions {
  enabled?: boolean;
}

interface UseFeedPostsResult {
  posts: FeedPost[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  cursor: string | null;
  fetchPosts: (cursor: string | null, append?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  addOptimisticPost: (post: FeedPost) => void;
}

/**
 * Hook for fetching and managing the latest posts feed
 *
 * Features:
 * - Cursor-based pagination (better for real-time feeds)
 * - SSE real-time updates
 * - Optimistic post support
 * - Race condition prevention
 */
export function useFeedPosts(
  options: UseFeedPostsOptions = {}
): UseFeedPostsResult {
  const { enabled = true } = options;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [localPosts, setLocalPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  // Prevent race conditions and duplicate fetches
  const loadingMoreRef = useRef(false);
  const initialFetchDone = useRef(false);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const fetchPosts = useCallback(
    async (
      requestCursor: string | null,
      append = false,
      skipLoadingState = false,
      forceNoStore = false
    ) => {
      if (append && loadingMoreRef.current) return;

      if (append) {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      } else if (!skipLoadingState) {
        setLoading(true);
      }

      // Helper to reset loading state
      const stopLoading = () => {
        if (append) {
          setLoadingMore(false);
          loadingMoreRef.current = false;
        } else if (!skipLoadingState) {
          setLoading(false);
        }
      };

      const url = requestCursor
        ? `/api/posts?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(requestCursor)}`
        : `/api/posts?limit=${PAGE_SIZE}`;

      let response: Response;
      try {
        response = await fetch(url, {
          cache: forceNoStore ? 'no-store' : undefined,
        });
      } catch {
        stopLoading();
        return;
      }

      if (!response.ok) {
        if (append) setHasMore(false);
        stopLoading();
        return;
      }

      const data = await response.json();
      const newPosts = data.posts as FeedPost[];
      const nextCursor = data.cursor as string | null;
      const hasMoreFromAPI = data.hasMore as boolean;

      setPosts((prev) => {
        const combined = append ? [...prev, ...newPosts] : newPosts;
        const unique = new Map<string, FeedPost>();
        combined.forEach((post) => unique.set(post.id, post));
        return Array.from(unique.values()).sort((a, b) => {
          const aTime = new Date(a.timestamp ?? 0).getTime();
          const bTime = new Date(b.timestamp ?? 0).getTime();
          return bTime - aTime;
        });
      });

      setCursor(nextCursor);

      // Clean up local posts that are now in API response
      if (!append) {
        setLocalPosts((prev) => {
          const newPostIds = new Set(newPosts.map((p) => p.id));
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          return prev.filter((localPost) => {
            if (newPostIds.has(localPost.id)) return false;
            const postTime = new Date(localPost.timestamp).getTime();
            return postTime >= fiveMinutesAgo;
          });
        });
      }

      setHasMore(hasMoreFromAPI && newPosts.length > 0);
      stopLoading();
    },
    []
  );

  const refresh = useCallback(async () => {
    await fetchPosts(null, false, true, true);
  }, [fetchPosts]);

  const addOptimisticPost = useCallback((post: FeedPost) => {
    setLocalPosts((prev) => [post, ...prev]);
  }, []);

  // Initial fetch - only run once when enabled
  useEffect(() => {
    if (enabled && !initialFetchDone.current) {
      initialFetchDone.current = true;
      setLoading(true);
      setCursor(null);
      setHasMore(true);
      fetchPosts(null, false);
    }
  }, [enabled, fetchPosts]);

  // Reset when disabled then re-enabled
  useEffect(() => {
    if (!enabled) {
      initialFetchDone.current = false;
    }
  }, [enabled]);

  // SSE real-time updates
  useSSEChannel('feed', () => {
    if (enabled) {
      void fetchPosts(null, false, true, true);
    }
  });

  // Combine local and API posts
  const combinedPosts = (() => {
    const postMap = new Map<string, FeedPost>();
    localPosts.forEach((post) => postMap.set(post.id, post));
    posts.forEach((post) => {
      if (!postMap.has(post.id)) postMap.set(post.id, post);
    });
    return Array.from(postMap.values()).sort((a, b) => {
      const aTime = new Date(a.timestamp ?? 0).getTime();
      const bTime = new Date(b.timestamp ?? 0).getTime();
      return bTime - aTime;
    });
  })();

  return {
    posts: combinedPosts,
    loading,
    loadingMore,
    hasMore,
    cursor,
    fetchPosts,
    refresh,
    addOptimisticPost,
  };
}

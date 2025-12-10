import type { FeedPost } from '@babylon/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

const PAGE_SIZE = 20;

interface UseFollowingPostsOptions {
  enabled?: boolean;
}

interface UseFollowingPostsResult {
  posts: FeedPost[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching posts from followed users/actors
 *
 * Requires authentication - returns empty if not logged in
 */
export function useFollowingPosts(
  options: UseFollowingPostsOptions = {}
): UseFollowingPostsResult {
  const { enabled = true } = options;

  const { authenticated, getAccessToken } = useAuth();
  const { user } = useAuthStore();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFollowingPosts = useCallback(async () => {
    if (!enabled || !authenticated || !user) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const token = await getAccessToken();

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(
      `/api/posts?following=true&userId=${user.id}&limit=${PAGE_SIZE}&offset=0`,
      { headers }
    );

    if (!response.ok) {
      setLoading(false);
      return;
    }

    const data = await response.json();
    setPosts(data.posts as FeedPost[]);
    setLoading(false);
  }, [enabled, authenticated, user, getAccessToken]);

  const refresh = useCallback(async () => {
    await fetchFollowingPosts();
  }, [fetchFollowingPosts]);

  useEffect(() => {
    if (enabled) {
      fetchFollowingPosts();
    }
  }, [enabled, fetchFollowingPosts]);

  return {
    posts,
    loading,
    refresh,
  };
}


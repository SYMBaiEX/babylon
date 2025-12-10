'use client';

import { useCallback, useEffect, useState } from 'react';
import { PostCard } from '@/components/posts/PostCard';
import { PageContainer } from '@/components/shared/PageContainer';
import { FeedSkeleton } from '@/components/shared/Skeleton';

interface PostData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorUsername?: string | null;
  authorProfileImageUrl?: string | null;
  timestamp: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  isLiked?: boolean;
  isShared?: boolean;
}

const PAGE_SIZE = 20;

/**
 * FeedClient - Main feed page client component
 *
 * Displays the main post feed with pagination, auto-polling,
 * and real-time updates via SSE.
 */
export function FeedClient() {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = useCallback(
    async (requestOffset: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const response = await fetch(
        `/api/posts?limit=${PAGE_SIZE}&offset=${requestOffset}`
      );

      if (!response.ok) {
        if (append) setHasMore(false);
        if (append) setLoadingMore(false);
        else setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        const newPosts = data.posts || [];

        setPosts((prev) => {
          const combined = append ? [...prev, ...newPosts] : newPosts;
          const unique = new Map<string, PostData>();
          combined.forEach((post: PostData) => {
            if (post?.id) {
              unique.set(post.id, post);
            }
          });

          const deduped = Array.from(unique.values()).sort((a, b) => {
            const aTime = new Date(a.timestamp ?? 0).getTime();
            const bTime = new Date(b.timestamp ?? 0).getTime();
            return bTime - aTime;
          });

          return deduped;
        });

        setOffset(requestOffset + newPosts.length);
        setHasMore(newPosts.length === PAGE_SIZE);
      }

      if (append) setLoadingMore(false);
      else setLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchPosts(0, false);
  }, [fetchPosts]);

  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      fetchPosts(offset, true);
    }
  };

  if (loading) {
    return <FeedSkeleton />;
  }

  return (
    <PageContainer
      noPadding
      className="flex min-h-screen w-full flex-col overflow-visible"
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
        {posts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <h2 className="mb-2 font-semibold text-xl">No posts yet</h2>
              <p className="text-muted-foreground">
                Check back soon for new content.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-feed space-y-0 px-4 py-4 lg:px-6">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            {hasMore && (
              <div className="py-4 text-center">
                {loadingMore ? (
                  <div className="text-muted-foreground text-sm">
                    Loading more posts...
                  </div>
                ) : (
                  <button
                    onClick={handleLoadMore}
                    className="rounded-lg bg-primary px-6 py-2 text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Load More
                  </button>
                )}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="py-4 text-center text-muted-foreground text-xs">
                You&apos;re all caught up.
              </div>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

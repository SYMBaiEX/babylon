'use client';

import type { FeedPost } from '@babylon/shared';
import { useCallback, useEffect, useState } from 'react';
import { PostList } from '@/app/feed/components/PostList';
import { useFeedPosts } from '@/app/feed/hooks/useFeedPosts';
import { FeedSkeleton } from '@/components/shared/Skeleton';

export function TerminalSocialFeed() {
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const { posts, loading, loadingMore, hasMore, cursor, fetchPosts } =
    useFeedPosts();

  useEffect(() => {
    const loadActorNames = async () => {
      const response = await fetch('/api/actors');
      if (!response.ok) return;
      const data = (await response.json()) as {
        actors?: Array<{ id: string; name: string }>;
      };
      const nameMap = new Map<string, string>();
      data.actors?.forEach((actor) => {
        nameMap.set(actor.id, actor.name);
      });
      setActorNames(nameMap);
    };
    void loadActorNames();
  }, []);

  const onLoadMore = useCallback(() => {
    if (!cursor) return;
    void fetchPosts(cursor, true);
  }, [cursor, fetchPosts]);

  return (
    <div className="h-full overflow-auto px-2 py-3">
      {loading ? (
        <FeedSkeleton count={6} />
      ) : posts.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          No posts yet.
        </div>
      ) : (
        <PostList
          posts={posts as FeedPost[]}
          actorNames={actorNames}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />
      )}
    </div>
  );
}

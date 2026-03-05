'use client';

import type { NarrativeStory } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applySlotPattern,
  flattenStories,
} from '@/app/feed/utils/feedAlgorithms';
import {
  toArticleCardData,
  toPostCardData,
} from '@/app/feed/utils/postMappers';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { NewMarketCard } from './NewMarketCard';

const PAGE_SIZE = 20;

interface NarrativeStoryListProps {
  stories: NarrativeStory[];
}

export function NarrativeStoryList({ stories }: NarrativeStoryListProps) {
  const router = useRouter();

  const allItems = useMemo(
    () => applySlotPattern(flattenStories(stories)),
    [stories]
  );

  // Reveal items progressively as the user scrolls — identical behaviour to
  // the infinite-scroll feed on other tabs.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when stories changes (tab switch / refresh).
  // Using a ref comparison during render is the React-idiomatic way to
  // reset derived state without a useEffect, since the effect body wouldn't
  // reference the dependency and Biome would flag it as unnecessary.
  const prevStoriesRef = useRef(stories);
  if (prevStoriesRef.current !== stories) {
    prevStoriesRef.current = stories;
    setVisibleCount(PAGE_SIZE);
  }

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, allItems.length));
  }, [allItems.length]);

  // Watch the sentinel div at the bottom of the visible list. When it enters
  // the viewport, reveal the next page of items.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const visibleItems = allItems.slice(0, visibleCount);
  const hasMore = visibleCount < allItems.length;

  if (visibleItems.length === 0) return null;

  return (
    <div className="w-full">
      {visibleItems.map((item) => {
        if (item.type === 'market') {
          return <NewMarketCard key={item.key} story={item.story} />;
        }

        const { post, marketId } = item;
        return (
          <div key={item.key} className="border-border border-b">
            {post.type === 'article' ? (
              <ArticleCard
                post={toArticleCardData(post)}
                density="default"
                onClick={() => router.push(`/article/${post.id}`)}
              />
            ) : (
              <>
                <PostCard
                  post={toPostCardData(post)}
                  density="default"
                  showCommentInputBar={false}
                  onCommentClick={() => router.push(`/post/${post.id}`)}
                />
                {marketId && item.story && (
                  <NewMarketCard story={item.story} embedded />
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Sentinel element — triggers next page load when scrolled into view */}
      <div ref={sentinelRef} className="h-1" />

      {!hasMore && (
        <div className="py-4 text-center text-muted-foreground text-xs">
          You&apos;re all caught up.
        </div>
      )}
    </div>
  );
}

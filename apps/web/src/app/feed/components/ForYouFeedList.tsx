'use client';

import type { FeedEventAction, NarrativeStory } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  toArticleCardData,
  toPostCardData,
} from '@/app/feed/utils/postMappers';
import { useFeedEventTracker } from '@/app/feed/hooks';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { NewMarketCard } from './NewMarketCard';

const PAGE_SIZE = 20;
const VISIBLE_DWELL_MS = 2000;

interface ForYouFeedListProps {
  stories: NarrativeStory[];
}

export function ForYouFeedList({ stories }: ForYouFeedListProps) {
  const router = useRouter();
  const { trackEvent } = useFeedEventTracker();
  const allItems = useMemo(() => stories, [stories]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevStoriesRef = useRef(stories);
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const impressionSentRef = useRef(new Set<string>());
  const visibleSentRef = useRef(new Set<string>());
  const dwellTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (prevStoriesRef.current === stories) return;
    prevStoriesRef.current = stories;
    setVisibleCount(PAGE_SIZE);
    impressionSentRef.current.clear();
    visibleSentRef.current.clear();
    for (const timer of dwellTimersRef.current.values()) {
      clearTimeout(timer);
    }
    dwellTimersRef.current.clear();
  }, [stories]);

  const loadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + PAGE_SIZE, allItems.length));
  }, [allItems.length]);

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

  const buildEventPayload = useCallback(
    (
      story: NarrativeStory,
      index: number,
      actionType: FeedEventAction,
      dwellMs?: number
    ) => ({
      actionType,
      surface: 'for_you' as const,
      itemId: story.isNewMarket ? story.marketId ?? story.storyKey : story.posts[0]?.id ?? story.storyKey,
      itemType:
        story.itemType ??
        (story.isNewMarket
          ? 'market'
          : story.posts[0]?.type === 'article'
            ? 'article'
            : 'post'),
      clusterId: story.clusterId ?? story.rootMarketId ?? story.marketId ?? story.storyKey,
      marketId: story.marketId ?? story.rootMarketId ?? null,
      topicKey: story.topicKey ?? null,
      authorId: story.primaryAuthorId ?? story.posts[0]?.authorId ?? null,
      feedPosition: index,
      dwellMs,
    }),
    []
  );

  const trackStoryEvent = useCallback(
    (
      story: NarrativeStory,
      index: number,
      actionType: FeedEventAction,
      dwellMs?: number
    ) => {
      trackEvent(buildEventPayload(story, index, actionType, dwellMs));
    },
    [buildEventPayload, trackEvent]
  );

  const setItemRef = useCallback((storyKey: string, node: HTMLDivElement | null) => {
    if (node) {
      itemRefs.current.set(storyKey, node);
      return;
    }
    itemRefs.current.delete(storyKey);
  }, []);

  if (visibleItems.length === 0) return null;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const storyKey = entry.target.getAttribute('data-story-key');
          if (!storyKey) continue;
          const storyIndex = visibleItems.findIndex((item) => item.storyKey === storyKey);
          if (storyIndex === -1) continue;
          const story = visibleItems[storyIndex];
          if (!story) continue;

          if (entry.isIntersecting) {
            if (!impressionSentRef.current.has(storyKey)) {
              impressionSentRef.current.add(storyKey);
              trackStoryEvent(story, storyIndex, 'impression');
            }

            if (!visibleSentRef.current.has(storyKey) && !dwellTimersRef.current.has(storyKey)) {
              const timer = setTimeout(() => {
                visibleSentRef.current.add(storyKey);
                dwellTimersRef.current.delete(storyKey);
                trackStoryEvent(story, storyIndex, 'visible_2s', VISIBLE_DWELL_MS);
              }, VISIBLE_DWELL_MS);
              dwellTimersRef.current.set(storyKey, timer);
            }
          } else {
            const timer = dwellTimersRef.current.get(storyKey);
            if (timer) {
              clearTimeout(timer);
              dwellTimersRef.current.delete(storyKey);
            }
          }
        }
      },
      { rootMargin: '0px 0px 150px 0px', threshold: 0.6 }
    );

    for (const story of visibleItems) {
      const node = itemRefs.current.get(story.storyKey);
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      for (const timer of dwellTimersRef.current.values()) {
        clearTimeout(timer);
      }
      dwellTimersRef.current.clear();
    };
  }, [trackStoryEvent, visibleItems]);

  return (
    <div className="w-full">
      {visibleItems.map((story, index) => {
        if (story.isNewMarket) {
          return (
            <div
              key={story.storyKey}
              ref={(node) => setItemRef(story.storyKey, node)}
              data-story-key={story.storyKey}
            >
              <NewMarketCard
                story={story}
                onOpenMarket={() => trackStoryEvent(story, index, 'open_market')}
                onTradeComplete={() =>
                  trackStoryEvent(story, index, 'trade_after_view')
                }
              />
            </div>
          );
        }

        const leadPost = story.posts[0];
        if (!leadPost) return null;

        return (
          <div
            key={story.storyKey}
            ref={(node) => setItemRef(story.storyKey, node)}
            data-story-key={story.storyKey}
          >
            {leadPost.type === 'article' ? (
              <ArticleCard
                post={toArticleCardData(leadPost)}
                density="default"
                onClick={() => {
                  trackStoryEvent(story, index, 'open_article');
                  router.push(`/article/${leadPost.id}`);
                }}
              />
            ) : (
              <PostCard
                post={toPostCardData(leadPost)}
                density="default"
                showCommentInputBar={false}
                onOpen={() => trackStoryEvent(story, index, 'open_post')}
                onCommentClick={() => {
                  trackStoryEvent(story, index, 'comment');
                  router.push(`/post/${leadPost.id}`);
                }}
              />
            )}
          </div>
        );
      })}

      <div ref={sentinelRef} className="h-1" />

      {!hasMore && (
        <div className="py-4 text-center text-muted-foreground text-xs">
          You&apos;re all caught up.
        </div>
      )}
    </div>
  );
}

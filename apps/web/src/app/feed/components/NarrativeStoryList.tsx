'use client';

import type { NarrativeStory } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { flattenStories } from '@/app/feed/utils/feedAlgorithms';
import {
  toArticleCardData,
  toPostCardData,
} from '@/app/feed/utils/postMappers';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { NewMarketCard } from './NewMarketCard';

interface NarrativeStoryListProps {
  stories: NarrativeStory[];
}

export function NarrativeStoryList({ stories }: NarrativeStoryListProps) {
  const router = useRouter();

  const items = useMemo(() => flattenStories(stories), [stories]);

  if (items.length === 0) return null;

  return (
    <div className="w-full">
      {items.map((item) => {
        if (item.type === 'market') {
          return <NewMarketCard key={item.key} story={item.story} />;
        }

        const { post } = item;
        return (
          <div key={item.key} className="border-border border-b">
            {post.type === 'article' ? (
              <ArticleCard
                post={toArticleCardData(post)}
                density="default"
                onClick={() => router.push(`/article/${post.id}`)}
              />
            ) : (
              <PostCard
                post={toPostCardData(post)}
                density="default"
                showCommentInputBar={false}
                onCommentClick={() => router.push(`/post/${post.id}`)}
              />
            )}
          </div>
        );
      })}

      <div className="py-4 text-center text-muted-foreground text-xs">
        You&apos;re all caught up.
      </div>
    </div>
  );
}

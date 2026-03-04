'use client';

import type { NarrativePost, NarrativeStory } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { NewMarketCard } from './NewMarketCard';

// ─── Data helpers ────────────────────────────────────────────────────────────

function toPostCardData(post: NarrativePost) {
  return {
    id: post.id,
    type: post.type ?? undefined,
    content: post.content,
    articleTitle: post.articleTitle,
    category: post.category,
    authorId: post.authorId,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    authorProfileImageUrl: post.authorProfileImageUrl,
    timestamp: post.timestamp,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    isLiked: post.isLiked,
    isShared: post.isShared,
  };
}

function toArticleCardData(post: NarrativePost) {
  return {
    id: post.id,
    type: post.type ?? undefined,
    content: post.content,
    fullContent: post.fullContent,
    articleTitle: post.articleTitle,
    category: post.category,
    imageUrl: post.imageUrl,
    authorId: post.authorId,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    authorProfileImageUrl: post.authorProfileImageUrl,
    timestamp: post.timestamp,
  };
}

// ─── Flat item type ──────────────────────────────────────────────────────────

type FlatItem =
  | { type: 'post'; post: NarrativePost; key: string }
  | { type: 'market'; story: NarrativeStory; key: string };

/**
 * Flatten scored stories into a single interleaved list using round-robin.
 *
 * Stories arrive sorted by score DESC (from the API). Round-robin takes one
 * post from each story per pass, so posts from different markets are interleaved
 * rather than appearing in blocks. New market cards (no posts) are emitted once
 * at their scored position in the first pass.
 */
function flattenStories(stories: NarrativeStory[]): FlatItem[] {
  const items: FlatItem[] = [];
  const queues = stories.map((s) => ({
    story: s,
    posts: [...s.posts],
    marketEmitted: false,
  }));

  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const q of queues) {
      if (q.story.isNewMarket) {
        if (!q.marketEmitted) {
          q.marketEmitted = true;
          items.push({ type: 'market', story: q.story, key: q.story.storyKey });
          anyLeft = true;
        }
      } else if (q.posts.length > 0) {
        const post = q.posts.shift()!;
        items.push({ type: 'post', post, key: `${q.story.storyKey}:${post.id}` });
        anyLeft = true;
      }
    }
  }

  return items;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface NarrativeStoryListProps {
  stories: NarrativeStory[];
}

export function NarrativeStoryList({ stories }: NarrativeStoryListProps) {
  const router = useRouter();

  const items = flattenStories(stories);

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

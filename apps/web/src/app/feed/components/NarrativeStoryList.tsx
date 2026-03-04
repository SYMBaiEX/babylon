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
 * How many consecutive posts to show from a story before rotating to the next.
 *
 * A burst of 2 gives users enough context to decide if they're interested in
 * a topic (read two posts, understand the conversation) before the feed rotates
 * to fresh content. Strict 1-per-story round-robin changes topics too abruptly;
 * large bursts make the feed feel like grouped sections again.
 *
 * The top-scored story gets BURST_LEAD posts on its first appearance so the
 * highest-signal content has slightly more prominence at the top of the feed.
 */
const BURST_SIZE = 3; // posts per story per rotation pass
const BURST_LEAD = 4; // extra posts for the top story on its first appearance

/**
 * Flatten scored stories into an interleaved burst list.
 *
 * Stories arrive sorted by score DESC (from the API). Each story contributes
 * BURST_SIZE consecutive posts before rotating to the next — enough context
 * to follow a thread without seeing every post from one topic in a block.
 * The highest-scored story gets BURST_LEAD posts on its opening appearance
 * so the most relevant content surfaces clearly at the top.
 * New market cards have no posts and emit a single card at their scored position.
 */
function flattenStories(stories: NarrativeStory[]): FlatItem[] {
  const items: FlatItem[] = [];
  const queues = stories.map((s) => ({
    story: s,
    posts: [...s.posts],
    marketEmitted: false,
    firstAppearance: true,
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
        continue;
      }

      if (q.posts.length === 0) continue;

      // Top story (index 0) gets extra posts on first appearance for prominence
      const burst =
        q.firstAppearance && queues.indexOf(q) === 0 ? BURST_LEAD : BURST_SIZE;
      q.firstAppearance = false;

      let took = 0;
      while (took < burst && q.posts.length > 0) {
        const post = q.posts.shift()!;
        items.push({
          type: 'post',
          post,
          key: `${q.story.storyKey}:${post.id}`,
        });
        took++;
      }
      anyLeft = true;
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

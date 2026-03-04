'use client';

import type {
  ArcStateType,
  NarrativePost,
  NarrativeStory,
} from '@babylon/shared';
import { cn } from '@babylon/shared';
import { BookOpen, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PostCard } from '@/components/posts/PostCard';
import { NewMarketCard } from './NewMarketCard';

// Arc state display config: label + Tailwind classes
const ARC_STATE_CONFIG: Record<
  ArcStateType,
  { label: string; className: string }
> = {
  crisis: {
    label: 'Crisis',
    className: 'bg-red-500/15 text-red-500 border-red-500/30',
  },
  climax: {
    label: 'Climax',
    className: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  },
  revelation: {
    label: 'Revelation',
    className: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  },
  escalation: {
    label: 'Escalation',
    className: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  },
  active: {
    label: 'Active',
    className: 'bg-green-500/15 text-green-600 border-green-500/30',
  },
  live: {
    label: 'Live',
    className: 'bg-green-600/15 text-green-600 border-green-600/30',
  },
  tension: {
    label: 'Tension',
    className: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  },
  resolving: {
    label: 'Resolving',
    className: 'bg-muted text-muted-foreground border-border',
  },
  resolution: {
    label: 'Resolved',
    className: 'bg-muted text-muted-foreground border-border',
  },
  setup: {
    label: 'Setup',
    className: 'bg-muted text-muted-foreground border-border',
  },
  morning: {
    label: 'Morning',
    className: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  },
  midday: {
    label: 'Midday',
    className: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  },
  afternoon: {
    label: 'Afternoon',
    className: 'bg-orange-400/15 text-orange-500 border-orange-400/30',
  },
  evening: {
    label: 'Evening',
    className: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
  },
};

const POSTS_COLLAPSED_COUNT = 3;

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

interface NarrativeStoryCardProps {
  story: NarrativeStory;
}

// A standalone post card has storyKey prefixed with 'post:' — these are
// high-scoring individual posts dissolved from the general bucket. They render
// without a story header since the PostCard already shows all relevant context.
const isStandalonePost = (storyKey: string) => storyKey.startsWith('post:');

export function NarrativeStoryCard({ story }: NarrativeStoryCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const arcConfig = story.arcState ? ARC_STATE_CONFIG[story.arcState] : null;
  const hasMore = story.posts.length > POSTS_COLLAPSED_COUNT;
  const visiblePosts = useMemo(
    () =>
      expanded ? story.posts : story.posts.slice(0, POSTS_COLLAPSED_COUNT),
    [expanded, story.posts]
  );

  // New market cards render a dedicated trade CTA card
  if (story.isNewMarket) {
    return <NewMarketCard story={story} />;
  }

  // Standalone posts render as plain feed cards — no story header wrapper
  if (isStandalonePost(story.storyKey) && story.posts.length === 1) {
    const post = story.posts[0]!;
    return (
      <div className="border-border border-b">
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
  }

  return (
    <div className="border-border border-b">
      {/* Story header — only shown for question-linked multi-post stories */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex-shrink-0 rounded-full bg-primary/10 p-1.5">
          <BookOpen className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground text-sm leading-tight">
              {story.storyTitle}
            </span>

            {arcConfig && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs',
                  arcConfig.className
                )}
              >
                {arcConfig.label}
              </span>
            )}

            {story.hasUserPosition && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                <TrendingUp className="h-3 w-3" />
                Your Position
              </span>
            )}
          </div>

          <p className="mt-0.5 text-muted-foreground text-xs">
            {story.postCount} {story.postCount === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>

      {/* Posts — article type uses ArticleCard (renders imageUrl); others use PostCard */}
      <div className="divide-y divide-border">
        {visiblePosts.map((post) =>
          post.type === 'article' ? (
            <ArticleCard
              key={post.id}
              post={toArticleCardData(post)}
              density="compact"
              onClick={() => router.push(`/article/${post.id}`)}
            />
          ) : (
            <PostCard
              key={post.id}
              post={toPostCardData(post)}
              density="compact"
              showCommentInputBar={false}
              onCommentClick={() => router.push(`/post/${post.id}`)}
            />
          )
        )}
      </div>

      {/* Expand / collapse toggle */}
      {hasMore && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-border border-t py-2.5 text-muted-foreground text-sm transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {story.posts.length - POSTS_COLLAPSED_COUNT} more{' '}
              {story.posts.length - POSTS_COLLAPSED_COUNT === 1
                ? 'post'
                : 'posts'}
            </>
          )}
        </button>
      )}
    </div>
  );
}

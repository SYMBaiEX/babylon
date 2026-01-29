'use client';

import type { FeedTagData } from '@babylon/shared';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import Link from 'next/link';

interface FeedPanelProps {
  data: FeedTagData;
}

export function FeedPanel({ data }: FeedPanelProps) {
  const { posts, count, hasMore } = data;

  if (!posts || posts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">No posts in feed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Feed Posts</h3>
        <span className="text-muted-foreground text-xs">{count} posts</span>
      </div>
      <div className="space-y-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/post/${post.id}`}
            className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">@{post.authorName}</span>
              <span className="text-muted-foreground text-xs">
                {post.timeAgo}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm">{post.content}</p>
            <div className="mt-2 flex items-center gap-4 text-muted-foreground text-xs">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {post.likeCount}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {post.commentCount}
              </span>
              <span className="flex items-center gap-1">
                <Share2 className="h-3 w-3" />
                {post.shareCount}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <Link
          href="/feed"
          className="block rounded-lg border border-border p-3 text-center text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
        >
          View more on feed →
        </Link>
      )}
    </div>
  );
}

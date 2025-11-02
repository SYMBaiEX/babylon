'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Avatar } from '@/components/shared/Avatar';
import { InteractionBar } from '@/components/interactions';
import { ShieldCheck } from 'lucide-react';
import { useFontSize } from '@/contexts/FontSizeContext';
import type { PostInteraction } from '@/types/interactions';

export interface PostCardProps {
  post: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    timestamp: string;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    isLiked?: boolean;
    isShared?: boolean;
  };
  className?: string;
  onClick?: () => void;
  showInteractions?: boolean;
  isDetail?: boolean;
}

export const PostCard = memo(function PostCard({
  post,
  className,
  onClick,
  showInteractions = true,
  isDetail = false,
}: PostCardProps) {
  const { fontSize } = useFontSize();

  const postDate = new Date(post.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - postDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let timeAgo: string;
  if (diffMinutes < 1) timeAgo = 'Just now';
  else if (diffMinutes < 60) timeAgo = `${diffMinutes}m ago`;
  else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
  else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
  else timeAgo = postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const initialInteractions: PostInteraction = {
    postId: post.id,
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentCount ?? 0,
    shareCount: post.shareCount ?? 0,
    isLiked: post.isLiked ?? false,
    isShared: post.isShared ?? false,
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  return (
    <article
      className={cn(
        'px-3 sm:px-4 py-3',
        !isDetail && 'border-b hover:bg-muted/30 cursor-pointer transition-all duration-200',
        'w-full overflow-hidden',
        className
      )}
      style={{
        fontSize: `${fontSize}rem`,
        borderBottomWidth: !isDetail ? '0.5px' : undefined,
        borderBottomColor: !isDetail ? 'rgba(229, 231, 235, 0.5)' : undefined, // Very light gray
      }}
      onClick={!isDetail ? handleClick : undefined}
    >
      {/* Header Row: Avatar, Name, Handle, Timestamp */}
      <div className="flex items-center gap-2 sm:gap-3 mb-2 w-full">
        {/* Avatar - Clickable */}
        <Link
          href={`/profile/${post.authorId}`}
          className="flex-shrink-0 hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            id={post.authorId}
            name={post.authorName}
            type="actor"
            size="lg"
            scaleFactor={fontSize}
          />
        </Link>

        {/* Name and Handle stacked */}
        <div className="flex flex-col justify-center min-w-0 overflow-hidden flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/profile/${post.authorId}`}
              className="font-bold text-foreground hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {post.authorName}
            </Link>
            <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" />
          </div>
          <Link
            href={`/profile/${post.authorId}`}
            className="text-muted-foreground text-sm hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            @{post.authorId}
          </Link>
        </div>

        {/* Timestamp */}
        <time className="text-muted-foreground text-sm flex-shrink-0" title={postDate.toLocaleString()}>
          {timeAgo}
        </time>
      </div>

      {/* Post content - Full width */}
      <div className="text-foreground leading-normal whitespace-pre-wrap break-anywhere w-full mb-2">
        {post.content}
      </div>

      {/* Interaction Bar - Full width */}
      {showInteractions && (
        <div onClick={(e) => e.stopPropagation()}>
          <InteractionBar
            postId={post.id}
            initialInteractions={initialInteractions}
          />
        </div>
      )}
    </article>
  );
});


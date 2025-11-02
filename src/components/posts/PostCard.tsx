'use client';

import { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/shared/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import { InteractionBar } from '@/components/interactions';
import { ShieldCheck } from 'lucide-react';
import { useFontSize } from '@/contexts/FontSizeContext';
import { getProfileUrl } from '@/lib/profile-utils';
import type { PostInteraction } from '@/types/interactions';

export interface PostCardProps {
  post: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername?: string | null;
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
  const router = useRouter();
  const { fontSize } = useFontSize();
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setIsMobile(window.innerWidth < 640);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

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
        'px-4 sm:px-6 py-4 sm:py-5',
        !isDetail && 'hover:bg-muted/30 cursor-pointer transition-all duration-200',
        'w-full overflow-hidden',
        className
      )}
      style={{
        fontSize: `${fontSize}rem`,
      }}
      onClick={!isDetail ? handleClick : undefined}
    >
      {/* Main Content Row: Avatar on left, everything else on right */}
      <div className="flex items-start gap-3 sm:gap-4 lg:gap-5 w-full">
        {/* Avatar - Clickable, Round */}
        <Link
          href={getProfileUrl(post.authorId, post.authorUsername)}
          className="flex-shrink-0 hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            id={post.authorId}
            name={post.authorName}
            type="actor"
            size="lg"
            scaleFactor={isDetail ? fontSize : fontSize * (isDesktop ? 1.4 : isMobile ? 0.8 : 1)}
          />
        </Link>

        {/* Right side: Name/Handle row, Content below */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Header Row: Name, Handle on left, Timestamp on right */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link
                href={getProfileUrl(post.authorId, post.authorUsername)}
                className="font-semibold text-xl sm:text-2xl text-foreground hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {post.authorName}
              </Link>
              <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500 flex-shrink-0" fill="currentColor" />
              <Link
                href={getProfileUrl(post.authorId, post.authorUsername)}
                className="text-muted-foreground text-lg sm:text-xl hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                @{post.authorUsername || post.authorId}
              </Link>
            </div>
            {/* Timestamp - Right aligned */}
            <time className="text-muted-foreground text-lg sm:text-xl flex-shrink-0 ml-auto" title={postDate.toLocaleString()}>
              {timeAgo}
            </time>
          </div>

          {/* Post content - Below name/handle row */}
          <div className="text-foreground text-xl sm:text-2xl leading-relaxed whitespace-pre-wrap break-words w-full mb-3 post-content">
            <TaggedText
              text={post.content || ''}
              onTagClick={(tag) => {
                router.push(`/feed?search=${encodeURIComponent(tag)}`)
              }}
            />
          </div>
        </div>
      </div>

      {/* Interaction Bar - Aligned to content start (right of avatar) */}
      {showInteractions && (
        <div onClick={(e) => e.stopPropagation()} className="mt-2 flex items-start">
          {/* Spacer to align with avatar right edge + gap */}
          <div 
            className="flex-shrink-0"
            style={{
              width: isDesktop
                ? `${(3.5 * (fontSize || 1) * 1.4) + 1.25}rem` // Larger avatar + gap-5 for desktop
                : `${(3.5 * (fontSize || 1)) + 0.75}rem`, // Avatar width + gap-3 for mobile/tablet
            }}
          />
          <div className="flex-1">
            <InteractionBar
              postId={post.id}
              initialInteractions={initialInteractions}
              postData={post}
            />
          </div>
        </div>
      )}
    </article>
  );
});


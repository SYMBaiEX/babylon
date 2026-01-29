'use client';

import { cn } from '@babylon/shared';
import { MessageCircle, Repeat2 } from 'lucide-react';
import { memo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLoginModal } from '@/hooks/useLoginModal';
import { LikeButton } from './LikeButton';

/**
 * Props for CommentInteractionBar component.
 */
export interface CommentInteractionBarProps {
  commentId: string;
  likeCount?: number;
  isLiked?: boolean;
  replyCount?: number;
  onReplyClick?: () => void;
  onRepostClick?: () => void;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Compact interaction bar for comments.
 *
 * Displays like, reply, and repost buttons in a compact format
 * suitable for inline comment displays. Reuses existing button
 * components for consistency.
 *
 * @example
 * ```tsx
 * <CommentInteractionBar
 *   commentId="comment-123"
 *   likeCount={5}
 *   isLiked={false}
 *   onReplyClick={() => openReplyInput()}
 * />
 * ```
 */
export const CommentInteractionBar = memo(function CommentInteractionBar({
  commentId,
  likeCount = 0,
  isLiked = false,
  replyCount = 0,
  onReplyClick,
  onRepostClick,
  size = 'xs',
  className,
}: CommentInteractionBarProps) {
  const { authenticated } = useAuth();
  const { showLoginModal } = useLoginModal();

  const handleReplyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!authenticated) {
      showLoginModal({
        title: 'Login to Reply',
        message: 'Log in to reply to comments and engage with the community.',
      });
      return;
    }
    onReplyClick?.();
  };

  const handleRepostClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!authenticated) {
      showLoginModal({
        title: 'Login to Repost',
        message: 'Log in to share comments with your followers.',
      });
      return;
    }
    onRepostClick?.();
  };

  const iconSize = size === 'xs' ? 14 : 16;
  const buttonClasses = cn(
    'flex items-center gap-1 transition-all duration-200',
    'cursor-pointer bg-transparent hover:opacity-70',
    'text-muted-foreground',
    size === 'xs' ? 'h-6 px-1 text-xs' : 'h-7 px-1.5 text-xs'
  );

  return (
    <div
      className={cn('mt-1.5 flex items-center gap-4', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reply button */}
      <button
        type="button"
        onClick={handleReplyClick}
        className={buttonClasses}
        aria-label="Reply to comment"
      >
        <MessageCircle size={iconSize} />
        {replyCount > 0 && (
          <span className="font-medium tabular-nums">{replyCount}</span>
        )}
      </button>

      {/* Repost button */}
      <button
        type="button"
        onClick={handleRepostClick}
        className={buttonClasses}
        aria-label="Repost comment"
      >
        <Repeat2 size={iconSize} />
      </button>

      {/* Like button - reuses existing component */}
      <LikeButton
        targetId={commentId}
        targetType="comment"
        initialLiked={isLiked}
        initialCount={likeCount}
        size="sm"
        showCount
        className={cn(
          size === 'xs' && '!h-6 !px-1 !text-xs !gap-1',
          '[&_svg]:!w-3.5 [&_svg]:!h-3.5'
        )}
      />
    </div>
  );
});

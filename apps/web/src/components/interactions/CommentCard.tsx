'use client';

import type { CommentCardProps, CommentData } from '@babylon/shared';
import { cn, getProfileUrl } from '@babylon/shared';
import { formatDistanceToNow } from 'date-fns';
import { Edit2, MessageCircle, MoreVertical, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import {
  isNpcIdentifier,
  VerifiedBadge,
} from '@/components/shared/VerifiedBadge';
import { CommentInput } from './CommentInput';
import { LikeButton } from './LikeButton';

/**
 * Recursive reply type for counting
 */
interface ReplyWithReplies {
  replies?: ReplyWithReplies[];
}

/**
 * Count total replies recursively
 */
function countAllReplies(replies: ReplyWithReplies[]): number {
  let count = replies.length;
  for (const reply of replies) {
    if (reply.replies && reply.replies.length > 0) {
      count += countAllReplies(reply.replies);
    }
  }
  return count;
}

/**
 * Comment card component for displaying comments with Twitter-like threading.
 *
 * Displays a comment with user avatar, content, timestamp, and actions
 * (like, reply, edit, delete). Uses page-based navigation for replies -
 * clicking the reply count navigates to a dedicated comment thread page.
 *
 * @param props - CommentCard component props
 * @returns Comment card element
 *
 * @example
 * ```tsx
 * <CommentCard
 *   comment={commentData}
 *   postId="post-123"
 *   onReply={handleReply}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 * />
 * ```
 */
export function CommentCard({
  comment,
  postId,
  onReply,
  onEdit,
  onDelete,
  onReplySubmit,
  className,
}: CommentCardProps) {
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const hasReplies = comment.replies && comment.replies.length > 0;
  const replyCount = hasReplies ? countAllReplies(comment.replies) : 0;

  const showVerifiedBadge = isNpcIdentifier(comment.userId);

  const handleReply = () => {
    setIsReplying(true);
    if (onReply) {
      onReply(comment.id);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setShowActions(false);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim() !== comment.content) {
      onEdit(comment.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (onDelete && confirm('Are you sure you want to delete this comment?')) {
      onDelete(comment.id);
    }
    setShowActions(false);
  };

  // Navigate to comment thread page
  const handleNavigateToThread = () => {
    router.push(`/comment/${comment.id}`);
  };

  return (
    <div className={cn('flex gap-3', className)}>
      {/* Avatar - Round */}
      <div className="shrink-0">
        <Avatar
          id={comment.userId}
          name={comment.userName}
          size="sm"
          src={comment.userAvatar || undefined}
          imageUrl={comment.userAvatar || undefined}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header: Username/handle on left, timestamp and actions on right */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-semibold text-sm">
              {comment.userName}
            </span>
            {showVerifiedBadge && <VerifiedBadge size="sm" className="-ml-1" />}
            <span className="truncate text-muted-foreground text-xs">
              @{comment.userUsername || comment.userName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Timestamp - Right aligned */}
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
              })}
            </span>

            {/* Actions menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActions(!showActions)}
                className={cn(
                  'rounded-md p-1',
                  'text-muted-foreground hover:text-foreground',
                  'transition-colors hover:bg-muted'
                )}
              >
                <MoreVertical size={16} />
              </button>

              {showActions && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowActions(false)}
                  />

                  {/* Dropdown */}
                  <div className="fade-in slide-in-from-top-2 absolute top-full right-0 z-20 mt-1 min-w-[120px] animate-in rounded-md border border-border bg-popover py-1 shadow-lg duration-150">
                    <button
                      type="button"
                      onClick={handleEdit}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive text-sm transition-colors hover:bg-muted"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Replying to indicator */}
        {comment.parentCommentId && comment.parentCommentAuthorName && (
          <div className="mb-1 flex items-center gap-1 text-muted-foreground text-xs">
            <span>Replying to</span>
            <span className="font-medium text-primary">
              @{comment.parentCommentAuthorName}
            </span>
          </div>
        )}

        {/* Comment body - Clickable to navigate to thread */}
        {isEditing ? (
          <div className="mb-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] w-full resize-none rounded-md border border-border bg-muted p-2 text-sm focus:border-border focus:outline-none"
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editContent.trim()}
                className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleNavigateToThread}
            className="mb-2 w-full cursor-pointer text-left transition-colors hover:text-muted-foreground"
          >
            <p className="whitespace-pre-wrap break-words text-foreground text-sm">
              <TaggedText
                text={comment.content}
                onTagClick={(tag) => {
                  if (tag.startsWith('@')) {
                    // Handle @mentions - route to profile
                    const username = tag.slice(1);
                    router.push(getProfileUrl('', username));
                  } else if (tag.startsWith('$')) {
                    // Handle $cashtags - route to markets
                    const symbol = tag.slice(1);
                    router.push(
                      `/markets?search=${encodeURIComponent(symbol)}`
                    );
                  }
                }}
              />
            </p>
          </button>
        )}

        {/* Footer actions - Twitter-like layout */}
        <div className="flex items-center gap-1">
          {/* Message icon - always for reply to this comment */}
          <button
            type="button"
            onClick={handleReply}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors',
              'text-muted-foreground hover:bg-[#0066FF]/10 hover:text-[#0066FF]',
              isReplying && 'bg-[#0066FF]/10 text-[#0066FF]'
            )}
          >
            <MessageCircle size={14} />
            <span>
              {hasReplies ? (replyCount >= 99 ? '99+' : replyCount) : ''}
            </span>
          </button>

          {/* Like button */}
          <LikeButton
            targetId={comment.id}
            targetType="comment"
            initialLiked={comment.isLiked}
            initialCount={comment.likeCount}
            size="sm"
            showCount
          />
        </div>

        {/* Reply input */}
        {isReplying && (
          <div className="mt-3">
            <CommentInput
              postId={postId}
              parentCommentId={comment.id}
              placeholder={`Reply to ${comment.userName}...`}
              replyingToName={comment.userName}
              autoFocus
              onSubmit={async (replyComment: CommentData) => {
                setIsReplying(false);
                // Call onReplySubmit callback if provided to handle optimistic update
                if (onReplySubmit && replyComment) {
                  onReplySubmit(replyComment);
                }
              }}
              onCancel={() => setIsReplying(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

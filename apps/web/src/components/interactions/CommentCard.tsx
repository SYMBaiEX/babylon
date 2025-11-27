'use client';

import { formatDistanceToNow } from 'date-fns';
import { Edit2, MoreVertical, Reply, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import {
  isNpcIdentifier,
  VerifiedBadge,
} from '@/components/shared/VerifiedBadge';
import { cn } from '@babylon/shared';
import type {
  CommentCardProps,
  CommentData,
  CommentWithReplies,
} from '@babylon/shared';
import { CommentInput } from './CommentInput';
import { LikeButton } from './LikeButton';

/**
 * Maximum nesting depth for comment replies.
 */
const MAX_DEPTH = 5; // Maximum nesting depth for replies

/**
 * Comment card component for displaying comments and nested replies.
 *
 * Displays a comment with user avatar, content, timestamp, and actions
 * (like, reply, edit, delete). Supports nested replies up to a maximum depth.
 * Includes inline editing and reply functionality.
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
  depth = 0,
  maxDepth = MAX_DEPTH,
  className,
}: CommentCardProps) {
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showReplies, setShowReplies] = useState(true);

  const isMaxDepth = depth >= maxDepth;
  const hasReplies = comment.replies && comment.replies.length > 0;

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

  return (
    <div
      className={cn(
        'flex gap-3',
        depth > 0 && 'ml-8 border-border border-l-2 pl-4',
        className
      )}
    >
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

        {/* Comment body - Below name/handle row */}
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
          <p className="mb-2 whitespace-pre-wrap break-words text-foreground text-sm">
            <TaggedText
              text={comment.content}
              onTagClick={(tag) => {
                router.push(`/feed?search=${encodeURIComponent(tag)}`);
              }}
            />
          </p>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-4">
          {/* Like button */}
          <LikeButton
            targetId={comment.id}
            targetType="comment"
            initialLiked={comment.isLiked}
            initialCount={comment.likeCount}
            size="sm"
            showCount
          />

          {/* Reply button */}
          {!isMaxDepth && (
            <button
              type="button"
              onClick={handleReply}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
            >
              <Reply size={14} />
              <span>Reply</span>
            </button>
          )}

          {/* Toggle replies button */}
          {hasReplies && (
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              className="text-muted-foreground text-xs transition-colors hover:text-foreground"
            >
              {showReplies ? 'Hide' : 'Show'} {comment.replies.length}{' '}
              {comment.replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
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

        {/* Nested replies */}
        {hasReplies && showReplies && (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply: CommentWithReplies) => (
              <CommentCard
                key={reply.id}
                comment={reply}
                postId={postId}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onReplySubmit={onReplySubmit}
                depth={depth + 1}
                maxDepth={maxDepth}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

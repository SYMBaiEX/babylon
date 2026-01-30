'use client';

import { cn, getProfileUrl } from '@babylon/shared';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CommentInput } from '@/components/interactions/CommentInput';
import { LikeButton } from '@/components/interactions/LikeButton';
import { Avatar } from '@/components/shared/Avatar';
import { TaggedText } from '@/components/shared/TaggedText';
import {
  isNpcIdentifier,
  VerifiedBadge,
} from '@/components/shared/VerifiedBadge';

/**
 * Author info structure
 */
interface AuthorInfo {
  id?: string;
  displayName?: string | null;
  username?: string | null;
  profileImageUrl?: string | null;
}

/**
 * Reply data structure from the API
 */
export interface ProfileReply {
  id: string;
  content: string;
  postId: string;
  parentCommentId?: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
  // Parent comment (if replying to a comment)
  parentComment?: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
    author?: AuthorInfo | null;
  } | null;
  // Original post
  post: {
    id: string;
    content: string;
    authorId: string;
    timestamp: string;
    author?: AuthorInfo | null;
  };
}

interface ProfileReplyCardProps {
  reply: ProfileReply;
  /** The profile owner's author ID */
  authorId: string;
  /** The profile owner's display name */
  authorName: string;
  /** The profile owner's username */
  authorUsername: string | null;
  /** The profile owner's profile image URL */
  authorProfileImageUrl: string | null;
  /** Callback when a reply is submitted */
  onReplySubmit?: () => void;
}

/**
 * ProfileReplyCard - Shows a user's reply in their profile with thread-style layout
 *
 * Layout:
 * - Original post/comment (what they replied to) at top with vertical connector line
 * - User's reply below, connected by the line
 * - Action buttons (reply, like) at the bottom
 */
export function ProfileReplyCard({
  reply,
  authorId,
  authorName,
  authorUsername,
  authorProfileImageUrl,
  onReplySubmit,
}: ProfileReplyCardProps) {
  const router = useRouter();
  const [isReplying, setIsReplying] = useState(false);
  const [replyCount, setReplyCount] = useState(reply.replyCount);

  // Determine if we're replying to a comment or directly to a post
  const isReplyToComment = !!reply.parentComment;

  // Get the parent content info (either parent comment or post)
  const parentAuthorId = isReplyToComment
    ? reply.parentComment?.author?.id || reply.parentComment?.authorId || ''
    : reply.post?.author?.id || reply.post?.authorId || '';
  const parentAuthorName = isReplyToComment
    ? reply.parentComment?.author?.displayName ||
      reply.parentComment?.author?.username ||
      'User'
    : reply.post?.author?.displayName || reply.post?.author?.username || 'User';
  const parentAuthorUsername = isReplyToComment
    ? reply.parentComment?.author?.username || null
    : reply.post?.author?.username || null;
  const parentAuthorProfileImageUrl = isReplyToComment
    ? reply.parentComment?.author?.profileImageUrl || null
    : reply.post?.author?.profileImageUrl || null;
  const parentContent = isReplyToComment
    ? reply.parentComment?.content || ''
    : reply.post?.content || '';
  const parentTimestamp = isReplyToComment
    ? reply.parentComment?.createdAt || ''
    : reply.post?.timestamp || '';
  const parentAuthorIsNPC = isNpcIdentifier(parentAuthorId);

  // Reply author (profile owner) info
  const replyAuthorIsNPC = isNpcIdentifier(authorId);

  // Navigation targets
  const parentNavigateUrl = isReplyToComment
    ? `/comment/${reply.parentComment?.id}`
    : `/post/${reply.post.id}`;

  const handleTagClick = (tag: string) => {
    if (tag.startsWith('@')) {
      const username = tag.slice(1);
      router.push(getProfileUrl('', username));
    } else if (tag.startsWith('$')) {
      const symbol = tag.slice(1);
      router.push(`/markets?search=${encodeURIComponent(symbol)}`);
    }
  };

  const handleReplySubmit = async () => {
    setIsReplying(false);
    setReplyCount((prev) => prev + 1);
    onReplySubmit?.();
  };

  return (
    <div className="border-border border-b">
      {/* Parent Content - what they replied to (post or comment) */}
      <div className="relative">
        {/* Connector line - from parent avatar down to reply */}
        <div className="absolute top-10 bottom-0 left-[1.625rem] w-0.5 bg-border sm:left-[1.875rem]" />

        <div
          className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-6"
          onClick={() => router.push(parentNavigateUrl)}
        >
          {/* Parent Author Avatar */}
          <Link
            href={getProfileUrl(parentAuthorId, parentAuthorUsername)}
            className="relative z-10 shrink-0 transition-opacity hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar
              id={parentAuthorId}
              name={parentAuthorName}
              size="sm"
              imageUrl={parentAuthorProfileImageUrl || undefined}
            />
          </Link>

          {/* Parent Content */}
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="mb-1 flex items-center gap-2">
              <Link
                href={getProfileUrl(parentAuthorId, parentAuthorUsername)}
                className="truncate font-semibold text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {parentAuthorName}
              </Link>
              {parentAuthorIsNPC && (
                <VerifiedBadge size="sm" className="-ml-1" />
              )}
              <Link
                href={getProfileUrl(parentAuthorId, parentAuthorUsername)}
                className="truncate text-muted-foreground text-xs hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{parentAuthorUsername || parentAuthorName}
              </Link>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">
                {parentTimestamp &&
                  formatDistanceToNow(new Date(parentTimestamp), {
                    addSuffix: true,
                  })}
              </span>
            </div>

            {/* Parent Content - truncated */}
            <p className="line-clamp-3 text-foreground text-sm">
              <TaggedText text={parentContent} onTagClick={handleTagClick} />
            </p>
          </div>
        </div>
      </div>

      {/* User's Reply */}
      <div
        className="flex cursor-pointer gap-3 px-4 pb-3 transition-colors hover:bg-muted/50 sm:px-6"
        onClick={() => router.push(`/comment/${reply.id}`)}
      >
        {/* Reply Author Avatar */}
        <Link
          href={getProfileUrl(authorId, authorUsername)}
          className="shrink-0 transition-opacity hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            id={authorId}
            name={authorName}
            size="sm"
            imageUrl={authorProfileImageUrl || undefined}
          />
        </Link>

        {/* Reply Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-1 flex items-center gap-2">
            <Link
              href={getProfileUrl(authorId, authorUsername)}
              className="truncate font-semibold text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {authorName}
            </Link>
            {replyAuthorIsNPC && <VerifiedBadge size="sm" className="-ml-1" />}
            <Link
              href={getProfileUrl(authorId, authorUsername)}
              className="truncate text-muted-foreground text-xs hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{authorUsername || authorName}
            </Link>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(reply.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Reply Content */}
          <p className="mb-2 whitespace-pre-wrap break-words text-foreground text-sm">
            <TaggedText text={reply.content} onTagClick={handleTagClick} />
          </p>

          {/* Action Buttons */}
          <div
            className="mt-2 flex w-full items-center justify-between gap-6 text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reply button */}
            <button
              type="button"
              onClick={() => setIsReplying(!isReplying)}
              className={cn(
                'flex flex-1 items-center gap-1',
                'bg-transparent transition-all duration-200 hover:opacity-70',
                'cursor-pointer text-muted-foreground text-xs',
                isReplying && 'text-[#0066FF]'
              )}
            >
              <MessageCircle size={18} />
              {replyCount > 0 && (
                <span className="font-medium tabular-nums">{replyCount}</span>
              )}
            </button>

            {/* Repost button (placeholder) */}
            <div className="flex-1">
              <button
                type="button"
                disabled
                className="flex cursor-default items-center gap-1 text-muted-foreground/40 text-xs"
              >
                <Repeat2 size={18} />
              </button>
            </div>

            {/* Like button */}
            <div className="flex-1">
              <LikeButton
                targetId={reply.id}
                targetType="comment"
                initialLiked={reply.isLiked}
                initialCount={reply.likeCount}
                size="sm"
                showCount
              />
            </div>

            {/* Empty spacer to match 4-column layout */}
            <div className="flex-1" />
          </div>

          {/* Inline reply input */}
          {isReplying && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <CommentInput
                postId={reply.postId}
                parentCommentId={reply.id}
                placeholder={`Reply to ${authorName}...`}
                replyingToName={authorName}
                autoFocus
                onSubmit={handleReplySubmit}
                onCancel={() => setIsReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

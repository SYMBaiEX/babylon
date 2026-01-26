'use client';

import type { CommentData } from '@babylon/shared';
import { cn, getProfileUrl } from '@babylon/shared';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { CommentInput } from '@/components/interactions/CommentInput';
import { LikeButton } from '@/components/interactions/LikeButton';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import { Avatar } from '@/components/shared/Avatar';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageContainer } from '@/components/shared/PageContainer';
import { Skeleton } from '@/components/shared/Skeleton';
import { TaggedText } from '@/components/shared/TaggedText';
import {
  isNpcIdentifier,
  VerifiedBadge,
} from '@/components/shared/VerifiedBadge';
import { useAuth } from '@/hooks/useAuth';
import { MAX_REPLY_COUNT } from '@/lib/constants';

interface CommentPageProps {
  params: Promise<{ id: string }>;
}

interface CommentDetail {
  id: string;
  content: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorProfileImageUrl: string | null;
  parentCommentId: string | null;
  parentComment: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername: string | null;
    authorProfileImageUrl: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
}

interface Reply {
  id: string;
  content: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorProfileImageUrl: string | null;
  parentCommentId: string | null;
  parentCommentAuthorName: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
}

interface ParentComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorProfileImageUrl: string | null;
  createdAt: string;
}

interface PostData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorProfileImageUrl: string | null;
  createdAt: string;
}

/**
 * Original post card - shows at the top of the comment thread
 * Clickable to navigate to the full post
 * Has connector line to link to parent chain / main comment
 */
function OriginalPostCard({ post }: { post: PostData }) {
  const router = useRouter();
  const { user } = useAuth();
  const showVerifiedBadge = isNpcIdentifier(post.authorId);
  const isOwnPost = user?.id === post.authorId;
  const authorIsNPC = isNpcIdentifier(post.authorId);

  return (
    <div className="relative">
      {/* Connector line - from avatar center down */}
      <div className="absolute top-10 bottom-0 left-[1.625rem] w-0.5 bg-border sm:left-[1.875rem]" />

      <div
        className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-6"
        onClick={() => router.push(`/post/${post.id}`)}
      >
        {/* Avatar */}
        <Link
          href={getProfileUrl(post.authorId, post.authorUsername)}
          className="relative z-10 shrink-0 transition-opacity hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            id={post.authorId}
            name={post.authorName}
            size="sm"
            imageUrl={post.authorProfileImageUrl || undefined}
          />
        </Link>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                href={getProfileUrl(post.authorId, post.authorUsername)}
                className="truncate font-semibold text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {post.authorName}
              </Link>
              {showVerifiedBadge && (
                <VerifiedBadge size="sm" className="-ml-1" />
              )}
              <Link
                href={getProfileUrl(post.authorId, post.authorUsername)}
                className="truncate text-muted-foreground text-xs hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{post.authorUsername || post.authorName}
              </Link>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(post.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            {/* Moderation menu for other users' posts */}
            {user && !isOwnPost && (
              <div onClick={(e) => e.stopPropagation()}>
                <ModerationMenu
                  targetUserId={post.authorId}
                  targetUsername={post.authorUsername || undefined}
                  targetDisplayName={post.authorName}
                  targetProfileImageUrl={
                    post.authorProfileImageUrl || undefined
                  }
                  postId={post.id}
                  isNPC={authorIsNPC}
                />
              </div>
            )}
          </div>

          {/* Content - truncated */}
          <p className="line-clamp-3 text-foreground text-sm">
            <TaggedText text={post.content} />
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Parent comment card - shows in the thread chain above main comment
 * Clickable to navigate to that comment's thread
 */
function ParentCommentCard({
  parent,
  showConnector,
}: {
  parent: ParentComment;
  showConnector: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const showVerifiedBadge = isNpcIdentifier(parent.authorId);
  const isOwnComment = user?.id === parent.authorId;
  const authorIsNPC = isNpcIdentifier(parent.authorId);

  return (
    <div className="relative">
      {/* Connector line - from avatar center down */}
      {showConnector && (
        <div className="absolute top-10 bottom-0 left-[1.625rem] w-0.5 bg-border sm:left-[1.875rem]" />
      )}

      <div
        className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-6"
        onClick={() => router.push(`/comment/${parent.id}`)}
      >
        {/* Avatar */}
        <Link
          href={getProfileUrl(parent.authorId, parent.authorUsername)}
          className="relative z-10 shrink-0 transition-opacity hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            id={parent.authorId}
            name={parent.authorName}
            size="sm"
            imageUrl={parent.authorProfileImageUrl || undefined}
          />
        </Link>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                href={getProfileUrl(parent.authorId, parent.authorUsername)}
                className="truncate font-semibold text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {parent.authorName}
              </Link>
              {showVerifiedBadge && (
                <VerifiedBadge size="sm" className="-ml-1" />
              )}
              <Link
                href={getProfileUrl(parent.authorId, parent.authorUsername)}
                className="truncate text-muted-foreground text-xs hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{parent.authorUsername || parent.authorName}
              </Link>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(parent.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            {/* Moderation menu for other users' comments */}
            {user && !isOwnComment && (
              <div onClick={(e) => e.stopPropagation()}>
                <ModerationMenu
                  targetUserId={parent.authorId}
                  targetUsername={parent.authorUsername || undefined}
                  targetDisplayName={parent.authorName}
                  targetProfileImageUrl={
                    parent.authorProfileImageUrl || undefined
                  }
                  isNPC={authorIsNPC}
                />
              </div>
            )}
          </div>

          {/* Content - truncated for parent chain */}
          <p className="line-clamp-2 text-foreground text-sm">
            <TaggedText text={parent.content} />
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Reply card component for the comment page
 * - Click content = navigate to reply's thread page
 * - Message icon = inline reply
 */
function ReplyCard({
  reply,
  postId,
  onReplySubmit,
}: {
  reply: Reply;
  postId: string;
  onReplySubmit: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const showVerifiedBadge = isNpcIdentifier(reply.authorId);
  const hasReplies = reply.replyCount > 0;
  const [isReplying, setIsReplying] = useState(false);
  const isOwnComment = user?.id === reply.authorId;
  const authorIsNPC = isNpcIdentifier(reply.authorId);

  const handleNavigateToReply = () => {
    router.push(`/comment/${reply.id}`);
  };

  return (
    <div className="flex gap-3 border-border border-b py-4 last:border-b-0">
      {/* Avatar */}
      <Link
        href={getProfileUrl(reply.authorId, reply.authorUsername)}
        className="shrink-0 transition-opacity hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar
          id={reply.authorId}
          name={reply.authorName}
          size="sm"
          imageUrl={reply.authorProfileImageUrl || undefined}
        />
      </Link>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              href={getProfileUrl(reply.authorId, reply.authorUsername)}
              className="truncate font-semibold text-sm hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {reply.authorName}
            </Link>
            {showVerifiedBadge && <VerifiedBadge size="sm" className="-ml-1" />}
            <Link
              href={getProfileUrl(reply.authorId, reply.authorUsername)}
              className="truncate text-muted-foreground text-xs hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{reply.authorUsername || reply.authorName}
            </Link>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(reply.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          {/* Moderation menu for other users' comments */}
          {user && !isOwnComment && (
            <div onClick={(e) => e.stopPropagation()}>
              <ModerationMenu
                targetUserId={reply.authorId}
                targetUsername={reply.authorUsername || undefined}
                targetDisplayName={reply.authorName}
                targetProfileImageUrl={reply.authorProfileImageUrl || undefined}
                isNPC={authorIsNPC}
              />
            </div>
          )}
        </div>

        {/* Reply content - clickable to navigate to thread */}
        <button
          type="button"
          onClick={handleNavigateToReply}
          className="mb-2 w-full cursor-pointer text-left transition-colors hover:text-muted-foreground"
        >
          <p className="whitespace-pre-wrap break-words text-foreground text-sm">
            <TaggedText
              text={reply.content}
              onTagClick={(tag) => {
                if (tag.startsWith('@')) {
                  const username = tag.slice(1);
                  router.push(`/profile/${username}`);
                } else if (tag.startsWith('$')) {
                  const symbol = tag.slice(1);
                  router.push(`/markets?search=${encodeURIComponent(symbol)}`);
                }
              }}
            />
          </p>
        </button>

        {/* Footer actions */}
        <div className="flex items-center gap-1">
          {/* Message icon - reply to this comment */}
          <button
            type="button"
            onClick={() => setIsReplying(!isReplying)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors',
              'text-muted-foreground hover:bg-[#0066FF]/10 hover:text-[#0066FF]',
              isReplying && 'bg-[#0066FF]/10 text-[#0066FF]'
            )}
          >
            <MessageCircle size={14} />
            <span>
              {hasReplies
                ? reply.replyCount >= MAX_REPLY_COUNT
                  ? `${MAX_REPLY_COUNT}+`
                  : reply.replyCount
                : ''}
            </span>
          </button>

          {/* Like button */}
          <LikeButton
            targetId={reply.id}
            targetType="comment"
            initialLiked={reply.isLiked}
            initialCount={reply.likeCount}
            size="sm"
            showCount
          />
        </div>

        {/* Inline reply input */}
        {isReplying && (
          <div className="mt-3">
            <CommentInput
              postId={postId}
              parentCommentId={reply.id}
              placeholder={`Reply to ${reply.authorName}...`}
              replyingToName={reply.authorName}
              autoFocus
              onSubmit={async () => {
                setIsReplying(false);
                onReplySubmit();
              }}
              onCancel={() => setIsReplying(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentPage({ params }: CommentPageProps) {
  const { id: commentId } = use(params);
  const router = useRouter();
  const mainCommentRef = useRef<HTMLDivElement>(null);

  const [comment, setComment] = useState<CommentDetail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [parentChain, setParentChain] = useState<ParentComment[]>([]);
  const [post, setPost] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReplying, setIsReplying] = useState(false);

  const loadComment = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(`/api/comments/${commentId}`);

    if (!response.ok) {
      setError('Comment not found');
      setIsLoading(false);
      return;
    }

    const result = await response.json();
    const data = result.data || result;

    setComment(data.comment);
    setReplies(data.replies || []);
    setParentChain(data.parentChain || []);
    setPost(data.post || null);
    setIsLoading(false);
  }, [commentId]);

  useEffect(() => {
    loadComment();
  }, [loadComment]);

  // Scroll to main comment when loaded (after parent chain)
  useEffect(() => {
    if (
      !isLoading &&
      comment &&
      parentChain.length > 0 &&
      mainCommentRef.current
    ) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        mainCommentRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 50);
    }
  }, [isLoading, comment, parentChain.length]);

  const handleReplySubmit = async (_replyComment: CommentData) => {
    setIsReplying(false);
    // Reload to get fresh data
    await loadComment();
  };

  const { user } = useAuth();
  const showVerifiedBadge = comment ? isNpcIdentifier(comment.authorId) : false;
  const isOwnComment = comment ? user?.id === comment.authorId : false;
  const mainCommentAuthorIsNPC = comment
    ? isNpcIdentifier(comment.authorId)
    : false;

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-feed space-y-4 px-4 py-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !comment) {
    return (
      <PageContainer>
        <div className="flex min-h-screen flex-col items-center justify-center px-4 py-3">
          <div className="text-center">
            <h1 className="mb-2 font-bold text-2xl">Comment Not Found</h1>
            <p className="mb-4 text-muted-foreground">
              {error || 'The comment you are looking for does not exist.'}
            </p>
            <button
              onClick={() => router.push('/feed')}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to Feed
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 shrink-0 border-border border-b bg-background shadow-sm">
          <div className="px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  // Navigate to parent: immediate parent comment > post > feed
                  if (parentChain.length > 0) {
                    router.push(
                      `/comment/${parentChain[parentChain.length - 1]?.id}`
                    );
                  } else if (post) {
                    router.push(`/post/${post.id}`);
                  } else {
                    router.push('/feed');
                  }
                }}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#0066FF]" />
                <h1 className="font-semibold text-lg">Thread</h1>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-feed">
            {/* Original post */}
            {post && <OriginalPostCard post={post} />}

            {/* Parent chain - show all parent comments leading up to this one */}
            {parentChain.length > 0 && (
              <div>
                {parentChain.map((parent, index) => (
                  <ParentCommentCard
                    key={parent.id}
                    parent={parent}
                    showConnector={index < parentChain.length}
                  />
                ))}
              </div>
            )}

            {/* Main comment */}
            <div
              ref={mainCommentRef}
              className="border-border border-b px-4 py-4 sm:px-6"
            >
              <div className="flex gap-3">
                {/* Avatar */}
                <Link
                  href={getProfileUrl(comment.authorId, comment.authorUsername)}
                  className="shrink-0 transition-opacity hover:opacity-80"
                >
                  <Avatar
                    id={comment.authorId}
                    name={comment.authorName}
                    size="md"
                    imageUrl={comment.authorProfileImageUrl || undefined}
                  />
                </Link>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Author info */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Link
                        href={getProfileUrl(
                          comment.authorId,
                          comment.authorUsername
                        )}
                        className="font-semibold hover:underline"
                      >
                        {comment.authorName}
                      </Link>
                      {showVerifiedBadge && (
                        <VerifiedBadge size="sm" className="-ml-1" />
                      )}
                      <Link
                        href={getProfileUrl(
                          comment.authorId,
                          comment.authorUsername
                        )}
                        className="text-muted-foreground text-sm hover:underline"
                      >
                        @{comment.authorUsername || comment.authorName}
                      </Link>
                    </div>
                    {/* Moderation menu for other users' comments */}
                    {user && !isOwnComment && (
                      <ModerationMenu
                        targetUserId={comment.authorId}
                        targetUsername={comment.authorUsername || undefined}
                        targetDisplayName={comment.authorName}
                        targetProfileImageUrl={
                          comment.authorProfileImageUrl || undefined
                        }
                        isNPC={mainCommentAuthorIsNPC}
                      />
                    )}
                  </div>

                  {/* Comment content - larger for main comment */}
                  <div className="mb-3">
                    <p className="whitespace-pre-wrap break-words text-base text-foreground leading-relaxed">
                      <TaggedText
                        text={comment.content}
                        onTagClick={(tag) => {
                          if (tag.startsWith('@')) {
                            const username = tag.slice(1);
                            router.push(`/profile/${username}`);
                          } else if (tag.startsWith('$')) {
                            const symbol = tag.slice(1);
                            router.push(
                              `/markets?search=${encodeURIComponent(symbol)}`
                            );
                          }
                        }}
                      />
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="mb-3 text-muted-foreground text-sm">
                    {new Date(comment.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>

                  {/* Actions - like post page */}
                  <div className="flex items-center gap-1 border-border border-t pt-3">
                    {/* Message icon - reply to main comment */}
                    <button
                      type="button"
                      onClick={() => setIsReplying(!isReplying)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-2 py-1 text-sm transition-colors',
                        'text-muted-foreground hover:bg-[#0066FF]/10 hover:text-[#0066FF]',
                        isReplying && 'bg-[#0066FF]/10 text-[#0066FF]'
                      )}
                    >
                      <MessageCircle size={16} />
                      <span>
                        {comment.replyCount > 0
                          ? comment.replyCount >= MAX_REPLY_COUNT
                            ? `${MAX_REPLY_COUNT}+`
                            : comment.replyCount
                          : ''}
                      </span>
                    </button>

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
                  {isReplying && post && (
                    <div className="mt-4">
                      <CommentInput
                        postId={post.id}
                        parentCommentId={comment.id}
                        placeholder={`Reply to ${comment.authorName}...`}
                        replyingToName={comment.authorName}
                        autoFocus
                        onSubmit={handleReplySubmit}
                        onCancel={() => setIsReplying(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Replies section */}
            <div className="px-4 sm:px-6">
              {replies.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title="No replies yet"
                  description="Be the first to reply!"
                  className="py-12"
                />
              ) : (
                <div>
                  {replies.map((reply) => (
                    <ReplyCard
                      key={reply.id}
                      reply={reply}
                      postId={post?.id || ''}
                      onReplySubmit={loadComment}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

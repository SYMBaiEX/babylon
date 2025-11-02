'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/shared/PageContainer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { EmptyState } from '@/components/shared/EmptyState';
import { PostCard } from '@/components/posts/PostCard';
import { CommentCard } from '@/components/interactions/CommentCard';
import { CommentInput } from '@/components/interactions/CommentInput';
import { useInteractionStore } from '@/stores/interactionStore';
import { useErrorToasts } from '@/hooks/useErrorToasts';
import { ArrowLeft, MessageCircle, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import type { CommentWithReplies } from '@/types/interactions';
import { cn } from '@/lib/utils';

interface PostData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  timestamp: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isShared: boolean;
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params?.id as string;

  const [post, setPost] = useState<PostData | null>(null);
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular'>('newest');

  const { loadComments, editComment, deleteComment } = useInteractionStore();

  // Enable error toast notifications
  useErrorToasts();

  // Load post data
  useEffect(() => {
    const loadPost = async () => {
      if (!postId) return;

      setIsLoading(true);
      try {
        const response = await fetch(`/api/posts/${postId}`);
        
        if (!response.ok) {
          throw new Error('Failed to load post');
        }

        const result = await response.json();
        setPost(result.data);
      } catch (error) {
        logger.error('Failed to load post:', error, 'PostDetailPage');
      } finally {
        setIsLoading(false);
      }
    };

    loadPost();
  }, [postId]);

  // Define loadCommentsData with useCallback to avoid dependency issues
  const loadCommentsData = useCallback(async () => {
    if (!postId) return;

    setIsLoadingComments(true);
    try {
      const loadedComments = await loadComments(postId);
      setComments(loadedComments);
    } catch (error) {
      logger.error('Failed to load comments:', error, 'PostDetailPage');
    } finally {
      setIsLoadingComments(false);
    }
  }, [postId, loadComments]);

  // Load comments on mount
  useEffect(() => {
    loadCommentsData();
  }, [loadCommentsData]);

  const handleEdit = useCallback(async (commentId: string, content: string) => {
    try {
      await editComment(commentId, content);
      // Reload comments to get updated data
      await loadCommentsData();
    } catch (error) {
      logger.error('Failed to edit comment:', error, 'PostDetailPage');
    }
  }, [editComment, loadCommentsData]);

  const handleDelete = useCallback(async (commentId: string) => {
    try {
      await deleteComment(commentId, postId);
      // Remove comment from UI optimistically
      setComments((prev) => removeCommentById(prev, commentId));
    } catch (error) {
      logger.error('Failed to delete comment:', error, 'PostDetailPage');
      // Reload on error to ensure consistency
      await loadCommentsData();
    }
  }, [deleteComment, postId, loadCommentsData]);

  // Recursively remove a comment by ID
  const removeCommentById = (
    commentList: CommentWithReplies[],
    commentId: string
  ): CommentWithReplies[] => {
    return commentList
      .filter((comment) => comment.id !== commentId)
      .map((comment) => ({
        ...comment,
        replies: removeCommentById(comment.replies, commentId),
      }));
  };

  // Sort comments
  const sortedComments = [...comments].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'popular':
        return b.likeCount - a.likeCount;
      default:
        return 0;
    }
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageContainer>
    );
  }

  if (!post) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="Post Not Found"
          description="This post doesn't exist or has been deleted."
          action={{
            label: 'Back to Feed',
            onClick: () => router.push('/feed'),
          }}
        />
      </PageContainer>
    );
  }

  return (
    <ErrorBoundary>
      <PageContainer noPadding className="flex flex-col h-full">
        {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Post</h1>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[600px] mx-auto">
          {/* Post */}
          <PostCard
            post={{
              id: post.id,
              content: post.content,
              authorId: post.authorId,
              authorName: post.authorName,
              timestamp: post.timestamp,
              likeCount: post.likeCount,
              commentCount: post.commentCount,
              shareCount: post.shareCount,
              isLiked: post.isLiked,
              isShared: post.isShared,
            }}
            isDetail
            showInteractions
            className="border-b-4 border-border"
          />

          {/* Comment Input Section */}
          <div className="px-4 py-4 border-b border-border bg-muted/20">
            <CommentInput
              postId={postId}
              placeholder="Post your reply..."
              onSubmit={loadCommentsData}
            />
          </div>

          {/* Comments Section */}
          <div className="bg-background">
            {/* Sort options */}
            {comments.length > 1 && (
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <div className="flex gap-1">
                  {(['newest', 'oldest', 'popular'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSortBy(option)}
                      className={cn(
                        'px-3 py-1 rounded-md text-sm capitalize transition-colors',
                        sortBy === option
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comments List */}
            <div className="px-4 py-4">
              {isLoadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : sortedComments.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title="No replies yet"
                  description="Be the first to reply!"
                />
              ) : (
                <div className="space-y-6">
                  {sortedComments.map((comment) => (
                    <CommentCard
                      key={comment.id}
                      comment={comment}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
    </ErrorBoundary>
  );
}


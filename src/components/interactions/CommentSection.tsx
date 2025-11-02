'use client';

import { cn } from '@/lib/utils';
import { X, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useInteractionStore } from '@/stores/interactionStore';
import { EmptyState } from '@/components/shared/EmptyState';
import { CommentInput } from './CommentInput';
import { CommentCard } from './CommentCard';
import { PostCard } from '@/components/posts/PostCard';
import type { CommentSectionProps } from '@/types/interactions';
import type { CommentWithReplies } from '@/types/interactions';
import { logger } from '@/lib/logger';

export function CommentSection({
  postId,
  isOpen = false,
  onClose,
  className,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [post, setPost] = useState<{
    id: string
    content: string
    authorId: string
    authorName: string
    timestamp: string
    likeCount: number
    commentCount: number
    shareCount: number
    isLiked: boolean
    isShared: boolean
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular'>('newest');

  const { loadComments, editComment, deleteComment } = useInteractionStore();

  // Load post data when opened
  useEffect(() => {
    const loadPostData = async () => {
      if (!isOpen || !postId) return;

      setIsLoadingPost(true);
      try {
        const response = await fetch(`/api/posts/${postId}`);
        if (response.ok) {
          const result = await response.json();
          setPost(result.data);
        }
      } catch (error) {
        logger.error('Failed to load post:', error, 'CommentSection');
      } finally {
        setIsLoadingPost(false);
      }
    };

    loadPostData();
  }, [isOpen, postId]);

  // Load comments when opened
  useEffect(() => {
    if (isOpen && postId) {
      loadCommentsData();
    }
  }, [isOpen, postId]);

  const loadCommentsData = async () => {
    setIsLoading(true);
    try {
      const loadedComments = await loadComments(postId);
      setComments(loadedComments);
    } catch (error) {
      logger.error('Failed to load comments:', error, 'CommentSection');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (commentId: string, content: string) => {
    try {
      await editComment(commentId, content);
      // Reload comments to get updated data
      await loadCommentsData();
    } catch (error) {
      logger.error('Failed to edit comment:', error, 'CommentSection');
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId, postId);
      // Remove comment from UI optimistically
      setComments((prev) => removeCommentById(prev, commentId));
    } catch (error) {
      logger.error('Failed to delete comment:', error, 'CommentSection');
      // Reload on error to ensure consistency
      await loadCommentsData();
    }
  };

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

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Comment panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full sm:max-w-md',
          'bg-background border-l border-border',
          'flex flex-col',
          'animate-in slide-in-from-right duration-300',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} />
            <h2 className="font-semibold text-lg">Post</h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Original Post */}
        {isLoadingPost ? (
          <div className="flex items-center justify-center py-8 border-b border-border">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : post ? (
          <div className="border-b-4 border-border">
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
              showInteractions={true}
              isDetail
            />
          </div>
        ) : null}

        {/* Sort options */}
        {comments.length > 1 && (
          <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
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

        {/* Comment input */}
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <CommentInput
            postId={postId}
            placeholder="Post your reply..."
            onSubmit={async () => {
              // Reload comments after adding new one
              await loadCommentsData();
            }}
          />
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sortedComments.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No comments yet"
              description="Be the first to comment!"
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
    </>
  );
}

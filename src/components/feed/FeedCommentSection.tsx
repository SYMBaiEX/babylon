'use client';

import { cn } from '@/lib/utils';
import { X, MessageCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useInteractionStore } from '@/stores/interactionStore';
import { EmptyState } from '@/components/shared/EmptyState';
import { CommentInput } from '@/components/interactions/CommentInput';
import { CommentCard } from '@/components/interactions/CommentCard';
import { PostCard } from '@/components/posts/PostCard';
import type { CommentWithReplies, CommentData } from '@/types/interactions';
import { logger } from '@/lib/logger';

interface FeedCommentSectionProps {
  postId: string | null;
  postData?: {
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
  };
  onClose?: () => void;
}

export function FeedCommentSection({
  postId,
  postData,
  onClose,
}: FeedCommentSectionProps) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [post, setPost] = useState<{
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
  } | null>(postData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular'>('newest');

  const { loadComments, editComment, deleteComment } = useInteractionStore();

  // Load comments data function - defined before useEffect that uses it
  const loadCommentsData = useCallback(async () => {
    if (!postId) return;
    
    setIsLoading(true);
    try {
      const loadedComments = await loadComments(postId);
      setComments(loadedComments);
    } catch (error) {
      logger.error('Failed to load comments:', error, 'FeedCommentSection');
    } finally {
      setIsLoading(false);
    }
  }, [postId, loadComments]);

  // Load post data when postId changes
  useEffect(() => {
    const loadPostData = async () => {
      if (!postId) {
        setPost(null);
        return;
      }

      // Use provided postData if available
      if (postData) {
        setPost(postData);
        return;
      }

      setIsLoadingPost(true);
      try {
        const response = await fetch(`/api/posts/${postId}`);
        if (response.ok) {
          const result = await response.json();
          setPost(result.data);
        }
      } catch (error) {
        logger.error('Failed to load post:', error, 'FeedCommentSection');
      } finally {
        setIsLoadingPost(false);
      }
    };

    loadPostData();
  }, [postId, postData]);

  // Load comments when postId changes
  useEffect(() => {
    if (postId) {
      loadCommentsData();
    } else {
      setComments([]);
    }
  }, [postId, loadCommentsData]);

  const handleEdit = async (commentId: string, content: string) => {
    try {
      await editComment(commentId, content);
      await loadCommentsData();
    } catch (error) {
      logger.error('Failed to edit comment:', error, 'FeedCommentSection');
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!postId) return;
    
    try {
      await deleteComment(commentId, postId);
      setComments((prev) => removeCommentById(prev, commentId));
    } catch (error) {
      logger.error('Failed to delete comment:', error, 'FeedCommentSection');
      await loadCommentsData();
    }
  };

  // Helper to add a reply to the nested comment structure
  const addReplyToComment = (
    commentList: CommentWithReplies[],
    parentCommentId: string,
    newReply: CommentWithReplies
  ): CommentWithReplies[] => {
    return commentList.map((comment) => {
      if (comment.id === parentCommentId) {
        // Add reply to this comment's replies
        return {
          ...comment,
          replies: [newReply, ...comment.replies],
        };
      } else if (comment.replies.length > 0) {
        // Recursively search in replies
        return {
          ...comment,
          replies: addReplyToComment(comment.replies, parentCommentId, newReply),
        };
      }
      return comment;
    });
  };

  // Helper to find parent comment author name in the comment tree
  const findParentAuthorName = (
    commentList: CommentWithReplies[],
    parentCommentId: string
  ): string | undefined => {
    for (const comment of commentList) {
      if (comment.id === parentCommentId) {
        return comment.userName;
      }
      if (comment.replies.length > 0) {
        const found = findParentAuthorName(comment.replies, parentCommentId);
        if (found) return found;
      }
    }
    return undefined;
  };

  const handleReplySubmit = async (replyComment: CommentData, parentCommentId: string) => {
    if (!postId) return;
    
    // Find parent comment author name
    const parentAuthorName = findParentAuthorName(comments, parentCommentId);
    
    // Convert CommentData to CommentWithReplies format
    const optimisticReply: CommentWithReplies = {
      id: replyComment.id,
      content: replyComment.content,
      createdAt: replyComment.createdAt instanceof Date ? replyComment.createdAt : new Date(replyComment.createdAt),
      updatedAt: replyComment.updatedAt instanceof Date ? replyComment.updatedAt : new Date(replyComment.updatedAt),
      userId: replyComment.authorId,
      userName: replyComment.author?.displayName || replyComment.author?.username || 'Unknown',
      userUsername: replyComment.author?.username || null,
      userAvatar: replyComment.author?.profileImageUrl || undefined,
      parentCommentId: replyComment.parentCommentId,
      parentCommentAuthorName: parentAuthorName,
      likeCount: replyComment._count?.reactions || 0,
      isLiked: false,
      replies: [],
    };

    // Optimistically add reply to nested structure
    setComments((prev) => addReplyToComment(prev, parentCommentId, optimisticReply));

    // Small delay then reload to get full data
    await new Promise(resolve => setTimeout(resolve, 200));
    await loadCommentsData();
  };

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

  if (!postId) {
    return null;
  }

  if (isLoadingPost) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1c9cf0] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground mt-4">Loading post...</p>
      </div>
    );
  }

  if (!post) {
    return null;
  }

  // If onClose is provided, it's a modal (mobile). Otherwise, it's inline (desktop post page)
  const isModal = !!onClose;

  return (
    <>
      {/* Backdrop for modal only */}
      {isModal && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      <div className={cn(
        "flex flex-col w-full overflow-hidden bg-background",
        isModal ? "fixed inset-0 z-50" : "relative"
      )}>
        {/* Header - only show close button in modal */}
        {isModal && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b-2 border-[#1c9cf0] flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#1c9cf0]" />
              <h2 className="font-semibold text-lg text-foreground">Comments</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

      {/* Original Post - Compact (only show in modal, post page shows post separately) */}
      {isModal && (
        <div className="flex-shrink-0 border-b-2 border-[#1c9cf0] bg-background">
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
          className="py-3"
        />
        </div>
      )}

      {/* Sort options */}
      {comments.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-background flex-shrink-0">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <div className="flex gap-1">
            {(['newest', 'oldest', 'popular'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSortBy(option)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs capitalize transition-colors',
                  sortBy === option
                    ? 'bg-[#1c9cf0] text-white'
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
      <div className="px-4 py-3 bg-background flex-shrink-0">
        <CommentInput
          postId={postId}
          placeholder="Post your reply..."
          onSubmit={async (comment) => {
            if (comment) {
              // Optimistically add comment to the list immediately
              // Convert CommentData to CommentWithReplies format
              const optimisticComment: CommentWithReplies = {
                id: comment.id,
                content: comment.content,
                createdAt: comment.createdAt instanceof Date ? comment.createdAt : new Date(comment.createdAt),
                updatedAt: comment.updatedAt instanceof Date ? comment.updatedAt : new Date(comment.updatedAt),
                userId: comment.authorId,
                userName: comment.author?.displayName || comment.author?.username || 'Unknown',
                userUsername: comment.author?.username || null,
                userAvatar: comment.author?.profileImageUrl || undefined,
                parentCommentId: comment.parentCommentId,
                likeCount: comment._count?.reactions || 0,
                isLiked: false,
                replies: [],
              };
              setComments((prev) => {
                // Add to beginning for newest sort
                const updated = [optimisticComment, ...prev];
                return updated;
              });
            }
            // Small delay to ensure API has processed, then reload to get full data
            await new Promise(resolve => setTimeout(resolve, 200));
            await loadCommentsData();
          }}
        />
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-[#1c9cf0] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedComments.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No comments yet"
            description="Be the first to comment!"
          />
        ) : (
          <div className="space-y-4">
            {sortedComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                postId={postId || ''}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReplySubmit={(replyComment) => {
                  if (replyComment.parentCommentId) {
                    handleReplySubmit(replyComment, replyComment.parentCommentId);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}


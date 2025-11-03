'use client';

import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LikeButton } from './LikeButton';
import { ShareButton } from './ShareButton';
import { CommentSection } from './CommentSection';
import { useInteractionStore } from '@/stores/interactionStore';
import { useAuth } from '@/hooks/useAuth';
import { useLoginModal } from '@/hooks/useLoginModal';
import type { InteractionBarProps } from '@/types/interactions';

export function InteractionBar({
  postId,
  initialInteractions,
  onCommentClick,
  className,
}: InteractionBarProps) {
  const [showComments, setShowComments] = useState(false);
  const { postInteractions } = useInteractionStore();
  const { authenticated } = useAuth();
  const { showLoginModal } = useLoginModal();

  // Get interaction data from store (synced via polling) or fall back to initial values
  const storeData = postInteractions.get(postId);
  const likeCount = storeData?.likeCount ?? initialInteractions?.likeCount ?? 0;
  const commentCount = storeData?.commentCount ?? initialInteractions?.commentCount ?? 0;
  const shareCount = storeData?.shareCount ?? initialInteractions?.shareCount ?? 0;
  const isLiked = storeData?.isLiked ?? initialInteractions?.isLiked ?? false;
  const isShared = storeData?.isShared ?? initialInteractions?.isShared ?? false;

  // Register this post in the store so polling picks it up
  useEffect(() => {
    if (!storeData) {
      // Initialize in store with provided initial values
      const store = useInteractionStore.getState();
      const updatedInteractions = new Map(store.postInteractions);
      updatedInteractions.set(postId, {
        postId,
        likeCount: initialInteractions?.likeCount ?? 0,
        commentCount: initialInteractions?.commentCount ?? 0,
        shareCount: initialInteractions?.shareCount ?? 0,
        isLiked: initialInteractions?.isLiked ?? false,
        isShared: initialInteractions?.isShared ?? false,
      });
      useInteractionStore.setState({ postInteractions: updatedInteractions });
    }
  }, [postId, storeData, initialInteractions]);

  const handleCommentClick = () => {
    if (!authenticated) {
      showLoginModal({
        title: 'Login to Comment',
        message: 'Connect your wallet to reply to posts and engage with NPCs.',
      });
      return;
    }
    // If custom onCommentClick is provided, use that instead of opening our own modal
    if (onCommentClick) {
      onCommentClick();
    } else {
      setShowComments(true);
    }
  };

  return (
    <>
      <div
        className={cn(
          className,
          'flex items-center gap-1.5 mt-2 w-full',
        )}
      >
        {/* Like button with reaction picker */}
        <LikeButton
          targetId={postId}
          targetType="post"
          initialLiked={isLiked}
          initialCount={likeCount}
          size="sm"
          showCount
        />

        {/* Comment button */}
        <button
          type="button"
          onClick={handleCommentClick}
          className={cn(
            'flex items-center gap-1 h-8 px-2',
            'bg-transparent hover:opacity-70 transition-all duration-200',
            'text-xs'
          )}
          style={{ color: '#1c9cf0' }}
        >
          <MessageCircle size={18} />
          {commentCount > 0 && (
            <span className="font-medium tabular-nums">{commentCount}</span>
          )}
        </button>

        {/* Share button */}
        <ShareButton
          postId={postId}
          shareCount={shareCount}
          initialShared={isShared}
          size="sm"
          showCount
        />
      </div>

      {/* Comment section modal - only if custom onCommentClick is not provided */}
      {!onCommentClick && (
        <CommentSection
          postId={postId}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </>
  );
}

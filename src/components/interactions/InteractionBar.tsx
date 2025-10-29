'use client';

import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { LikeButton } from './LikeButton';
import { ShareButton } from './ShareButton';
import { CommentSection } from './CommentSection';
import { useInteractionStore } from '@/stores/interactionStore';
import type { InteractionBarProps } from '@/types/interactions';

export function InteractionBar({
  postId,
  initialInteractions,
  onCommentClick,
  className,
}: InteractionBarProps) {
  const [showComments, setShowComments] = useState(false);
  const { postInteractions } = useInteractionStore();

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
    setShowComments(true);
    if (onCommentClick) {
      onCommentClick();
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 mt-2',
          className
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
            'flex items-center gap-1 h-8 px-2 rounded-full',
            'hover:bg-muted transition-all duration-200',
            'text-xs border border-transparent'
          )}
          style={{ color: '#1c9cf0' }}
        >
          <MessageCircle size={14} />
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

      {/* Comment section modal */}
      <CommentSection
        postId={postId}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
      />
    </>
  );
}

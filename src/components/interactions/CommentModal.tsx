'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { CommentInput } from './CommentInput';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername?: string | null;
    authorProfileImageUrl?: string | null;
    timestamp: string;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    isLiked: boolean;
    isShared: boolean;
  } | null;
}

export function CommentModal({ isOpen, onClose, post }: CommentModalProps) {
  if (!isOpen || !post) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
        <div
          className={cn(
            'relative w-full max-w-[600px] bg-background rounded-2xl shadow-2xl',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'max-h-[80vh] flex flex-col'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h2 className="font-semibold text-base">Reply</h2>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Original Post - Compact view without interactions */}
            <div className="px-4 pt-3">
              <PostCard
                post={post}
                showInteractions={false}
                isDetail={false}
              />
            </div>

            {/* Visual thread connector */}
            <div className="px-4">
              <div className="ml-6 border-l-2 border-border h-4" />
            </div>

            {/* Reply Input */}
            <div className="px-4 pb-4">
              <CommentInput
                postId={post.id}
                placeholder="Post your reply..."
                onSubmit={() => {
                  // Close modal and let the post page or feed refresh
                  onClose();
                }}
                autoFocus
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


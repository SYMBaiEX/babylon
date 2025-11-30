'use client';

import { Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@babylon/shared/client';
import { cn } from '@babylon/shared/client';

/**
 * Create post modal component for composing new posts.
 *
 * Provides a modal interface for creating new posts with textarea input,
 * character limit (280 chars), and submit functionality. Handles body scroll
 * lock and escape key to close. Supports both mobile and desktop layouts.
 *
 * Features:
 * - Textarea with character counter
 * - Submit button with loading state
 * - Escape key to close
 * - Body scroll lock when open
 * - Responsive mobile/desktop layouts
 *
 * @param props - CreatePostModal component props
 * @returns Create post modal element or null if not open
 *
 * @example
 * ```tsx
 * <CreatePostModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   onPostCreated={(post) => console.log('Created:', post)}
 * />
 * ```
 */
interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: (post: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername?: string | null;
    authorDisplayName?: string | null;
    authorProfileImageUrl?: string | null;
    timestamp: string;
  }) => void;
}

export function CreatePostModal({
  isOpen,
  onClose,
  onPostCreated,
}: CreatePostModalProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authenticated, user } = useAuth();

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, isSubmitting]);

  // Cleanup on unmount (for HMR)
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authenticated || !user || !content.trim()) return;

    setIsSubmitting(true);
    // Get auth token from window (set by useAuth hook)
    const token =
      typeof window !== 'undefined' ? window.__privyAccessToken : null;

    if (!token) {
      toast.error('Please wait for authentication to complete.');
      setIsSubmitting(false);
      return;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch('/api/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: content.trim(),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setContent('');
      // Pass the created post data to the callback
      if (data.post) {
        onPostCreated?.(data.post);
      }
      onClose();
    } else {
      const error = await response.json();
      logger.error('Failed to create post:', error, 'CreatePostModal');
      toast.error(error.error || 'Failed to create post. Please try again.');
    }
    setIsSubmitting(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Mobile */}
      <div className="fixed inset-x-4 top-20 bottom-auto z-50 flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-border border-b px-6 py-4">
          <div>
            <h2 className="font-semibold text-foreground text-xl">
              Create Post
            </h2>
            <p className="text-muted-foreground text-xs">
              Share your thoughts with Babylon
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close create post modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col px-6 py-6"
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening in Babylon?"
            className={cn(
              'w-full flex-1 rounded-xl px-4 py-3',
              'border border-border bg-background',
              'text-foreground placeholder:text-muted-foreground',
              'resize-none focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
              'transition-colors'
            )}
            rows={5}
            maxLength={280}
          />

          {/* Character count */}
          <div className="mt-3 mb-4 flex items-center justify-between">
            <span
              className={cn(
                'text-sm',
                content.length > 260 ? 'text-red-400' : 'text-muted-foreground'
              )}
            >
              {content.length}/280
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className={cn(
              'w-full rounded-xl px-4 py-3 font-semibold',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200',
              'flex items-center justify-center gap-3'
            )}
          >
            {isSubmitting ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground" />
                <span>Posting...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>Post</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Modal - Desktop */}
      <div className="fixed inset-0 z-50 hidden items-center justify-center p-4 md:flex">
        <div className="flex max-h-[60vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-border border-b px-6 py-4">
            <div>
              <h2 className="font-semibold text-foreground text-xl">
                Create Post
              </h2>
              <p className="text-muted-foreground text-xs">
                Share your thoughts with Babylon
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close create post modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col px-6 py-6"
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening in Babylon?"
              className={cn(
                'w-full flex-1 rounded-xl px-4 py-3',
                'border border-border bg-background',
                'text-foreground placeholder:text-muted-foreground',
                'resize-none focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
                'transition-colors'
              )}
              rows={5}
              maxLength={280}
            />

            {/* Character count */}
            <div className="mt-3 mb-4 flex items-center justify-between">
              <span
                className={cn(
                  'text-sm',
                  content.length > 260
                    ? 'text-red-400'
                    : 'text-muted-foreground'
                )}
              >
                {content.length}/280
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className={cn(
                'w-full rounded-xl px-4 py-3 font-semibold',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-all duration-200',
                'flex items-center justify-center gap-3'
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground" />
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Post</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

'use client';

import { cn, logger } from '@babylon/shared';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/lib/auth';

/**
 * Detect if the user is on macOS for keyboard shortcut display
 */
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    );
  }, []);

  return isMac;
}

/**
 * Inline composer component for creating posts directly in the feed.
 *
 * Displays a compact post composition area at the top of the feed with the
 * user's avatar, expandable textarea, and submit button. Provides a quicker
 * alternative to the full-screen modal for post creation.
 *
 * Features:
 * - User avatar display
 * - Auto-expanding textarea
 * - Character counter (280 limit)
 * - Submit with Enter + Cmd/Ctrl
 * - Loading state during submission
 *
 * @param props - InlineComposer component props
 * @returns Inline composer element
 *
 * @example
 * ```tsx
 * <InlineComposer
 *   onPostCreated={(post) => {
 *     console.log('Created:', post);
 *     addOptimisticPost(post);
 *   }}
 * />
 * ```
 */
interface InlineComposerProps {
  onPostCreated?: (post: {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorUsername?: string | null;
    authorProfileImageUrl?: string | null;
    timestamp: string;
  }) => void;
  className?: string;
}

const MAX_LENGTH = 280;

/**
 * Type guard to validate post response has required fields.
 */
function isValidPostResponse(post: unknown): post is {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorUsername?: string | null;
  authorProfileImageUrl?: string | null;
  timestamp: string;
} {
  if (!post || typeof post !== 'object') return false;
  const p = post as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.content === 'string' &&
    typeof p.authorId === 'string' &&
    typeof p.authorName === 'string' &&
    typeof p.timestamp === 'string'
  );
}

export function InlineComposer({
  onPostCreated,
  className,
}: InlineComposerProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { authenticated, user } = useAuth();
  const isMac = useIsMac();

  const charactersRemaining = MAX_LENGTH - content.length;
  const isOverLimit = charactersRemaining < 0;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    if (!authenticated || !user) {
      toast.error('Please log in to post');
      return;
    }

    setIsSubmitting(true);

    const token = getAuthToken();

    if (!token) {
      toast.error('Please wait for authentication to complete.');
      setIsSubmitting(false);
      return;
    }

    try {
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
        setIsFocused(false);
        toast.success('Post created!');

        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }

        if (isValidPostResponse(data.post)) {
          onPostCreated?.(data.post);
        } else if (data.post) {
          logger.error('Malformed post response from API', { post: data.post }, 'InlineComposer');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData?.error || 'Failed to create post. Please try again.';
        logger.error('Failed to create post:', errorData, 'InlineComposer');
        toast.error(errorMessage);
      }
    } catch (err) {
      logger.error('Error creating post:', { error: err }, 'InlineComposer');
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Auto-expand textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  // Don't render if user is not authenticated
  if (!authenticated || !user) {
    return null;
  }

  return (
    <div
      className={cn(
        'border-border border-b bg-card/50 p-4 transition-colors',
        isFocused && 'bg-card',
        className
      )}
    >
      <div className="flex gap-3">
        {/* User Avatar */}
        <div className="shrink-0">
          <Avatar
            id={user.id}
            name={user.displayName || user.username || 'User'}
            src={user.profileImageUrl || undefined}
            size="md"
          />
        </div>

        {/* Composer Area */}
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => !content && setIsFocused(false)}
            placeholder="What's happening?"
            aria-label="What's happening?"
            aria-describedby="inline-composer-char-count"
            disabled={isSubmitting}
            rows={isFocused || content ? 3 : 1}
            className={cn(
              'w-full resize-none bg-transparent text-foreground placeholder-muted-foreground',
              'border-none outline-none focus:ring-0',
              'text-base leading-relaxed',
              'transition-all duration-200',
              isSubmitting && 'opacity-50'
            )}
          />

          {/* Action Bar - shown when focused or has content */}
          {(isFocused || content) && (
            <div className="mt-3 flex items-center justify-end border-border border-t pt-3">
              <div className="flex items-center gap-3">
                {/* Character Counter */}
                <span
                  id="inline-composer-char-count"
                  role="status"
                  aria-live="polite"
                  aria-label={`${charactersRemaining} characters remaining`}
                  className={cn(
                    'text-sm transition-colors',
                    isOverLimit
                      ? 'font-semibold text-red-500'
                      : charactersRemaining <= 20
                        ? 'text-yellow-500'
                        : 'text-muted-foreground'
                  )}
                >
                  {charactersRemaining}
                </span>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-sm',
                    'transition-all duration-200',
                    canSubmit
                      ? 'bg-[#0066FF] text-white hover:bg-[#0052CC]'
                      : 'cursor-not-allowed bg-muted text-muted-foreground'
                  )}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Posting...
                    </span>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Post
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Keyboard hint - shown when focused */}
          {isFocused && !content && (
            <p className="mt-2 text-muted-foreground text-xs">
              Press{' '}
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {isMac ? '⌘' : 'Ctrl'}
              </kbd>{' '}
              +{' '}
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                Enter
              </kbd>{' '}
              to post
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Game Feedback Modal Component
 *
 * Orchestrates feedback submission flow with sub-components for each feedback type.
 */

'use client';

import { cn, parseJsonString } from '@babylon/shared';
import { Loader2, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/auth';
import {
  BugReportFields,
  DescriptionField,
  FeatureRequestFields,
  type FeedbackType,
  FeedbackTypeSelector,
  getFeedbackTypeConfig,
} from './forms';

interface GameFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'game-feedback-form';
const SCREENSHOT_UPLOAD_TIMEOUT_MS = 30000; // 30 second timeout for screenshot uploads

/**
 * Combines multiple AbortSignals into one that aborts when any signal aborts.
 * Provides a fallback for browsers that don't support AbortSignal.any() (pre-2023).
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  // Use native AbortSignal.any() if available (Chrome 116+, Firefox 124+, Safari 17.4+)
  if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }

  // Fallback for older browsers
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true }
    );
  }
  return controller.signal;
}

/**
 * Sanitizes error messages to prevent exposing sensitive server details.
 * Returns a user-friendly message for display in toast notifications.
 */
function sanitizeErrorMessage(error: unknown): string {
  // Default user-friendly message
  const defaultMessage = 'Something went wrong. Please try again.';

  if (!(error instanceof Error)) {
    return defaultMessage;
  }

  const message = error.message.toLowerCase();

  // Map known error patterns to user-friendly messages
  if (message.includes('network') || message.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Request timed out. Please try again.';
  }
  if (message.includes('abort')) {
    return 'Request was cancelled.';
  }
  if (message.includes('upload')) {
    return 'Failed to upload screenshot. Please try again.';
  }

  // For any other error, return a generic message
  // to avoid exposing potentially sensitive server details
  return defaultMessage;
}

export function GameFeedbackModal({ isOpen, onClose }: GameFeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [rating, setRating] = useState<number>(3);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  // Load form data from sessionStorage on mount
  useEffect(() => {
    if (!isOpen) return;

    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const result = parseJsonString<{
        feedbackType?: FeedbackType;
        description?: string;
        stepsToReproduce?: string;
        rating?: number;
      }>(saved, 'GameFeedbackModal:restoreForm');
      if (result.success && result.data) {
        const parsed = result.data;
        if (parsed.feedbackType) setFeedbackType(parsed.feedbackType);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.stepsToReproduce)
          setStepsToReproduce(parsed.stepsToReproduce);
        if (parsed.rating) setRating(parsed.rating);
      }
    }
  }, [isOpen]);

  // Save form data to sessionStorage
  useEffect(() => {
    if (!isOpen || !feedbackType) return;

    const formData = { feedbackType, description, stepsToReproduce, rating };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [isOpen, feedbackType, description, stepsToReproduce, rating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Cleanup timeout when modal closes
  useEffect(() => {
    if (!isOpen && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setRetryAfter(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const clearFormData = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setFeedbackType(null);
    setDescription('');
    setStepsToReproduce('');
    setRating(3);
    setScreenshot(null);
    setScreenshotPreview(null);
    setScreenshotUrl(null);
    setRetryAfter(null);
  };

  const handleScreenshotChange = (
    file: File | null,
    preview: string | null
  ) => {
    setScreenshot(file);
    setScreenshotPreview(preview);
    if (!file) setScreenshotUrl(null);
  };

  const uploadScreenshot = async (
    signal?: AbortSignal
  ): Promise<string | null> => {
    if (!screenshot) return null;

    const formData = new FormData();
    formData.append('file', screenshot);
    formData.append('type', 'post');

    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Create a timeout signal that aborts after SCREENSHOT_UPLOAD_TIMEOUT_MS
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, SCREENSHOT_UPLOAD_TIMEOUT_MS);

    // Combine the external signal with our timeout signal
    const combinedSignal = signal
      ? combineAbortSignals([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        headers,
        body: formData,
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new Error('Failed to upload screenshot');
      }

      const data = await response.json();
      return data.url;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleSubmit = () => {
    if (!feedbackType) {
      toast.error('Please select a feedback type');
      return;
    }

    if (description.length < 10) {
      toast.error('Please provide a description (at least 10 characters)');
      return;
    }

    if (feedbackType === 'bug' && !stepsToReproduce.trim()) {
      toast.error('Please provide steps to reproduce the bug');
      return;
    }

    if (feedbackType === 'feature_request' && !rating) {
      toast.error('Please provide a rating');
      return;
    }

    startSubmitting(async () => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Track uploaded screenshot URL for cleanup on failure
      let uploadedScreenshotUrl: string | null = null;

      // Helper to cleanup orphaned screenshot on submission failure
      const cleanupOrphanedScreenshot = async (url: string) => {
        const token = getAuthToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        // Fire-and-forget cleanup - don't block on failure
        fetch('/api/upload/image', {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        }).catch(() => {
          // Silently ignore cleanup failures - not critical
        });
      };

      try {
        if (screenshot && feedbackType === 'bug') {
          uploadedScreenshotUrl = await uploadScreenshot(signal);
          if (uploadedScreenshotUrl) setScreenshotUrl(uploadedScreenshotUrl);
        }

        const token = getAuthToken();
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch('/api/feedback/game-feedback', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            feedbackType,
            description: description.trim(),
            stepsToReproduce:
              feedbackType === 'bug' ? stepsToReproduce.trim() : undefined,
            screenshotUrl: uploadedScreenshotUrl || screenshotUrl || undefined,
            rating: feedbackType === 'feature_request' ? rating : undefined,
          }),
          signal,
        });

        if (!response.ok) {
          // Clean up uploaded screenshot if submission failed
          if (uploadedScreenshotUrl) {
            cleanupOrphanedScreenshot(uploadedScreenshotUrl);
          }

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfterSeconds = retryAfterHeader
              ? parseInt(retryAfterHeader, 10)
              : 60;
            setRetryAfter(retryAfterSeconds);

            // Use recursive setTimeout with isOpen check to prevent memory leaks
            const startCountdown = (seconds: number) => {
              // Stop countdown if component is closing
              if (!isOpen || seconds <= 0) {
                setRetryAfter(null);
                return;
              }
              setRetryAfter(seconds);
              timeoutRef.current = setTimeout(() => {
                startCountdown(seconds - 1);
              }, 1000);
            };

            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            startCountdown(retryAfterSeconds);

            toast.error(
              `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`
            );
            return;
          }

          // Don't expose raw server error messages to users
          toast.error('Failed to submit feedback. Please try again.');
          return;
        }

        const data = await response.json();
        toast.success(
          data.message || 'Thank you for your feedback! We appreciate it.'
        );

        clearFormData();
        setTimeout(() => onClose(), 1000);
      } catch (error) {
        // Clean up uploaded screenshot on any error
        if (uploadedScreenshotUrl) {
          cleanupOrphanedScreenshot(uploadedScreenshotUrl);
        }

        // Silently ignore abort errors (user cancelled)
        if (error instanceof Error && error.name === 'AbortError') return;

        // Sanitize error messages before displaying to prevent exposing sensitive info
        toast.error(sanitizeErrorMessage(error));
      }
    });
  };

  const handleClose = () => {
    if (isSubmitting && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onClose();
  };

  const config = feedbackType ? getFeedbackTypeConfig(feedbackType) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-border border-b p-6">
          <div>
            <h2 className="font-bold text-foreground text-xl">Game Feedback</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Help us improve the game
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {!feedbackType ? (
            <FeedbackTypeSelector onSelect={setFeedbackType} />
          ) : (
            <>
              {/* Back button */}
              <button
                onClick={() => setFeedbackType(null)}
                disabled={isSubmitting}
                className="text-muted-foreground text-sm transition-colors hover:text-foreground disabled:opacity-50"
              >
                ← Back to feedback types
              </button>

              {/* Feedback Type Header */}
              {config && (
                <div className="rounded-lg bg-muted/30 p-4">
                  <h3 className="font-semibold text-foreground">
                    {config.title}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {config.description}
                  </p>
                </div>
              )}

              {/* Description (common to all types) */}
              <DescriptionField
                value={description}
                onChange={setDescription}
                feedbackType={feedbackType}
              />

              {/* Bug-specific fields */}
              {feedbackType === 'bug' && (
                <BugReportFields
                  stepsToReproduce={stepsToReproduce}
                  onStepsChange={setStepsToReproduce}
                  screenshotPreview={screenshotPreview}
                  onScreenshotChange={handleScreenshotChange}
                />
              )}

              {/* Feature request-specific fields */}
              {feedbackType === 'feature_request' && (
                <FeatureRequestFields
                  rating={rating}
                  onRatingChange={setRating}
                />
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting || (retryAfter !== null && retryAfter > 0)
                  }
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors',
                    'bg-[#1c9cf0] text-primary-foreground hover:bg-[#1c9cf0]/90',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : retryAfter !== null && retryAfter > 0 ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Rate limited. Retry in {retryAfter}s</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className={cn(
                    'rounded-lg px-4 py-3 font-semibold transition-colors',
                    'bg-muted text-foreground hover:bg-muted/70',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

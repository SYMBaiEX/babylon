/**
 * Game Feedback Modal Component
 *
 * Provides a modal for users to submit general game feedback including:
 * - Bug reports (with steps to reproduce and screenshot upload)
 * - Feature requests (with rating)
 * - Performance issues
 *
 * Features:
 * - Multiple feedback types
 * - Screenshot upload for bug reports
 * - Star rating for feature requests
 * - Form validation
 * - Loading states
 * - Success/error handling
 */

'use client';

import { cn, parseJsonString } from '@babylon/shared';
import {
  Bug,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { StarRatingInput } from './StarRating';

type FeedbackType = 'bug' | 'feature_request' | 'performance';

interface GameFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  // Form persistence key
  const STORAGE_KEY = 'game-feedback-form';

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

    const formData = {
      feedbackType,
      description,
      stepsToReproduce,
      rating,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [isOpen, feedbackType, description, stepsToReproduce, rating]);

  // Clear form data on successful submission
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Cleanup interval when modal closes (prevents memory leak during rate limiting)
  useEffect(() => {
    if (!isOpen && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRetryAfter(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setScreenshot(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(null);
    setScreenshotUrl(null);
  };

  const uploadScreenshot = async (
    signal?: AbortSignal
  ): Promise<string | null> => {
    if (!screenshot) return null;

    const formData = new FormData();
    formData.append('file', screenshot);
    formData.append('type', 'post'); // Use 'post' type for general uploads

    const token =
      typeof window !== 'undefined' ? window.__privyAccessToken : null;
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/upload/image', {
      method: 'POST',
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload screenshot');
    }

    const data = await response.json();
    return data.url;
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
      // Create abort controller for request cancellation
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      let uploadedScreenshotUrl: string | null = null;

      // Upload screenshot if provided (optional - allow submission even if upload fails)
      if (screenshot && feedbackType === 'bug') {
        uploadedScreenshotUrl = await uploadScreenshot(signal).catch(
          (error) => {
            if (error.name === 'AbortError') {
              return null;
            }
            // Log warning but allow submission to continue
            toast.warning(
              'Screenshot upload failed, but you can still submit your feedback'
            );
            return null;
          }
        );
        if (uploadedScreenshotUrl) {
          setScreenshotUrl(uploadedScreenshotUrl);
        }
      }

      const token =
        typeof window !== 'undefined' ? window.__privyAccessToken : null;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

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
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : 60;
          setRetryAfter(retryAfterSeconds);

          // Clear any existing interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }

          // Start countdown timer
          intervalRef.current = setInterval(() => {
            setRetryAfter((prev) => {
              if (prev === null || prev <= 1) {
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                return null;
              }
              return prev - 1;
            });
          }, 1000);

          toast.error(
            `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`
          );
          return;
        }

        let error;
        try {
          error = await response.json();
        } catch {
          error = { error: 'Failed to submit feedback' };
        }
        toast.error(error.error || 'Failed to submit feedback');
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        data = { message: 'Thank you for your feedback! We appreciate it.' };
      }
      toast.success(
        data.message || 'Thank you for your feedback! We appreciate it.'
      );

      // Clear form data and close modal
      clearFormData();

      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    });
  };

  const handleClose = () => {
    if (isSubmitting) {
      // Cancel in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
    // Clear interval if running
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onClose();
  };

  const getFeedbackTypeIcon = (type: FeedbackType) => {
    switch (type) {
      case 'bug':
        return Bug;
      case 'feature_request':
        return MessageSquare;
      case 'performance':
        return Zap;
    }
  };

  const getFeedbackTypeTitle = (type: FeedbackType) => {
    switch (type) {
      case 'bug':
        return 'Report a Bug';
      case 'feature_request':
        return 'Feature Request';
      case 'performance':
        return 'Performance Issue';
    }
  };

  const getFeedbackTypeDescription = (type: FeedbackType) => {
    switch (type) {
      case 'bug':
        return 'Help us fix issues by describing what happened and how to reproduce it.';
      case 'feature_request':
        return 'Tell us what you would like to see or change. How strongly do you feel about this?';
      case 'performance':
        return 'Report performance issues like lag, crashes, or graphical glitches.';
    }
  };

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
          {/* Feedback Type Selection */}
          {!feedbackType ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground text-sm">
                What type of feedback would you like to submit?
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  ['bug', 'feature_request', 'performance'] as FeedbackType[]
                ).map((type) => {
                  const Icon = getFeedbackTypeIcon(type);
                  return (
                    <button
                      key={type}
                      onClick={() => setFeedbackType(type)}
                      className={cn(
                        'flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4',
                        'transition-all hover:border-[#1c9cf0] hover:bg-muted/50',
                        'text-left'
                      )}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1c9cf0]/20">
                        <Icon className="h-6 w-6 text-[#1c9cf0]" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-foreground text-sm">
                          {getFeedbackTypeTitle(type)}
                        </div>
                        <div className="mt-1 text-muted-foreground text-xs">
                          {getFeedbackTypeDescription(type)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
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
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1c9cf0]/20">
                  {(() => {
                    const Icon = getFeedbackTypeIcon(feedbackType);
                    return <Icon className="h-5 w-5 text-[#1c9cf0]" />;
                  })()}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {getFeedbackTypeTitle(feedbackType)}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {getFeedbackTypeDescription(feedbackType)}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label
                  htmlFor="description"
                  className="font-medium text-foreground text-sm"
                >
                  Description{' '}
                  <span className="text-muted-foreground text-xs">
                    (required, min 10 characters)
                  </span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    feedbackType === 'bug'
                      ? 'Describe what happened...'
                      : feedbackType === 'feature_request'
                        ? 'Tell us what you would like to see or change...'
                        : 'Describe the performance issue...'
                  }
                  maxLength={5000}
                  rows={6}
                  className={cn(
                    'w-full rounded-lg border border-border bg-muted px-3 py-2',
                    'text-foreground placeholder-muted-foreground',
                    'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]',
                    'resize-none transition-colors'
                  )}
                />
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Maximum 5000 characters</span>
                  <span>{description.length}/5000</span>
                </div>
              </div>

              {/* Steps to Reproduce (Bug only) */}
              {feedbackType === 'bug' && (
                <div className="space-y-2">
                  <label
                    htmlFor="stepsToReproduce"
                    className="font-medium text-foreground text-sm"
                  >
                    Steps to Reproduce{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    id="stepsToReproduce"
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                    maxLength={2000}
                    rows={5}
                    className={cn(
                      'w-full rounded-lg border border-border bg-muted px-3 py-2',
                      'text-foreground placeholder-muted-foreground',
                      'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1c9cf0]',
                      'resize-none transition-colors'
                    )}
                  />
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Maximum 2000 characters</span>
                    <span>{stepsToReproduce.length}/2000</span>
                  </div>
                </div>
              )}

              {/* Screenshot Upload (Bug only) */}
              {feedbackType === 'bug' && (
                <div className="space-y-2">
                  <label className="font-medium text-foreground text-sm">
                    Screenshot (optional)
                  </label>
                  {screenshotPreview ? (
                    <div className="relative">
                      <img
                        src={screenshotPreview}
                        alt="Screenshot preview"
                        className="max-h-64 w-full rounded-lg border border-border object-contain"
                      />
                      <button
                        onClick={handleRemoveScreenshot}
                        className="absolute top-2 right-2 rounded-full bg-destructive p-2 text-primary-foreground transition-colors hover:bg-destructive/90"
                        aria-label="Remove screenshot"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="screenshot"
                      className={cn(
                        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-border border-dashed bg-muted/30 p-6',
                        'transition-colors hover:border-[#1c9cf0] hover:bg-muted/50'
                      )}
                    >
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      <span className="text-muted-foreground text-sm">
                        Click to upload a screenshot
                      </span>
                      <span className="text-muted-foreground text-xs">
                        PNG, JPG, or GIF (max 10MB)
                      </span>
                      <input
                        id="screenshot"
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Rating (Feature Request only) */}
              {feedbackType === 'feature_request' && (
                <div className="space-y-3">
                  <label className="font-medium text-foreground text-sm">
                    How strongly do you feel about this?{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <StarRatingInput
                    value={rating * 20}
                    onChange={(score) => setRating(score / 20)}
                    showDescriptions={true}
                  />
                </div>
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

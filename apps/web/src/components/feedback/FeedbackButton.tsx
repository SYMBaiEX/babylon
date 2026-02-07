/**
 * Floating Feedback Button Component (Desktop Only)
 *
 * Provides a floating button that appears on all pages to allow users
 * to submit general game feedback. Opens the GameFeedbackModal when clicked.
 *
 * Note: On mobile, the feedback button is shown in the MobileHeader instead.
 *
 * Features:
 * - Fixed position in bottom-right corner (desktop only)
 * - Green color to stand out
 * - Accessible
 * - Only shows when authenticated
 */

'use client';

import { cn } from '@babylon/shared';
import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { GameFeedbackModal } from './GameFeedbackModal';

export function FeedbackButton() {
  const { authenticated } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!authenticated) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={cn(
          // Hidden on mobile (shown in header), visible on desktop
          'hidden md:flex',
          // Fixed position in bottom-right corner
          'fixed right-6 bottom-6 z-[100]',
          'items-center justify-center gap-2',
          // Green color to stand out as feedback
          'bg-emerald-500 hover:bg-emerald-600',
          'font-semibold text-white',
          'rounded-full',
          'transition-all duration-200',
          'shadow-lg hover:scale-105 hover:shadow-xl',
          'h-16 w-16'
        )}
        aria-label="Submit Feedback"
        title="Submit Feedback"
      >
        <MessageSquarePlus className="h-7 w-7" />
      </button>
      <GameFeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

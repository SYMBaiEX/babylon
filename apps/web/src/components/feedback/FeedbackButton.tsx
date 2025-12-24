/**
 * Floating Feedback Button Component
 *
 * Provides a floating button that appears on all pages to allow users
 * to submit general game feedback. Opens the GameFeedbackModal when clicked.
 *
 * Features:
 * - Fixed position (to the left of the post button)
 * - Green color to stand out
 * - Responsive design
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
        onClick={() => setIsModalOpen(true)}
        className={cn(
          // Position to the left of the post button (which is at right-4/right-6)
          'fixed right-20 bottom-20 z-[100] md:right-24 md:bottom-6',
          'flex items-center justify-center gap-2',
          // Green color to stand out as feedback
          'bg-emerald-500 hover:bg-emerald-600',
          'font-semibold text-white',
          'rounded-full',
          'transition-all duration-200',
          'shadow-lg hover:scale-105 hover:shadow-xl',
          'h-14 w-14 md:h-16 md:w-16'
        )}
        aria-label="Submit Feedback"
        title="Submit Feedback"
      >
        <MessageSquarePlus className="h-6 w-6 md:h-7 md:w-7" />
      </button>
      <GameFeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

/**
 * Floating Feedback Button Component
 *
 * Provides a floating button that appears on all pages to allow users
 * to submit general game feedback. Opens the GameFeedbackModal when clicked.
 *
 * Features:
 * - Fixed position (bottom right)
 * - Responsive design
 * - Accessible
 * - Only shows when authenticated
 */

'use client';

import { cn } from '@babylon/shared';
import { MessageSquare } from 'lucide-react';
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
          'fixed right-4 bottom-20 z-[100] md:right-6 md:bottom-6',
          'flex items-center justify-center gap-2',
          'bg-[#1c9cf0] hover:bg-[#1c9cf0]/90',
          'font-semibold text-primary-foreground',
          'rounded-full',
          'transition-all duration-200',
          'shadow-lg hover:scale-105 hover:shadow-xl',
          'h-14 w-14 md:h-16 md:w-16'
        )}
        aria-label="Submit Feedback"
        title="Submit Feedback"
      >
        <MessageSquare className="h-6 w-6 md:h-7 md:w-7" />
      </button>
      <GameFeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

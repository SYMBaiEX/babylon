'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClaimResult } from './types';

const CONFETTI_COLORS = ['#0066FF', '#22c55e', '#eab308', '#a855f7'];
const CONFETTI_COUNT = 50;

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  color: string;
  size: number;
  isCircle: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  claimResult: ClaimResult | null;
}

export function DailyLoginModal({ isOpen, onClose, claimResult }: Props) {
  const [showConfetti, setShowConfetti] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Generate confetti pieces once when modal opens (stable across renders)
  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#0066FF',
      size: 6 + Math.random() * 8,
      isCircle: i % 2 === 0,
    }));
  }, []);

  // Confetti effect
  useEffect(() => {
    if (!isOpen || !claimResult?.success) return;
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [isOpen, claimResult?.success]);

  // Handle ESC key to close modal
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  // Focus management and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Store the currently focused element to restore later
    previousActiveElement.current = document.activeElement;

    // Focus the modal when it opens
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements?.[0];
    const lastFocusable = focusableElements?.[focusableElements.length - 1];

    // Focus the first focusable element (the Continue button)
    firstFocusable?.focus();

    // Add ESC key listener
    document.addEventListener('keydown', handleKeyDown);

    // Focus trap: keep focus within the modal
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab: if on first element, go to last
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleTabKey);

      // Restore focus to the previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !claimResult) return null;

  const {
    streak,
    reward,
    milestoneBonus,
    totalAwarded,
    nextReward,
    daysUntilMilestone,
    nextMilestone,
    streakReset,
  } = claimResult;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      {/* Backdrop - clicking closes modal */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Confetti - animation defined in globals.css */}
      {showConfetti && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {confettiPieces.map((piece) => (
            <div
              key={piece.id}
              style={{
                position: 'absolute',
                left: `${piece.left}%`,
                top: '-10px',
                backgroundColor: piece.color,
                width: piece.size,
                height: piece.size,
                borderRadius: piece.isCircle ? '50%' : 0,
                animation: `confetti-fall 3s ease-out ${piece.delay}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      {/* Modal Content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-login-modal-title"
        aria-describedby="daily-login-modal-description"
        className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-[#0066FF]/30 bg-background p-6 shadow-xl"
      >
        {/* Streak Badge */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0066FF] to-purple-600">
            <span className="font-bold text-3xl text-white">{streak}</span>
          </div>
        </div>

        <h2
          id="daily-login-modal-title"
          className="mb-2 text-center font-bold text-foreground text-xl"
        >
          {streakReset ? 'New Streak Started' : 'Streak Extended'}
        </h2>
        <p
          id="daily-login-modal-description"
          className="mb-6 text-center text-muted-foreground text-sm"
        >
          {streakReset
            ? 'Your streak was reset. Keep claiming daily!'
            : `Day ${streak} complete!`}
        </p>

        {/* Rewards */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <span className="text-foreground text-sm">Daily Reward</span>
            <span className="font-semibold text-[#0066FF]">+{reward} pts</span>
          </div>

          {milestoneBonus > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <span className="text-foreground text-sm">
                {streak}-Day Milestone
              </span>
              <span className="font-semibold text-yellow-500">
                +{milestoneBonus} pts
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-border border-t pt-3">
            <span className="font-medium text-foreground">Total Earned</span>
            <span className="font-bold text-[#0066FF] text-lg">
              +{totalAwarded} pts
            </span>
          </div>
        </div>

        {/* Next Reward */}
        <div className="mb-6 rounded-lg bg-muted/20 p-3 text-center">
          <p className="text-muted-foreground text-xs">
            Tomorrow&apos;s reward
          </p>
          <p className="font-semibold text-foreground">+{nextReward} points</p>
          {daysUntilMilestone > 0 && (
            <p className="mt-1 text-muted-foreground text-xs">
              {daysUntilMilestone} days to {nextMilestone}-day milestone
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-[#0066FF] py-3 font-semibold text-white transition-colors hover:bg-[#0066FF]/90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

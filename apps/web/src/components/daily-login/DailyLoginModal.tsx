'use client';

import { useEffect, useMemo, useState } from 'react';
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

  // Generate confetti pieces once when modal opens (stable across renders)
  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      isCircle: i % 2 === 0,
    }));
  }, []);

  useEffect(() => {
    if (!isOpen || !claimResult?.success) return;
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [isOpen, claimResult?.success]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Confetti - uses inline animation to avoid global CSS injection */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
          <style>
            {`@keyframes confetti-fall {
              0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }`}
          </style>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-[#0066FF]/30 bg-background p-6 shadow-xl">
        {/* Streak Badge */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0066FF] to-purple-600">
            <span className="font-bold text-3xl text-white">{streak}</span>
          </div>
        </div>

        <h2 className="mb-2 text-center font-bold text-foreground text-xl">
          {streakReset ? 'New Streak Started' : 'Streak Extended'}
        </h2>
        <p className="mb-6 text-center text-muted-foreground text-sm">
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

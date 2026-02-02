'use client';

import { useEffect, useState } from 'react';

const CONFETTI_DURATION_MS = 3000;
const CONFETTI_COLORS = ['#0066FF', '#22c55e', '#eab308', '#a855f7'];

interface ClaimResult {
  success: boolean;
  streak: number;
  reward: number;
  milestoneBonus: number;
  totalAwarded: number;
  nextReward: number;
  daysUntilMilestone: number;
  nextMilestone: number;
  streakReset: boolean;
}

interface DailyLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimResult: ClaimResult | null;
}

export function DailyLoginModal({
  isOpen,
  onClose,
  claimResult,
}: DailyLoginModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!isOpen || !claimResult?.success) return;

    setShowConfetti(true);

    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, CONFETTI_DURATION_MS);

    return () => clearTimeout(timer);
  }, [isOpen, claimResult?.success]);

  if (!isOpen || !claimResult) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Confetti */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 50 }, (_, i) => {
            const size = 6 + Math.random() * 8;
            return (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  width: size,
                  height: size,
                  borderRadius: i % 2 === 0 ? '50%' : 0,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Modal Content */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-[#0066FF]/30 bg-background p-6 shadow-xl">
        {/* Streak Badge */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0066FF] to-purple-600">
            <span className="font-bold text-3xl text-white">
              {claimResult.streak}
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-center font-bold text-foreground text-xl">
          {claimResult.streakReset ? 'New Streak Started' : 'Streak Extended'}
        </h2>

        {/* Subtitle */}
        <p className="mb-6 text-center text-muted-foreground text-sm">
          {claimResult.streakReset
            ? 'Your streak was reset. Keep claiming daily!'
            : `Day ${claimResult.streak} complete!`}
        </p>

        {/* Rewards */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <span className="text-foreground text-sm">Daily Reward</span>
            <span className="font-semibold text-[#0066FF]">
              +{claimResult.reward} pts
            </span>
          </div>

          {claimResult.milestoneBonus > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <span className="text-foreground text-sm">
                {claimResult.streak}-Day Milestone
              </span>
              <span className="font-semibold text-yellow-500">
                +{claimResult.milestoneBonus} pts
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-border border-t pt-3">
            <span className="font-medium text-foreground">Total Earned</span>
            <span className="font-bold text-[#0066FF] text-lg">
              +{claimResult.totalAwarded} pts
            </span>
          </div>
        </div>

        {/* Next Reward Preview */}
        <div className="mb-6 rounded-lg bg-muted/20 p-3 text-center">
          <p className="text-muted-foreground text-xs">
            Tomorrow&apos;s reward
          </p>
          <p className="font-semibold text-foreground">
            +{claimResult.nextReward} points
          </p>
          {claimResult.daysUntilMilestone > 0 && (
            <p className="mt-1 text-muted-foreground text-xs">
              {claimResult.daysUntilMilestone} days to{' '}
              {claimResult.nextMilestone}
              -day milestone
            </p>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-[#0066FF] py-3 font-semibold text-white transition-colors hover:bg-[#0066FF]/90"
        >
          Continue
        </button>
      </div>

      <style jsx global>{`
        @keyframes confetti {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

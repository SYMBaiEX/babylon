'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DailyLoginModal } from './DailyLoginModal';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  nextReward: number;
  daysUntilMilestone: number;
  nextMilestone: number;
  lastClaim: string | null;
  canClaim: boolean;
  timeUntilClaim: number;
  timeUntilReset: number;
  totalDailyLogins: number;
}

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
  error?: string;
}

/**
 * Format milliseconds to human readable time
 */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Now';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function DailyStreakCard() {
  const { authenticated, getAccessToken } = useAuth();
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);

  const fetchStreakData = useCallback(async () => {
    if (!authenticated) return;

    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch('/api/users/daily-login', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      setStreakData(data);
    }
    setLoading(false);
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    fetchStreakData();
  }, [fetchStreakData]);

  // Update time remaining every minute
  const canClaim = streakData?.canClaim ?? false;
  useEffect(() => {
    if (canClaim) return;

    const interval = setInterval(() => {
      setStreakData((prev) => {
        if (!prev) return prev;
        const elapsed = 60 * 1000; // 1 minute
        return {
          ...prev,
          timeUntilClaim: Math.max(0, prev.timeUntilClaim - elapsed),
          timeUntilReset: Math.max(0, prev.timeUntilReset - elapsed),
          canClaim: prev.timeUntilClaim - elapsed <= 0,
        };
      });
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [canClaim]);

  const handleClaim = async () => {
    if (!authenticated || claiming) return;

    setClaiming(true);
    const token = await getAccessToken();
    if (!token) {
      setClaiming(false);
      return;
    }

    const response = await fetch('/api/users/daily-login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const result: ClaimResult = await response.json();

    if (result.success) {
      setClaimResult(result);
      setShowModal(true);
      // Refresh streak data
      await fetchStreakData();
    } else if (result.error) {
      toast.error(result.error);
    }

    setClaiming(false);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setClaimResult(null);
  };

  if (!authenticated || loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 h-5 w-32 animate-pulse rounded bg-muted/50" />
        <div className="mb-4 h-8 w-24 animate-pulse rounded bg-muted/50" />
        <div className="h-10 w-full animate-pulse rounded bg-muted/50" />
      </div>
    );
  }

  if (!streakData) return null;

  // Calculate progress to next milestone
  const milestoneProgress =
    streakData.nextMilestone > 0
      ? ((streakData.nextMilestone - streakData.daysUntilMilestone) /
          streakData.nextMilestone) *
        100
      : 100;

  return (
    <>
      <div className="rounded-lg border border-[#0066FF]/30 bg-gradient-to-r from-[#0066FF]/10 to-purple-500/10 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-foreground text-lg">Daily Rewards</h2>
            <p className="text-muted-foreground text-sm">
              Claim daily to build your streak
            </p>
          </div>
          <div className="text-right">
            <div className="font-bold text-2xl text-foreground">
              {streakData.currentStreak}
            </div>
            <div className="text-muted-foreground text-xs">day streak</div>
          </div>
        </div>

        {/* Streak Stats */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-background/50 p-2 text-center">
            <div className="font-semibold text-foreground text-sm">
              +{streakData.nextReward}
            </div>
            <div className="text-muted-foreground text-xs">Next Reward</div>
          </div>
          <div className="rounded-lg bg-background/50 p-2 text-center">
            <div className="font-semibold text-foreground text-sm">
              {streakData.longestStreak}
            </div>
            <div className="text-muted-foreground text-xs">Best Streak</div>
          </div>
          <div className="rounded-lg bg-background/50 p-2 text-center">
            <div className="font-semibold text-foreground text-sm">
              {streakData.totalDailyLogins}
            </div>
            <div className="text-muted-foreground text-xs">Total Claims</div>
          </div>
        </div>

        {/* Milestone Progress */}
        {streakData.nextMilestone > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Next milestone: {streakData.nextMilestone} days
              </span>
              <span className="text-foreground">
                {streakData.daysUntilMilestone} days left
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-[#0066FF] transition-all duration-300"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Claim Button */}
        {streakData.canClaim ? (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full rounded-lg bg-[#0066FF] py-3 font-semibold text-white transition-colors hover:bg-[#0066FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {claiming
              ? 'Claiming...'
              : `Claim +${streakData.nextReward} Points`}
          </button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
            <div className="font-medium text-foreground text-sm">
              Next claim in {formatTimeRemaining(streakData.timeUntilClaim)}
            </div>
            {streakData.timeUntilReset > 0 && (
              <div className="text-muted-foreground text-xs">
                Streak expires in{' '}
                {formatTimeRemaining(streakData.timeUntilReset)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Claim Success Modal */}
      <DailyLoginModal
        isOpen={showModal}
        onClose={handleModalClose}
        claimResult={claimResult}
      />
    </>
  );
}

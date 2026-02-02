'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DailyLoginModal } from './DailyLoginModal';
import { formatTimeRemaining, type ClaimResult, type StreakData } from './types';

const STAT_ITEMS = [
  { key: 'nextReward', label: 'Next Reward', format: (v: number) => `+${v}` },
  { key: 'longestStreak', label: 'Best Streak', format: (v: number) => v },
  { key: 'totalDailyLogins', label: 'Total Claims', format: (v: number) => v },
] as const;

export function DailyStreakCard() {
  const { authenticated, getAccessToken } = useAuth();
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [modal, setModal] = useState<ClaimResult | null>(null);

  const fetchData = useCallback(async () => {
    if (!authenticated) return;
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch('/api/users/daily-login', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [authenticated, getAccessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Countdown timer - updates every minute when user can't claim
  const canClaim = data?.canClaim ?? false;
  useEffect(() => {
    if (canClaim) return;
    const id = setInterval(() => {
      setData((prev) => {
        if (!prev) return prev;
        const elapsed = 60_000;
        const timeUntilClaim = Math.max(0, prev.timeUntilClaim - elapsed);
        return {
          ...prev,
          timeUntilClaim,
          timeUntilReset: Math.max(0, prev.timeUntilReset - elapsed),
          canClaim: timeUntilClaim <= 0,
        };
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [canClaim]);

  const handleClaim = async () => {
    if (!authenticated || claiming) return;
    setClaiming(true);

    const token = await getAccessToken();
    if (!token) { setClaiming(false); return; }

    const res = await fetch('/api/users/daily-login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result: ClaimResult = await res.json();

    if (result.success) {
      setModal(result);
      await fetchData();
    } else if (result.error) {
      toast.error(result.error);
    }
    setClaiming(false);
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

  if (!data) return null;

  const progress = data.nextMilestone > 0
    ? ((data.nextMilestone - data.daysUntilMilestone) / data.nextMilestone) * 100
    : 100;

  return (
    <>
      <div className="rounded-lg border border-[#0066FF]/30 bg-gradient-to-r from-[#0066FF]/10 to-purple-500/10 p-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-foreground text-lg">Daily Rewards</h2>
            <p className="text-muted-foreground text-sm">Claim daily to build your streak</p>
          </div>
          <div className="text-right">
            <div className="font-bold text-2xl text-foreground">{data.currentStreak}</div>
            <div className="text-muted-foreground text-xs">day streak</div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {STAT_ITEMS.map(({ key, label, format }) => (
            <div key={key} className="rounded-lg bg-background/50 p-2 text-center">
              <div className="font-semibold text-foreground text-sm">
                {format(data[key])}
              </div>
              <div className="text-muted-foreground text-xs">{label}</div>
            </div>
          ))}
        </div>

        {/* Milestone Progress */}
        {data.nextMilestone > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Next milestone: {data.nextMilestone} days
              </span>
              <span className="text-foreground">{data.daysUntilMilestone} days left</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-[#0066FF] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action */}
        {data.canClaim ? (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full rounded-lg bg-[#0066FF] py-3 font-semibold text-white transition-colors hover:bg-[#0066FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {claiming ? 'Claiming...' : `Claim +${data.nextReward} Points`}
          </button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
            <div className="font-medium text-foreground text-sm">
              Next claim in {formatTimeRemaining(data.timeUntilClaim)}
            </div>
            {data.timeUntilReset > 0 && (
              <div className="text-muted-foreground text-xs">
                Streak expires in {formatTimeRemaining(data.timeUntilReset)}
              </div>
            )}
          </div>
        )}
      </div>

      <DailyLoginModal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        claimResult={modal}
      />
    </>
  );
}

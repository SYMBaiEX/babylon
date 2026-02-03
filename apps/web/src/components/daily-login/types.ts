/**
 * Shared types for daily login components
 */

export interface StreakData {
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

export interface ClaimResult {
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

/** Format milliseconds to human-readable "Xh Xm" */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Now';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

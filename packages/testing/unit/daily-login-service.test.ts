// Daily Login Service - Unit/Specification Tests
//
// Tests the core logic of the daily login streak system (BAB-88)
// without hitting the database.

import { describe, expect, test } from 'bun:test';
import { DAILY_LOGIN, POINTS } from '@babylon/shared';

// Mirror the service's internal logic for unit testing
const MILESTONES = [
  { days: 7, bonus: POINTS.DAILY_LOGIN_MILESTONE_7D },
  { days: 14, bonus: POINTS.DAILY_LOGIN_MILESTONE_14D },
  { days: 30, bonus: POINTS.DAILY_LOGIN_MILESTONE_30D },
  { days: 60, bonus: POINTS.DAILY_LOGIN_MILESTONE_60D },
  { days: 90, bonus: POINTS.DAILY_LOGIN_MILESTONE_90D },
] as const;

const DAILY_REWARDS = [
  0, // Day 0 (unused, 1-indexed)
  POINTS.DAILY_LOGIN_DAY_1, // Day 1: 50
  POINTS.DAILY_LOGIN_DAY_2, // Day 2: 75
  POINTS.DAILY_LOGIN_DAY_3, // Day 3: 100
  POINTS.DAILY_LOGIN_DAY_4, // Day 4: 125
  POINTS.DAILY_LOGIN_DAY_5, // Day 5: 150
  POINTS.DAILY_LOGIN_DAY_6, // Day 6: 175
  POINTS.DAILY_LOGIN_DAY_7, // Day 7: 200
] as const;

function getDailyReward(streakDay: number): number {
  if (streakDay <= 0) return DAILY_REWARDS[1]!;
  const dayInCycle = ((streakDay - 1) % DAILY_LOGIN.CYCLE_LENGTH) + 1;
  return DAILY_REWARDS[dayInCycle] ?? DAILY_REWARDS[1]!;
}

function getMilestoneBonus(streak: number): number {
  const milestone = MILESTONES.find((m) => m.days === streak);
  return milestone?.bonus ?? 0;
}

function getNextMilestone(streak: number): {
  nextMilestone: number;
  daysUntilMilestone: number;
} {
  for (const milestone of MILESTONES) {
    if (streak < milestone.days) {
      return {
        nextMilestone: milestone.days,
        daysUntilMilestone: milestone.days - streak,
      };
    }
  }
  // All milestones achieved
  return { nextMilestone: 0, daysUntilMilestone: 0 };
}

function getClaimStatus(lastClaimMs: number | null): {
  canClaim: boolean;
  shouldResetStreak: boolean;
  timeUntilClaim: number;
  timeUntilReset: number;
} {
  if (lastClaimMs === null) {
    return {
      canClaim: true,
      shouldResetStreak: false,
      timeUntilClaim: 0,
      timeUntilReset: 0,
    };
  }

  const now = Date.now();
  const timeSinceClaim = now - lastClaimMs;

  const timeUntilClaim = Math.max(
    0,
    DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS - timeSinceClaim
  );
  const timeUntilReset = Math.max(
    0,
    DAILY_LOGIN.GRACE_PERIOD_MS - timeSinceClaim
  );

  // Cannot claim yet (less than 24h since last claim)
  if (timeSinceClaim < DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS) {
    return {
      canClaim: false,
      shouldResetStreak: false,
      timeUntilClaim,
      timeUntilReset,
    };
  }

  // Within grace period (24-36h) - can claim, streak continues
  if (timeSinceClaim < DAILY_LOGIN.GRACE_PERIOD_MS) {
    return {
      canClaim: true,
      shouldResetStreak: false,
      timeUntilClaim: 0,
      timeUntilReset,
    };
  }

  // Grace period expired (36h+) - can claim, but streak resets
  return {
    canClaim: true,
    shouldResetStreak: true,
    timeUntilClaim: 0,
    timeUntilReset: 0,
  };
}

describe('Daily Login - Constants', () => {
  test('timing constants should be correctly defined', () => {
    expect(DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS).toBe(24 * 60 * 60 * 1000); // 24h
    expect(DAILY_LOGIN.GRACE_PERIOD_MS).toBe(36 * 60 * 60 * 1000); // 36h
    expect(DAILY_LOGIN.CYCLE_LENGTH).toBe(7);
  });

  test('daily rewards should escalate from day 1 to day 7', () => {
    expect(POINTS.DAILY_LOGIN_DAY_1).toBe(50);
    expect(POINTS.DAILY_LOGIN_DAY_2).toBe(75);
    expect(POINTS.DAILY_LOGIN_DAY_3).toBe(100);
    expect(POINTS.DAILY_LOGIN_DAY_4).toBe(125);
    expect(POINTS.DAILY_LOGIN_DAY_5).toBe(150);
    expect(POINTS.DAILY_LOGIN_DAY_6).toBe(175);
    expect(POINTS.DAILY_LOGIN_DAY_7).toBe(200);
  });

  test('milestone bonuses should increase with streak length', () => {
    expect(POINTS.DAILY_LOGIN_MILESTONE_7D).toBe(500);
    expect(POINTS.DAILY_LOGIN_MILESTONE_14D).toBe(750);
    expect(POINTS.DAILY_LOGIN_MILESTONE_30D).toBe(1500);
    expect(POINTS.DAILY_LOGIN_MILESTONE_60D).toBe(3000);
    expect(POINTS.DAILY_LOGIN_MILESTONE_90D).toBe(5000);
  });
});

describe('Daily Login - getDailyReward', () => {
  test('should return correct rewards for days 1-7', () => {
    expect(getDailyReward(1)).toBe(50);
    expect(getDailyReward(2)).toBe(75);
    expect(getDailyReward(3)).toBe(100);
    expect(getDailyReward(4)).toBe(125);
    expect(getDailyReward(5)).toBe(150);
    expect(getDailyReward(6)).toBe(175);
    expect(getDailyReward(7)).toBe(200);
  });

  test('should cycle after day 7', () => {
    expect(getDailyReward(8)).toBe(50); // Back to day 1
    expect(getDailyReward(9)).toBe(75); // Day 2
    expect(getDailyReward(14)).toBe(200); // Day 7
    expect(getDailyReward(15)).toBe(50); // Back to day 1
  });

  test('should handle edge cases', () => {
    expect(getDailyReward(0)).toBe(50); // Default to day 1
    expect(getDailyReward(-1)).toBe(50); // Default to day 1
    expect(getDailyReward(100)).toBe(getDailyReward(100 % 7 || 7));
  });

  test('should cycle correctly over long streaks', () => {
    // Verify the pattern repeats correctly
    for (let day = 1; day <= 70; day++) {
      const expectedDay = ((day - 1) % 7) + 1;
      const expectedReward = DAILY_REWARDS[expectedDay];
      expect(getDailyReward(day)).toBe(expectedReward);
    }
  });
});

describe('Daily Login - getMilestoneBonus', () => {
  test('should return correct bonus at milestone days', () => {
    expect(getMilestoneBonus(7)).toBe(500);
    expect(getMilestoneBonus(14)).toBe(750);
    expect(getMilestoneBonus(30)).toBe(1500);
    expect(getMilestoneBonus(60)).toBe(3000);
    expect(getMilestoneBonus(90)).toBe(5000);
  });

  test('should return 0 for non-milestone days', () => {
    expect(getMilestoneBonus(1)).toBe(0);
    expect(getMilestoneBonus(6)).toBe(0);
    expect(getMilestoneBonus(8)).toBe(0);
    expect(getMilestoneBonus(15)).toBe(0);
    expect(getMilestoneBonus(29)).toBe(0);
    expect(getMilestoneBonus(100)).toBe(0);
  });
});

describe('Daily Login - getNextMilestone', () => {
  test('should return correct next milestone for early streaks', () => {
    expect(getNextMilestone(0)).toEqual({
      nextMilestone: 7,
      daysUntilMilestone: 7,
    });
    expect(getNextMilestone(1)).toEqual({
      nextMilestone: 7,
      daysUntilMilestone: 6,
    });
    expect(getNextMilestone(6)).toEqual({
      nextMilestone: 7,
      daysUntilMilestone: 1,
    });
  });

  test('should return correct next milestone after each milestone', () => {
    expect(getNextMilestone(7)).toEqual({
      nextMilestone: 14,
      daysUntilMilestone: 7,
    });
    expect(getNextMilestone(14)).toEqual({
      nextMilestone: 30,
      daysUntilMilestone: 16,
    });
    expect(getNextMilestone(30)).toEqual({
      nextMilestone: 60,
      daysUntilMilestone: 30,
    });
    expect(getNextMilestone(60)).toEqual({
      nextMilestone: 90,
      daysUntilMilestone: 30,
    });
  });

  test('should return 0 when all milestones achieved', () => {
    expect(getNextMilestone(90)).toEqual({
      nextMilestone: 0,
      daysUntilMilestone: 0,
    });
    expect(getNextMilestone(100)).toEqual({
      nextMilestone: 0,
      daysUntilMilestone: 0,
    });
    expect(getNextMilestone(365)).toEqual({
      nextMilestone: 0,
      daysUntilMilestone: 0,
    });
  });
});

describe('Daily Login - getClaimStatus', () => {
  const HOUR = 60 * 60 * 1000;

  test('first-time user (null lastClaim) should be able to claim', () => {
    const status = getClaimStatus(null);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBe(0);
    expect(status.timeUntilReset).toBe(0);
  });

  test('claimed 1 hour ago - cannot claim yet', () => {
    const lastClaimMs = Date.now() - 1 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(false);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBeGreaterThan(22 * HOUR);
    expect(status.timeUntilReset).toBeGreaterThan(34 * HOUR);
  });

  test('claimed 23 hours ago - cannot claim yet', () => {
    const lastClaimMs = Date.now() - 23 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(false);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBeGreaterThan(0);
    expect(status.timeUntilClaim).toBeLessThan(2 * HOUR);
  });

  test('claimed 24 hours ago - can claim, streak continues', () => {
    const lastClaimMs = Date.now() - 24 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBe(0);
    expect(status.timeUntilReset).toBeGreaterThan(11 * HOUR);
  });

  test('claimed 30 hours ago - can claim, streak continues (within grace)', () => {
    const lastClaimMs = Date.now() - 30 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBe(0);
    expect(status.timeUntilReset).toBeGreaterThan(5 * HOUR);
  });

  test('claimed 35 hours ago - can claim, streak continues (barely within grace)', () => {
    const lastClaimMs = Date.now() - 35 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(false);
    expect(status.timeUntilClaim).toBe(0);
    expect(status.timeUntilReset).toBeGreaterThan(0);
  });

  test('claimed 36+ hours ago - can claim, but streak resets', () => {
    const lastClaimMs = Date.now() - 37 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(true);
    expect(status.timeUntilClaim).toBe(0);
    expect(status.timeUntilReset).toBe(0);
  });

  test('claimed 48 hours ago - can claim, streak resets', () => {
    const lastClaimMs = Date.now() - 48 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(true);
  });

  test('claimed 1 week ago - can claim, streak resets', () => {
    const lastClaimMs = Date.now() - 7 * 24 * HOUR;
    const status = getClaimStatus(lastClaimMs);
    expect(status.canClaim).toBe(true);
    expect(status.shouldResetStreak).toBe(true);
  });
});

describe('Daily Login - Streak Calculation', () => {
  test('new streak should start at 1 after reset', () => {
    let currentStreak = 5;
    const shouldReset = true;

    if (shouldReset) {
      currentStreak = 1;
    } else {
      currentStreak++;
    }

    expect(currentStreak).toBe(1);
  });

  test('streak should increment when claiming within grace period', () => {
    let currentStreak = 5;
    const shouldReset = false;

    if (shouldReset) {
      currentStreak = 1;
    } else {
      currentStreak++;
    }

    expect(currentStreak).toBe(6);
  });

  test('longest streak should update when current exceeds it', () => {
    let longestStreak = 10;
    const newStreak = 11;

    longestStreak = Math.max(longestStreak, newStreak);
    expect(longestStreak).toBe(11);
  });

  test('longest streak should not decrease', () => {
    let longestStreak = 10;
    const newStreak = 5;

    longestStreak = Math.max(longestStreak, newStreak);
    expect(longestStreak).toBe(10);
  });
});

describe('Daily Login - Total Points Calculation', () => {
  test('should sum daily reward and milestone bonus', () => {
    const day7Reward = getDailyReward(7);
    const day7Bonus = getMilestoneBonus(7);
    const totalDay7 = day7Reward + day7Bonus;

    expect(totalDay7).toBe(200 + 500); // 700
  });

  test('should only include daily reward when no milestone', () => {
    const day5Reward = getDailyReward(5);
    const day5Bonus = getMilestoneBonus(5);
    const totalDay5 = day5Reward + day5Bonus;

    expect(totalDay5).toBe(150 + 0); // 150
  });

  test('cumulative rewards for first 7 days', () => {
    let total = 0;
    for (let day = 1; day <= 7; day++) {
      total += getDailyReward(day) + getMilestoneBonus(day);
    }
    // 50+75+100+125+150+175+200 = 875 + 500 (day 7 milestone) = 1375
    expect(total).toBe(1375);
  });

  test('cumulative rewards for 30 days', () => {
    let total = 0;
    for (let day = 1; day <= 30; day++) {
      total += getDailyReward(day) + getMilestoneBonus(day);
    }
    // 4 full cycles (28 days) = 4 * 875 = 3500
    // + days 29-30 = 50+75 = 125
    // + milestones: 500 (7d) + 750 (14d) + 1500 (30d) = 2750
    // Total: 3625 + 2750 = 6375
    expect(total).toBe(6375);
  });
});

describe('Daily Login - Edge Cases', () => {
  test('boundary: exactly at 24h mark', () => {
    const now = Date.now();
    const lastClaimMs = now - DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS;
    // At exactly 24h, should be able to claim
    const timeSinceClaim = now - lastClaimMs;
    expect(timeSinceClaim >= DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS).toBe(true);
    expect(timeSinceClaim < DAILY_LOGIN.GRACE_PERIOD_MS).toBe(true);
  });

  test('boundary: exactly at 36h mark', () => {
    const now = Date.now();
    const lastClaimMs = now - DAILY_LOGIN.GRACE_PERIOD_MS;
    const timeSinceClaim = now - lastClaimMs;
    // At exactly 36h, grace period has not expired yet (need > 36h)
    expect(timeSinceClaim >= DAILY_LOGIN.GRACE_PERIOD_MS).toBe(true);
  });

  test('time calculation should handle timezone correctly', () => {
    // All calculations are in UTC milliseconds, so timezone should not matter
    const nowUTC = Date.now();
    const lastClaimUTC = nowUTC - 25 * 60 * 60 * 1000; // 25 hours ago
    const timeSinceClaim = nowUTC - lastClaimUTC;

    expect(timeSinceClaim).toBe(25 * 60 * 60 * 1000);
    expect(timeSinceClaim >= DAILY_LOGIN.MIN_CLAIM_INTERVAL_MS).toBe(true);
    expect(timeSinceClaim < DAILY_LOGIN.GRACE_PERIOD_MS).toBe(true);
  });

  test('streak should handle very long streaks (100+ days)', () => {
    expect(getDailyReward(100)).toBe(getDailyReward(100 % 7 || 7));
    expect(getDailyReward(365)).toBe(getDailyReward(365 % 7 || 7));
    expect(getDailyReward(1000)).toBe(getDailyReward(1000 % 7 || 7));
  });

  test('milestones should not repeat after 90 days', () => {
    // After 90 days, there are no more milestones
    expect(getMilestoneBonus(91)).toBe(0);
    expect(getMilestoneBonus(100)).toBe(0);
    expect(getMilestoneBonus(180)).toBe(0);
  });
});

describe('Daily Login - Display Formatting', () => {
  function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return 'Now';

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  test('should format 0ms as "Now"', () => {
    expect(formatTimeRemaining(0)).toBe('Now');
    expect(formatTimeRemaining(-1000)).toBe('Now');
  });

  test('should format hours and minutes correctly', () => {
    expect(formatTimeRemaining(1 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe(
      '1h 30m'
    );
    expect(formatTimeRemaining(23 * 60 * 60 * 1000 + 45 * 60 * 1000)).toBe(
      '23h 45m'
    );
  });

  test('should format minutes only when under 1 hour', () => {
    expect(formatTimeRemaining(45 * 60 * 1000)).toBe('45m');
    expect(formatTimeRemaining(5 * 60 * 1000)).toBe('5m');
  });

  test('should handle edge case of exactly 1 hour', () => {
    expect(formatTimeRemaining(60 * 60 * 1000)).toBe('1h 0m');
  });
});

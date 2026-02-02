/**
 * Daily Login Service
 *
 * Manages daily login rewards and streak tracking (BAB-88).
 * - 24h minimum between claims
 * - 36h grace period before streak resets
 * - Escalating rewards Day 1-7, then cycles
 * - Milestone bonuses at 7, 14, 30, 60, 90 days
 */

import { balanceTransactions, db, eq, sql, users } from '@babylon/db';
import {
  DAILY_LOGIN,
  generateSnowflakeId,
  isValidSnowflakeId,
  logger,
  POINTS,
} from '@babylon/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  nextReward: number;
  daysUntilMilestone: number;
  nextMilestone: number;
  lastClaim: Date | null;
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

interface ClaimStatus {
  canClaim: boolean;
  shouldResetStreak: boolean;
  timeUntilClaim: number;
  timeUntilReset: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MILESTONES = [
  { days: 7, bonus: POINTS.DAILY_LOGIN_MILESTONE_7D },
  { days: 14, bonus: POINTS.DAILY_LOGIN_MILESTONE_14D },
  { days: 30, bonus: POINTS.DAILY_LOGIN_MILESTONE_30D },
  { days: 60, bonus: POINTS.DAILY_LOGIN_MILESTONE_60D },
  { days: 90, bonus: POINTS.DAILY_LOGIN_MILESTONE_90D },
] as const;

const DAILY_REWARDS = [
  POINTS.DAILY_LOGIN_DAY_1, // index 0 = Day 1
  POINTS.DAILY_LOGIN_DAY_2,
  POINTS.DAILY_LOGIN_DAY_3,
  POINTS.DAILY_LOGIN_DAY_4,
  POINTS.DAILY_LOGIN_DAY_5,
  POINTS.DAILY_LOGIN_DAY_6,
  POINTS.DAILY_LOGIN_DAY_7,
] as const;

// ─── Helper Functions (exported for testing) ─────────────────────────────────

export function getDailyReward(streakDay: number): number {
  const idx = Math.max(0, streakDay - 1) % DAILY_LOGIN.CYCLE_LENGTH;
  return DAILY_REWARDS[idx] ?? DAILY_REWARDS[0];
}

export function getMilestoneBonus(streak: number): number {
  return MILESTONES.find((m) => m.days === streak)?.bonus ?? 0;
}

export function getNextMilestone(streak: number): {
  nextMilestone: number;
  daysUntilMilestone: number;
} {
  const next = MILESTONES.find((m) => streak < m.days);
  return next
    ? { nextMilestone: next.days, daysUntilMilestone: next.days - streak }
    : { nextMilestone: 0, daysUntilMilestone: 0 };
}

export function getClaimStatus(lastClaim: Date | null): ClaimStatus {
  if (!lastClaim) {
    return {
      canClaim: true,
      shouldResetStreak: false,
      timeUntilClaim: 0,
      timeUntilReset: 0,
    };
  }

  const elapsed = Date.now() - lastClaim.getTime();
  const { MIN_CLAIM_INTERVAL_MS, GRACE_PERIOD_MS } = DAILY_LOGIN;

  if (elapsed < MIN_CLAIM_INTERVAL_MS) {
    return {
      canClaim: false,
      shouldResetStreak: false,
      timeUntilClaim: MIN_CLAIM_INTERVAL_MS - elapsed,
      timeUntilReset: GRACE_PERIOD_MS - elapsed,
    };
  }

  if (elapsed < GRACE_PERIOD_MS) {
    return {
      canClaim: true,
      shouldResetStreak: false,
      timeUntilClaim: 0,
      timeUntilReset: GRACE_PERIOD_MS - elapsed,
    };
  }

  return {
    canClaim: true,
    shouldResetStreak: true,
    timeUntilClaim: 0,
    timeUntilReset: 0,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DailyLoginService {
  private static validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId: must be a non-empty string');
    }
    if (!isValidSnowflakeId(userId)) {
      throw new Error(`Invalid userId format: ${userId}`);
    }
  }

  static async getStreakInfo(userId: string): Promise<StreakInfo> {
    this.validateUserId(userId);

    const [user] = await db
      .select({
        dailyLoginStreak: users.dailyLoginStreak,
        lastDailyLogin: users.lastDailyLogin,
        longestStreak: users.longestStreak,
        totalDailyLogins: users.totalDailyLogins,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new Error(`User not found: ${userId}`);

    const status = getClaimStatus(user.lastDailyLogin);
    const effectiveStreak = status.shouldResetStreak
      ? 0
      : user.dailyLoginStreak;
    const milestone = getNextMilestone(effectiveStreak);

    return {
      currentStreak: user.dailyLoginStreak,
      longestStreak: user.longestStreak,
      nextReward: getDailyReward(effectiveStreak + 1),
      ...milestone,
      lastClaim: user.lastDailyLogin,
      canClaim: status.canClaim,
      timeUntilClaim: status.timeUntilClaim,
      timeUntilReset: status.timeUntilReset,
      totalDailyLogins: user.totalDailyLogins,
    };
  }

  static async claimDailyReward(userId: string): Promise<ClaimResult> {
    // Validate userId format before querying
    if (!userId || typeof userId !== 'string' || !isValidSnowflakeId(userId)) {
      return {
        success: false,
        streak: 0,
        reward: 0,
        milestoneBonus: 0,
        totalAwarded: 0,
        nextReward: getDailyReward(1),
        ...getNextMilestone(0),
        streakReset: false,
        error: 'Invalid userId format',
      };
    }

    const [user] = await db
      .select({
        dailyLoginStreak: users.dailyLoginStreak,
        lastDailyLogin: users.lastDailyLogin,
        longestStreak: users.longestStreak,
        totalDailyLogins: users.totalDailyLogins,
        virtualBalance: users.virtualBalance,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const buildResult = (
      partial: Partial<ClaimResult> & { streak: number }
    ): ClaimResult => ({
      success: false,
      reward: 0,
      milestoneBonus: 0,
      totalAwarded: 0,
      nextReward: getDailyReward(partial.streak + 1),
      ...getNextMilestone(partial.streak),
      streakReset: false,
      ...partial,
    });

    if (!user) {
      return buildResult({ streak: 0, error: 'User not found' });
    }

    const status = getClaimStatus(user.lastDailyLogin);

    if (!status.canClaim) {
      return buildResult({
        streak: user.dailyLoginStreak,
        error: 'Cannot claim yet - must wait 24 hours between claims',
      });
    }

    // Ensure streak is always positive (handles corrupted DB data)
    const currentStreak = Math.max(0, user.dailyLoginStreak);
    const newStreak = status.shouldResetStreak ? 1 : currentStreak + 1;
    const reward = getDailyReward(newStreak);
    const milestoneBonus = getMilestoneBonus(newStreak);
    const totalAwarded = reward + milestoneBonus;
    const newLongestStreak = Math.max(user.longestStreak, newStreak);
    const balanceBefore = Number(user.virtualBalance);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          dailyLoginStreak: newStreak,
          lastDailyLogin: now,
          longestStreak: newLongestStreak,
          totalDailyLogins: user.totalDailyLogins + 1,
          virtualBalance: sql`${users.virtualBalance} + ${totalAwarded}`,
          bonusPoints: sql`${users.bonusPoints} + ${totalAwarded}`,
          reputationPoints: sql`${users.reputationPoints} + ${totalAwarded}`,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx.insert(balanceTransactions).values({
        id: await generateSnowflakeId(),
        userId,
        type: 'deposit',
        amount: totalAwarded.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: (balanceBefore + totalAwarded).toString(),
        description: `Daily login reward (Day ${newStreak})${milestoneBonus ? ` + ${newStreak}-day milestone` : ''}`,
      });
    });

    logger.info(
      'Daily login claimed',
      {
        userId,
        newStreak,
        reward,
        milestoneBonus,
        totalAwarded,
        streakReset: status.shouldResetStreak,
      },
      'DailyLoginService'
    );

    return {
      success: true,
      streak: newStreak,
      reward,
      milestoneBonus,
      totalAwarded,
      nextReward: getDailyReward(newStreak + 1),
      ...getNextMilestone(newStreak),
      streakReset: status.shouldResetStreak,
    };
  }
}

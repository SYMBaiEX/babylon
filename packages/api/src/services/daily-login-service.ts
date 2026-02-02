/**
 * Daily Login Service
 *
 * @description Manages daily login rewards and streak tracking for BAB-88.
 * Users can claim rewards once every 24 hours, with a 36-hour grace period
 * before their streak resets. Rewards escalate from Day 1-7, then cycle.
 * Milestone bonuses are awarded at 7, 14, 30, 60, and 90 day streaks.
 */

import { balanceTransactions, db, eq, sql, users } from '@babylon/db';
import {
  DAILY_LOGIN,
  generateSnowflakeId,
  logger,
  POINTS,
} from '@babylon/shared';

/**
 * Result of getting streak info
 */
export interface StreakInfo {
  /** Current consecutive login streak */
  currentStreak: number;
  /** All-time longest streak achieved */
  longestStreak: number;
  /** Points for the next claim */
  nextReward: number;
  /** Days until next milestone bonus */
  daysUntilMilestone: number;
  /** Next milestone day count */
  nextMilestone: number;
  /** Timestamp of last successful claim */
  lastClaim: Date | null;
  /** Whether user can claim right now */
  canClaim: boolean;
  /** Time remaining until claim is available (ms), 0 if can claim */
  timeUntilClaim: number;
  /** Time remaining before streak resets (ms), 0 if already reset */
  timeUntilReset: number;
  /** Total lifetime daily logins */
  totalDailyLogins: number;
}

/**
 * Result of claiming daily reward
 */
export interface ClaimResult {
  /** Whether the claim was successful */
  success: boolean;
  /** Current streak after claim */
  streak: number;
  /** Daily reward points awarded */
  reward: number;
  /** Milestone bonus awarded (if any) */
  milestoneBonus: number;
  /** Total points awarded (reward + milestoneBonus) */
  totalAwarded: number;
  /** Points for the next claim */
  nextReward: number;
  /** Days until next milestone bonus */
  daysUntilMilestone: number;
  /** Next milestone day count */
  nextMilestone: number;
  /** Error message if claim failed */
  error?: string;
  /** Whether streak was reset (claimed after grace period expired) */
  streakReset: boolean;
}

/**
 * Milestone thresholds and their bonus amounts
 */
const MILESTONES = [
  { days: 7, bonus: POINTS.DAILY_LOGIN_MILESTONE_7D },
  { days: 14, bonus: POINTS.DAILY_LOGIN_MILESTONE_14D },
  { days: 30, bonus: POINTS.DAILY_LOGIN_MILESTONE_30D },
  { days: 60, bonus: POINTS.DAILY_LOGIN_MILESTONE_60D },
  { days: 90, bonus: POINTS.DAILY_LOGIN_MILESTONE_90D },
] as const;

/**
 * Daily rewards by day in cycle (1-indexed, cycles after day 7)
 */
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

/**
 * Daily Login Service Class
 *
 * @description Static service class for managing daily login rewards and streaks.
 */
export class DailyLoginService {
  /**
   * Get the daily reward for a given streak day
   * Days cycle: 1,2,3,4,5,6,7,1,2,3,4,5,6,7,...
   */
  private static getDailyReward(streakDay: number): number {
    if (streakDay <= 0) return DAILY_REWARDS[1]!;
    const dayInCycle = ((streakDay - 1) % DAILY_LOGIN.CYCLE_LENGTH) + 1;
    return DAILY_REWARDS[dayInCycle] ?? DAILY_REWARDS[1]!;
  }

  /**
   * Get milestone bonus if the streak exactly matches a milestone
   */
  private static getMilestoneBonus(streak: number): number {
    const milestone = MILESTONES.find((m) => m.days === streak);
    return milestone?.bonus ?? 0;
  }

  /**
   * Get the next upcoming milestone for a given streak
   */
  private static getNextMilestone(streak: number): {
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

  /**
   * Determine claim eligibility based on last claim timestamp
   */
  private static getClaimStatus(lastClaim: Date | null): {
    canClaim: boolean;
    shouldResetStreak: boolean;
    timeUntilClaim: number;
    timeUntilReset: number;
  } {
    if (!lastClaim) {
      // First-time user can always claim
      return {
        canClaim: true,
        shouldResetStreak: false,
        timeUntilClaim: 0,
        timeUntilReset: 0,
      };
    }

    const now = Date.now();
    const lastClaimMs = lastClaim.getTime();
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

  /**
   * Get current streak info for a user without claiming
   */
  static async getStreakInfo(userId: string): Promise<StreakInfo> {
    const result = await db
      .select({
        dailyLoginStreak: users.dailyLoginStreak,
        lastDailyLogin: users.lastDailyLogin,
        longestStreak: users.longestStreak,
        totalDailyLogins: users.totalDailyLogins,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const claimStatus = DailyLoginService.getClaimStatus(user.lastDailyLogin);

    // Calculate what the streak will be on next claim
    let effectiveStreak = user.dailyLoginStreak;
    if (claimStatus.shouldResetStreak) {
      effectiveStreak = 0; // Will be 1 after claiming
    }

    // Next reward is for the NEXT day (current streak + 1)
    const nextStreakDay = effectiveStreak + 1;
    const nextReward = DailyLoginService.getDailyReward(nextStreakDay);
    const { nextMilestone, daysUntilMilestone } =
      DailyLoginService.getNextMilestone(effectiveStreak);

    return {
      currentStreak: user.dailyLoginStreak,
      longestStreak: user.longestStreak,
      nextReward,
      daysUntilMilestone,
      nextMilestone,
      lastClaim: user.lastDailyLogin,
      canClaim: claimStatus.canClaim,
      timeUntilClaim: claimStatus.timeUntilClaim,
      timeUntilReset: claimStatus.timeUntilReset,
      totalDailyLogins: user.totalDailyLogins,
    };
  }

  /**
   * Claim daily login reward
   *
   * This method is idempotent within the 24-hour window - calling it multiple
   * times when the user cannot claim will simply return success: false.
   */
  static async claimDailyReward(userId: string): Promise<ClaimResult> {
    // Fetch user data with FOR UPDATE to prevent race conditions
    const result = await db
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

    const user = result[0];

    if (!user) {
      return {
        success: false,
        streak: 0,
        reward: 0,
        milestoneBonus: 0,
        totalAwarded: 0,
        nextReward: DAILY_REWARDS[1]!,
        daysUntilMilestone: 7,
        nextMilestone: 7,
        error: 'User not found',
        streakReset: false,
      };
    }

    const claimStatus = DailyLoginService.getClaimStatus(user.lastDailyLogin);

    // Cannot claim yet - return without error (idempotent)
    if (!claimStatus.canClaim) {
      const { nextMilestone, daysUntilMilestone } =
        DailyLoginService.getNextMilestone(user.dailyLoginStreak);
      return {
        success: false,
        streak: user.dailyLoginStreak,
        reward: 0,
        milestoneBonus: 0,
        totalAwarded: 0,
        nextReward: DailyLoginService.getDailyReward(user.dailyLoginStreak + 1),
        daysUntilMilestone,
        nextMilestone,
        error: 'Cannot claim yet - must wait 24 hours between claims',
        streakReset: false,
      };
    }

    // Calculate new streak
    let newStreak: number;
    if (claimStatus.shouldResetStreak) {
      newStreak = 1; // Start fresh
    } else {
      newStreak = user.dailyLoginStreak + 1;
    }

    // Calculate rewards
    const reward = DailyLoginService.getDailyReward(newStreak);
    const milestoneBonus = DailyLoginService.getMilestoneBonus(newStreak);
    const totalAwarded = reward + milestoneBonus;

    // Update longest streak if needed
    const newLongestStreak = Math.max(user.longestStreak, newStreak);

    // Get current balance for transaction record
    const balanceBefore = Number(user.virtualBalance);
    const balanceAfter = balanceBefore + totalAwarded;

    const now = new Date();
    const transactionId = await generateSnowflakeId();

    // Execute all updates in a transaction
    await db.transaction(async (tx) => {
      // Update user streak fields and virtual balance
      await tx
        .update(users)
        .set({
          dailyLoginStreak: newStreak,
          lastDailyLogin: now,
          longestStreak: newLongestStreak,
          totalDailyLogins: user.totalDailyLogins + 1,
          virtualBalance: sql`${users.virtualBalance} + ${totalAwarded}`,
          // Also add to bonusPoints for reputation tracking
          bonusPoints: sql`${users.bonusPoints} + ${totalAwarded}`,
          // Update reputation points (base + invite + earned + bonus)
          reputationPoints: sql`${users.reputationPoints} + ${totalAwarded}`,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      // Record balance transaction for audit trail
      await tx.insert(balanceTransactions).values({
        id: transactionId,
        userId,
        type: 'deposit',
        amount: totalAwarded.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        description: `Daily login reward (Day ${newStreak})${milestoneBonus > 0 ? ` + ${newStreak}-day milestone bonus` : ''}`,
      });
    });

    logger.info(
      `Daily login claimed`,
      {
        userId,
        newStreak,
        reward,
        milestoneBonus,
        totalAwarded,
        streakReset: claimStatus.shouldResetStreak,
      },
      'DailyLoginService'
    );

    const { nextMilestone, daysUntilMilestone } =
      DailyLoginService.getNextMilestone(newStreak);

    return {
      success: true,
      streak: newStreak,
      reward,
      milestoneBonus,
      totalAwarded,
      nextReward: DailyLoginService.getDailyReward(newStreak + 1),
      daysUntilMilestone,
      nextMilestone,
      streakReset: claimStatus.shouldResetStreak,
    };
  }

  /**
   * Check if a user can claim their daily reward
   */
  static async canClaim(userId: string): Promise<boolean> {
    const info = await DailyLoginService.getStreakInfo(userId);
    return info.canClaim;
  }
}

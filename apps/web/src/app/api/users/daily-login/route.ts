/**
 * Daily Login Rewards API
 *
 * @route GET /api/users/daily-login
 * @route POST /api/users/daily-login
 * @access Authenticated
 *
 * @description
 * Manages daily login streak rewards for authenticated users.
 *
 * GET: Returns current streak info without claiming
 * POST: Claims daily reward if eligible (idempotent)
 *
 * Timing:
 * - Users must wait 24 hours between claims
 * - 36-hour grace period before streak resets
 * - Rewards escalate from Day 1 (50pts) to Day 7 (200pts), then cycle
 * - Milestone bonuses at 7, 14, 30, 60, 90 days
 */

import {
  authenticate,
  DailyLoginService,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * GET /api/users/daily-login
 *
 * Returns current streak info for the authenticated user.
 * Does not claim the reward.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  const streakInfo = await DailyLoginService.getStreakInfo(authUser.userId);

  return successResponse({
    currentStreak: streakInfo.currentStreak,
    longestStreak: streakInfo.longestStreak,
    nextReward: streakInfo.nextReward,
    daysUntilMilestone: streakInfo.daysUntilMilestone,
    nextMilestone: streakInfo.nextMilestone,
    lastClaim: streakInfo.lastClaim?.toISOString() ?? null,
    canClaim: streakInfo.canClaim,
    timeUntilClaim: streakInfo.timeUntilClaim,
    timeUntilReset: streakInfo.timeUntilReset,
    totalDailyLogins: streakInfo.totalDailyLogins,
  });
});

/**
 * POST /api/users/daily-login
 *
 * Claims the daily login reward if eligible.
 * Idempotent: calling when cannot claim returns success: false without error.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  const result = await DailyLoginService.claimDailyReward(authUser.userId);

  if (result.success) {
    logger.info(
      'Daily login reward claimed',
      {
        userId: authUser.userId,
        streak: result.streak,
        reward: result.reward,
        milestoneBonus: result.milestoneBonus,
        totalAwarded: result.totalAwarded,
        streakReset: result.streakReset,
      },
      'DailyLoginAPI'
    );
  }

  return successResponse({
    success: result.success,
    streak: result.streak,
    reward: result.reward,
    milestoneBonus: result.milestoneBonus,
    totalAwarded: result.totalAwarded,
    nextReward: result.nextReward,
    daysUntilMilestone: result.daysUntilMilestone,
    nextMilestone: result.nextMilestone,
    streakReset: result.streakReset,
    error: result.error,
  });
});

/**
 * Waitlist Position API
 * 
 * @route GET /api/waitlist/position - Get waitlist position
 * @access Public
 * 
 * @description
 * Returns user's waitlist position including leaderboard rank, percentile, points,
 * and referral statistics. Handles users not yet on waitlist gracefully.
 * 
 * @openapi
 * /api/waitlist/position:
 *   get:
 *     tags:
 *       - Waitlist
 *     summary: Get waitlist position
 *     description: Returns user's waitlist position, rank, and points breakdown
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to check position for
 *     responses:
 *       200:
 *         description: Waitlist position retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 position:
 *                   type: integer
 *                   nullable: true
 *                   description: Leaderboard rank (null if not on waitlist)
 *                 leaderboardRank:
 *                   type: integer
 *                   nullable: true
 *                 waitlistPosition:
 *                   type: integer
 *                   nullable: true
 *                 totalAhead:
 *                   type: integer
 *                 totalCount:
 *                   type: integer
 *                 percentile:
 *                   type: number
 *                 inviteCode:
 *                   type: string
 *                 points:
 *                   type: number
 *                 pointsBreakdown:
 *                   type: object
 *                 referralCount:
 *                   type: integer
 * 
 * @example
 * ```typescript
 * const { position, points } = await fetch('/api/waitlist/position?userId=user-id')
 *   .then(r => r.json());
 * ```
 * 
 * @see {@link /lib/services/waitlist-service} Waitlist service
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { WaitlistService } from '@/lib/services/waitlist-service'
import { logger } from '@/lib/logger'

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    throw new Error('userId parameter is required')
  }

  logger.info('Waitlist position request', { userId }, 'GET /api/waitlist/position')

  const position = await WaitlistService.getWaitlistPosition(userId)

  // If user doesn't exist or isn't on waitlist, return null gracefully
  // This handles new Privy users who haven't completed signup yet
  if (!position) {
    logger.info('Waitlist position not found - user not on waitlist or doesn\'t exist yet', { userId }, 'GET /api/waitlist/position')
    return successResponse({
      position: null,
    })
  }

  // Calculate expected total from breakdown components
  const calculatedTotal = position.invitePoints + position.earnedPoints + position.bonusPoints
  
  // Log if there's a mismatch (reputationPoints may include base points)
  if (Math.abs(position.points - calculatedTotal) > 100) {
    logger.warn('Points calculation mismatch', {
      userId,
      reputationPoints: position.points,
      calculatedTotal,
      invitePoints: position.invitePoints,
      earnedPoints: position.earnedPoints,
      bonusPoints: position.bonusPoints,
    }, 'GET /api/waitlist/position')
  }
  
  // Calculate weekly referral count
  const { prisma } = await import('@/lib/prisma')
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const weeklyReferralCount = await prisma.referral.count({
    where: {
      referrerId: userId,
      status: 'completed',
      completedAt: {
        gte: oneWeekAgo,
      },
    },
  })
  const WEEKLY_REFERRAL_LIMIT = 10

  return successResponse({
    // IMPORTANT: Return leaderboardRank as "position" for UI compatibility
    position: position.leaderboardRank,      // Dynamic rank based on invite points
    leaderboardRank: position.leaderboardRank,
    waitlistPosition: position.waitlistPosition, // Historical record
    totalAhead: position.totalAhead,
    totalCount: position.totalCount,
    percentile: position.percentile,
    inviteCode: position.inviteCode,
    points: position.points, // Full reputation points
    pointsBreakdown: {
      total: position.points, // Should match points (reputationPoints)
      invite: position.invitePoints,
      earned: position.earnedPoints,
      bonus: position.bonusPoints,
    },
    referralCount: position.referralCount,
    weeklyReferralCount,
    weeklyLimit: WEEKLY_REFERRAL_LIMIT,
  })
})


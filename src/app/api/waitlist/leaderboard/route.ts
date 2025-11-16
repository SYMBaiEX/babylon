/**
 * Waitlist Leaderboard API
 * 
 * @route GET /api/waitlist/leaderboard - Get waitlist leaderboard
 * @access Public
 * 
 * @description
 * Returns top waitlist users ranked by invite points. Shows leaderboard with
 * user rankings and points.
 * 
 * @openapi
 * /api/waitlist/leaderboard:
 *   get:
 *     tags:
 *       - Waitlist
 *     summary: Get waitlist leaderboard
 *     description: Returns top waitlist users ranked by invite points
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of top users to return
 *     responses:
 *       200:
 *         description: Leaderboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 leaderboard:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       rank:
 *                         type: integer
 *                       points:
 *                         type: number
 *                       referralCount:
 *                         type: integer
 *                 totalShown:
 *                   type: integer
 * 
 * @example
 * ```typescript
 * const { leaderboard } = await fetch('/api/waitlist/leaderboard?limit=20')
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
  const limit = parseInt(searchParams.get('limit') || '10', 10)

  logger.info('Waitlist leaderboard request', { limit }, 'GET /api/waitlist/leaderboard')

  const topUsers = await WaitlistService.getTopWaitlistUsers(limit)

  return successResponse({
    leaderboard: topUsers,
    totalShown: topUsers.length,
  })
})


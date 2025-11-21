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
import { getCache, setCache } from '@/lib/cache-service'

type LeaderboardResponse = {
  leaderboard: Awaited<ReturnType<typeof WaitlistService.getTopWaitlistUsers>>
  totalShown: number
}

const CACHE_KEY_NAMESPACE = 'waitlist:leaderboard'
const CACHE_TTL_MS = Number(process.env.WAITLIST_LEADERBOARD_CACHE_MS ?? 15_000) // 15s default
const CACHE_TTL_SECONDS = Math.max(1, Math.floor(CACHE_TTL_MS / 1000))
const STALE_SECONDS = CACHE_TTL_SECONDS * 3

export const GET = withErrorHandling(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100) // Cap at 100

    if (CACHE_TTL_MS > 0) {
      const cached = await getCache<LeaderboardResponse>(String(limit), {
        namespace: CACHE_KEY_NAMESPACE,
      })
      if (cached) {
        return successResponse(cached, 200, {
          'x-cache': 'waitlist-leaderboard-hit',
          'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
        })
      }
    }

    logger.info('Waitlist leaderboard request', { limit }, 'GET /api/waitlist/leaderboard')

    const topUsers = await WaitlistService.getTopWaitlistUsers(limit)

    const responseBody: LeaderboardResponse = {
      leaderboard: topUsers,
      totalShown: topUsers.length,
    }

    if (CACHE_TTL_MS > 0) {
      await setCache(String(limit), responseBody, {
        namespace: CACHE_KEY_NAMESPACE,
        ttl: CACHE_TTL_SECONDS,
      })
    }

    return successResponse(responseBody, 200, {
      'x-cache': 'waitlist-leaderboard-miss',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
    })
  } catch (error) {
    logger.error('Error fetching waitlist leaderboard', { error }, 'GET /api/waitlist/leaderboard')
    throw error
  }
})

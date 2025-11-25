/**
 * Waitlist Leaderboard API
 * 
 * @route GET /api/waitlist/leaderboard - Get waitlist leaderboard
 * @access Public
 * 
 * @description
 * Returns top waitlist users ranked by invite points. Shows leaderboard with
 * user rankings and points. Supports pagination.
 * 
 * @openapi
 * /api/waitlist/leaderboard:
 *   get:
 *     tags:
 *       - Waitlist
 *     summary: Get waitlist leaderboard
 *     description: Returns top waitlist users ranked by invite points with pagination
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page (max 100)
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
 *                       id:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       username:
 *                         type: string
 *                         nullable: true
 *                       displayName:
 *                         type: string
 *                         nullable: true
 *                       profileImageUrl:
 *                         type: string
 *                         nullable: true
 *                       invitePoints:
 *                         type: integer
 *                       reputationPoints:
 *                         type: integer
 *                       points:
 *                         type: integer
 *                       referralCount:
 *                         type: integer
 *                       rank:
 *                         type: integer
 *                 totalShown:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 * 
 * @example
 * ```typescript
 * const { leaderboard, page, totalPages } = await fetch('/api/waitlist/leaderboard?page=1&limit=10')
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
  page: number
  totalPages: number
  hasMore: boolean
}

const CACHE_KEY_NAMESPACE = 'waitlist:leaderboard'
// Increased cache to 5 minutes to reduce data transfer costs
const CACHE_TTL_MS = Number(process.env.WAITLIST_LEADERBOARD_CACHE_MS ?? 300_000) // 300s (5 min) default
const CACHE_TTL_SECONDS = Math.max(1, Math.floor(CACHE_TTL_MS / 1000))
const STALE_SECONDS = CACHE_TTL_SECONDS * 3

export const GET = withErrorHandling(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100) // Cap at 100
    
    // Calculate offset for pagination
    const offset = (page - 1) * limit
    
    // Cache key includes both page and limit
    const cacheKey = `${page}-${limit}`

    if (CACHE_TTL_MS > 0) {
      const cached = await getCache<LeaderboardResponse>(cacheKey, {
        namespace: CACHE_KEY_NAMESPACE,
      })
      if (cached) {
        return successResponse(cached, 200, {
          'x-cache': 'waitlist-leaderboard-hit',
          'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
          'Vary': 'Accept-Encoding',
        })
      }
    }

    logger.info('Waitlist leaderboard request', { page, limit, offset }, 'GET /api/waitlist/leaderboard')

    const topUsers = await WaitlistService.getTopWaitlistUsers(limit, offset)

    // Calculate total pages (cap at 100 users for leaderboard display)
    // Determine hasMore based on whether we got a full page of results
    const maxUsers = 100
    const totalPages = Math.ceil(maxUsers / limit)
    const hasMore = topUsers.length === limit && page < totalPages

    const responseBody: LeaderboardResponse = {
      leaderboard: topUsers,
      totalShown: topUsers.length,
      page,
      totalPages,
      hasMore,
    }

    if (CACHE_TTL_MS > 0) {
      await setCache(cacheKey, responseBody, {
        namespace: CACHE_KEY_NAMESPACE,
        ttl: CACHE_TTL_SECONDS,
      })
    }

    return successResponse(responseBody, 200, {
      'x-cache': 'waitlist-leaderboard-miss',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      'Vary': 'Accept-Encoding',
    })
  } catch (error) {
    logger.error('Error fetching waitlist leaderboard', { error }, 'GET /api/waitlist/leaderboard')
    throw error
  }
})

/**
 * Stats Widget API
 * 
 * @route GET /api/feed/widgets/stats - Get platform statistics
 * @access Public
 * 
 * @description
 * Returns platform-wide statistics including active players, AI agents, total posts,
 * and points in circulation. Aggregates data from users and actors with RLS support.
 * 
 * @openapi
 * /api/feed/widgets/stats:
 *   get:
 *     tags:
 *       - Feed
 *     summary: Get platform statistics
 *     description: Returns platform-wide stats including players, agents, posts, and points
 *     parameters:
 *       - in: query
 *         name: includeMarkets
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include market statistics
 *       - in: query
 *         name: includeUsers
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include user statistics
 *       - in: query
 *         name: includePools
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include pool statistics
 *       - in: query
 *         name: includeVolume
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include volume statistics
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     activePlayers:
 *                       type: integer
 *                       description: Active users in last 7 days
 *                     aiAgents:
 *                       type: integer
 *                       description: Total AI agents/actors
 *                     totalHoots:
 *                       type: integer
 *                       description: Total posts
 *                     pointsInCirculation:
 *                       type: string
 *                       description: Formatted points in circulation
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/feed/widgets/stats');
 * const { stats } = await response.json();
 * ```
 * 
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server'
import { optionalAuth } from '@/lib/api/auth-middleware'
import { asUser, asPublic } from '@/lib/db/context'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { StatsQuerySchema } from '@/lib/validation/schemas'
import { logger } from '@/lib/logger'

interface BabylonStats {
  activePlayers: number
  aiAgents: number
  totalHoots: number
  pointsInCirculation: string
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const queryParams = {
    includeMarkets: searchParams.get('includeMarkets') || 'true',
    includeUsers: searchParams.get('includeUsers') || 'true',
    includePools: searchParams.get('includePools') || 'true',
    includeVolume: searchParams.get('includeVolume') || 'true'
  }
  StatsQuerySchema.parse(queryParams)
  
  // Optional auth - stats are public but RLS still applies
  const authUser = await optionalAuth(request).catch(() => null)
  
  // Get all stats in parallel for better performance with RLS
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  
  const [activePlayers, aiAgents, totalHoots, userPointsResult, actorPointsResult] = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
      return await Promise.all([
      // Get active users (logged in within last 7 days) - exclude actors
      db.user.count({
        where: {
          isActor: false, // Only real users, not NPCs
          updatedAt: {
            gte: sevenDaysAgo,
          },
        },
      }),
      
      // Get AI agents from Actor table (all actors, not just those with pools)
      db.actor.count(),
      
      // Get total posts (hoots) - all posts from both users and actors
      db.post.count(),
      
      // Calculate points in circulation (sum of all user virtual balances)
      db.user.aggregate({
        _sum: {
          virtualBalance: true,
        },
        where: {
          isActor: false, // Only count real users' virtual balances
        },
      }),
      
      // Sum actor trading balances
      db.actor.aggregate({
        _sum: {
          tradingBalance: true,
        },
      })
    ])
  })
    : await asPublic(async (db) => {
      return await Promise.all([
      // Get active users (logged in within last 7 days) - exclude actors
      db.user.count({
        where: {
          isActor: false, // Only real users, not NPCs
          updatedAt: {
            gte: sevenDaysAgo,
          },
        },
      }),
      
      // Get AI agents from Actor table (all actors, not just those with pools)
      db.actor.count(),
      
      // Get total posts (hoots) - all posts from both users and actors
      db.post.count(),
      
      // Calculate points in circulation (sum of all user virtual balances)
      db.user.aggregate({
        _sum: {
          virtualBalance: true,
        },
        where: {
          isActor: false, // Only count real users' virtual balances
        },
      }),
      
      // Sum actor trading balances
      db.actor.aggregate({
        _sum: {
          tradingBalance: true,
        },
      })
    ])
  })

  const userPoints = userPointsResult._sum.virtualBalance || BigInt(0)
  const actorPoints = actorPointsResult._sum.tradingBalance || BigInt(0)
  const totalPoints = Number(userPoints) + Number(actorPoints)
  const pointsInCirculation = formatPoints(BigInt(totalPoints))

  const stats: BabylonStats = {
    activePlayers,
    aiAgents,
    totalHoots,
    pointsInCirculation,
  }

  logger.info('Babylon stats fetched successfully', stats, 'GET /api/feed/widgets/stats')

  return successResponse({
    success: true,
    stats,
  })
})

function formatPoints(points: bigint): string {
  const num = Number(points)
  
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M pts`
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K pts`
  }
  
  return `${num.toLocaleString()} pts`
}

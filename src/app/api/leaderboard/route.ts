/**
 * API Route: /api/leaderboard
 * Methods: GET (fetch leaderboard with pagination)
 */

import type { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/api/auth-middleware'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'

/**
 * GET /api/leaderboard
 * Get leaderboard with pagination and filtering
 * Query params:
 *  - page: number (default 1)
 *  - pageSize: number (default 100, max 100)
 *  - minPoints: number (default 10000)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10)))
    const minPoints = Math.max(0, parseInt(searchParams.get('minPoints') || '10000', 10))

    logger.info(
      `Fetching leaderboard: page=${page}, pageSize=${pageSize}, minPoints=${minPoints}`,
      { page, pageSize, minPoints },
      'GET /api/leaderboard'
    )

    const leaderboard = await PointsService.getLeaderboard(page, pageSize, minPoints)

    return successResponse({
      leaderboard: leaderboard.users,
      pagination: {
        page: leaderboard.page,
        pageSize: leaderboard.pageSize,
        totalCount: leaderboard.totalCount,
        totalPages: leaderboard.totalPages,
      },
      minPoints,
    })
  } catch (error) {
    logger.error('Error fetching leaderboard:', error, 'GET /api/leaderboard')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch leaderboard',
      500
    )
  }
}


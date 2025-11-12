/**
 * API Route: /api/leaderboard
 * Methods: GET (fetch leaderboard with pagination)
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { LeaderboardQuerySchema } from '@/lib/validation/schemas/common'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'

/**
 * GET /api/leaderboard
 * Get leaderboard with pagination and filtering
 * Query params:
 *  - page: number (default 1)
 *  - pageSize: number (default 100, max 100)
 *  - minPoints: number (default 500)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)

  // Parse and validate query parameters
  const queryParams = Object.fromEntries(searchParams.entries())
  const { page, pageSize, minPoints, pointsType } = LeaderboardQuerySchema.parse(queryParams)

  const pointsCategory = (pointsType ?? 'all') as 'all' | 'earned' | 'referral'

  const leaderboard = await PointsService.getLeaderboard(page, pageSize, minPoints, pointsCategory)

  logger.info('Leaderboard fetched successfully', {
    page,
    pageSize,
    minPoints,
    pointsCategory,
    totalCount: leaderboard.totalCount
  }, 'GET /api/leaderboard')

  return successResponse({
    leaderboard: leaderboard.users,
    pagination: {
      page: leaderboard.page,
      pageSize: leaderboard.pageSize,
      totalCount: leaderboard.totalCount,
      totalPages: leaderboard.totalPages,
    },
    minPoints: pointsCategory === 'all' ? minPoints : 0,
    pointsCategory: leaderboard.pointsCategory,
  })
});


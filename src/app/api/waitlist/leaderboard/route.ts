/**
 * Waitlist Leaderboard API
 * GET /api/waitlist/leaderboard?limit=10
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


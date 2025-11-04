/**
 * SSE Stats Route
 *
 * Returns statistics about connected SSE clients
 * Useful for debugging and monitoring
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { getEventBroadcaster } from '@/lib/sse/event-broadcaster'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (_request: NextRequest) => {
  const broadcaster = getEventBroadcaster()
  const stats = broadcaster.getStats()

  logger.info('SSE stats fetched successfully', { totalClients: stats.totalClients }, 'GET /api/sse/stats')

  return successResponse({
    success: true,
    stats,
    timestamp: Date.now()
  })
})


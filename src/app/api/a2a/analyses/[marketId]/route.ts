/**
 * A2A Analyses API
 *
 * GET /api/a2a/analyses/[marketId] - Get shared analyses for a market
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { BusinessLogicError } from '@/lib/errors'
import { MarketIdParamSchema, PaginationSchema } from '@/lib/validation/schemas'
import { logger } from '@/lib/logger'

export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ marketId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')))
  const { marketId } = MarketIdParamSchema.parse(params)
  
  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const queryParams = {
    limit: searchParams.get('limit'),
    page: searchParams.get('page')
  }
  const { limit } = PaginationSchema.partial().parse(queryParams)

  // TODO: In production, this would query from a persistent store (Redis, Database)
  // For now, analyses are only available via A2A protocol in-memory storage

  logger.info('Analyses requested for market', { marketId, limit }, 'GET /api/a2a/analyses/[marketId]')

  return successResponse({
    marketId,
    analyses: [],
    total: 0,
    note: 'Analyses are available via A2A protocol. Use a2a.get_analyses method for real-time data.'
  })
})


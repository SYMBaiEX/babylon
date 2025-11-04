/**
 * Agent Feedback API
 *
 * Submit and retrieve feedback for agents in the Agent0 network.
 */

import type { NextRequest } from 'next/server'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { AuthorizationError } from '@/lib/errors'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { SubgraphClient } from '@/agents/agent0/SubgraphClient'
import { logger } from '@/lib/logger'
import { AgentFeedbackCreateSchema, AgentFeedbackQuerySchema } from '@/lib/validation/schemas'

/**
 * POST /api/agents/feedback - Submit feedback for an agent
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Validate request body
  const body = await request.json()
  const validatedBody = AgentFeedbackCreateSchema.parse(body)

  // Get authenticated user/agent
  // TODO: Implement proper authentication
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    throw new AuthorizationError('Unauthorized', 'feedback', 'submit')
  }

  // Submit feedback to Agent0 network
  if (process.env.AGENT0_ENABLED === 'true') {
    try {
      const agent0Client = getAgent0Client()
      await agent0Client.submitFeedback({
        targetAgentId: validatedBody.targetAgentId,
        rating: validatedBody.rating,
        comment: validatedBody.comment
      })

      logger.info(
        `Feedback submitted for agent ${validatedBody.targetAgentId}`,
        { rating: validatedBody.rating, comment: validatedBody.comment.substring(0, 50) },
        'AgentFeedback'
      )
    } catch (error) {
      logger.error('Failed to submit feedback to Agent0:', error, 'AgentFeedback')
      // Continue - still return success for local tracking
    }
  }

  // TODO: Store feedback locally as well for aggregation

  logger.info('Feedback submitted successfully', { targetAgentId: validatedBody.targetAgentId, rating: validatedBody.rating }, 'POST /api/agents/feedback')

  return successResponse({
    success: true,
    message: 'Feedback submitted successfully'
  })
})

/**
 * GET /api/agents/feedback - Get feedback for an agent
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const query = { agentId: searchParams.get('agentId') }
  const validatedQuery = AgentFeedbackQuerySchema.parse(query)

  // Parse token ID from agentId (could be "agent0-123" or just "123")
  const tokenIdStr = String(validatedQuery.agentId).replace('agent0-', '')
  const tokenId = parseInt(tokenIdStr, 10)

  // Get feedback from Agent0 network via subgraph
  if (process.env.AGENT0_ENABLED === 'true') {
    try {
      const subgraphClient = new SubgraphClient()
      const feedbacks = await subgraphClient.getAgentFeedback(tokenId)

      logger.info('Feedback retrieved successfully', { agentId: tokenId, total: feedbacks.length }, 'GET /api/agents/feedback')

      return successResponse({
        agentId: tokenId,
        feedbacks: feedbacks.map(f => ({
          from: f.from,
          rating: f.rating,
          comment: f.comment,
          timestamp: f.timestamp
        })),
        total: feedbacks.length
      })
    } catch (error) {
      logger.error('Failed to get feedback from Agent0:', error, 'AgentFeedback')
    }
  }

  // Return empty if Agent0 is disabled or query failed
  logger.info('No feedback available (Agent0 disabled or query failed)', { agentId: tokenId }, 'GET /api/agents/feedback')

  return successResponse({
    agentId: tokenId,
    feedbacks: [],
    total: 0
  })
})


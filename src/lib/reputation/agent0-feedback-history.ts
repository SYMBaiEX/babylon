/**
 * Agent0 Feedback History Service
 * 
 * Retrieves feedback history from Agent0 network using SDK methods.
 * All methods use Agent0Client which includes rate limiting, circuit breaker,
 * and structured error handling.
 */

import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { logger } from '@/lib/logger'
import { Agent0ReputationError } from '@/lib/errors'

export interface Agent0FeedbackItem {
  id: string
  from: string
  score: number
  comment?: string
  tags?: string[]
  capability?: string
  skill?: string
  timestamp: number
}

export interface Agent0FeedbackHistoryFilters {
  minScore?: number
  maxScore?: number
  tags?: string[]
  limit?: number
}

/**
 * Get feedback history for an agent from Agent0 network
 * 
 * Uses Agent0Client.searchFeedback which includes:
 * - Rate limiting (10 requests/minute)
 * - Circuit breaker protection
 * - Retry mechanism for transient failures
 * - Structured error handling
 * 
 * @param tokenId - Agent0 token ID
 * @param filters - Optional filters for searching feedback
 * @returns Array of feedback items
 * @throws Agent0ReputationError if search fails
 */
export async function getAgent0FeedbackHistory(
  tokenId: number,
  filters?: Agent0FeedbackHistoryFilters
): Promise<Agent0FeedbackItem[]> {
  try {
    const agent0Client = getAgent0Client()
    const feedback = await agent0Client.searchFeedback(tokenId, {
      minScore: filters?.minScore,
      maxScore: filters?.maxScore,
      tags: filters?.tags,
      limit: filters?.limit || 50,
    })

    logger.info('Retrieved Agent0 feedback history', {
      tokenId,
      count: feedback.length,
      filters,
    })

    return feedback
  } catch (error) {
    // Agent0Client already throws Agent0ReputationError
    // Just re-throw with additional context
    if (Agent0ReputationError.isInstance(error)) {
      logger.error('Failed to get Agent0 feedback history', {
        tokenId,
        filters,
        error: error.message,
      })
      throw error
    }

    // Unexpected error - wrap in Agent0ReputationError
    logger.error('Unexpected error getting Agent0 feedback history', {
      tokenId,
      error,
    })
    
    throw new Agent0ReputationError(
      `Failed to get feedback history: ${error instanceof Error ? error.message : String(error)}`,
      tokenId,
      undefined,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Get specific feedback by ID from Agent0 network
 * 
 * Uses Agent0Client.getFeedback which includes:
 * - Rate limiting (10 requests/minute)
 * - Circuit breaker protection
 * - Retry mechanism for transient failures
 * - Structured error handling
 * 
 * @param tokenId - Agent0 token ID
 * @param feedbackId - Feedback ID
 * @returns Feedback item or null if not found
 * @throws Agent0ReputationError if retrieval fails
 */
export async function getAgent0Feedback(
  tokenId: number,
  feedbackId: string
): Promise<Agent0FeedbackItem | null> {
  try {
    const agent0Client = getAgent0Client()
    const feedback = await agent0Client.getFeedback(tokenId, feedbackId)

    if (!feedback) {
      logger.debug('Agent0 feedback not found', { tokenId, feedbackId })
      return null
    }

    logger.info('Retrieved Agent0 feedback', {
      tokenId,
      feedbackId,
      score: feedback.score,
    })

    return feedback
  } catch (error) {
    // Agent0Client already throws Agent0ReputationError
    // Just re-throw with additional context
    if (Agent0ReputationError.isInstance(error)) {
      logger.error('Failed to get Agent0 feedback', {
        tokenId,
        feedbackId,
        error: error.message,
      })
      throw error
    }

    // Unexpected error - wrap in Agent0ReputationError
    logger.error('Unexpected error getting Agent0 feedback', {
      tokenId,
      feedbackId,
      error,
    })
    
    throw new Agent0ReputationError(
      `Failed to get feedback: ${error instanceof Error ? error.message : String(error)}`,
      tokenId,
      undefined,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Agent0 Reputation Synchronization Service
 *
 * Integrates local reputation system with Agent0 network's on-chain reputation (ERC-8004).
 * Provides bidirectional sync between local database and blockchain.
 */

import { prisma } from '@/lib/database-service'
import { getOnChainReputation, syncOnChainReputation } from './blockchain-reputation'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { recalculateReputation, getReputationBreakdown } from './reputation-service'
import { logger } from '@/lib/logger'
import { retryIfRetryable } from '@/lib/retry'
import { Agent0FeedbackError, Agent0DuplicateFeedbackError, Agent0ReputationError } from '@/lib/errors'
import { agent0Metrics } from '@/lib/metrics/agent0-metrics'

/**
 * Sync Agent0 on-chain reputation to local database after registration
 *
 * Called automatically after successful Agent0 registration to initialize
 * local reputation metrics with on-chain data.
 *
 * @param userId - User ID
 * @param agent0TokenId - Agent0 network token ID
 * @returns Updated performance metrics
 */
export async function syncAfterAgent0Registration(userId: string, agent0TokenId: number) {
  const startTime = Date.now()
  
  try {
    logger.info('Syncing reputation after Agent0 registration', { userId, agent0TokenId })
    
    // Track sync start
    agent0Metrics.increment('agent0.sync.start', { userId, agent0TokenId })

    // Get on-chain reputation data
    const onChainRep = await getOnChainReputation(agent0TokenId)

    if (!onChainRep) {
      logger.warn('No on-chain reputation data found', { agent0TokenId })
      // Initialize with default metrics
      return await prisma.agentPerformanceMetrics.upsert({
        where: { userId },
        create: {
          userId,
          onChainReputationSync: true,
          lastSyncedAt: new Date(),
        },
        update: {
          onChainReputationSync: true,
          lastSyncedAt: new Date(),
        },
      })
    }

    // Get or create performance metrics
    let metrics = await prisma.agentPerformanceMetrics.findUnique({
      where: { userId },
    })

    if (!metrics) {
      metrics = await prisma.agentPerformanceMetrics.create({
        data: {
          userId,
        },
      })
    }

    // Sync on-chain data to local database
    const updated = await syncOnChainReputation(userId, agent0TokenId)

    // Recalculate local reputation with synced data
    await recalculateReputation(userId)

    logger.info('Agent0 reputation sync completed', {
      userId,
      agent0TokenId,
      trustScore: onChainRep.trustScore.toString(),
      accuracyScore: onChainRep.accuracyScore.toString(),
      duration: Date.now() - startTime,
    })
    
    // Track success metric
    agent0Metrics.increment('agent0.sync.success', { userId, agent0TokenId })

    return updated
  } catch (error) {
    // Track error metric
    agent0Metrics.increment('agent0.sync.error', {
      userId,
      errorType: error instanceof Error ? error.name : 'Unknown',
    })
    
    logger.error('Failed to sync reputation after Agent0 registration', {
      userId,
      agent0TokenId,
      error,
      duration: Date.now() - startTime,
    })
    
    throw new Agent0ReputationError(
      `Failed to sync reputation: ${error instanceof Error ? error.message : String(error)}`,
      agent0TokenId,
      undefined,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Submit local feedback to Agent0 network
 *
 * When users rate agents locally, optionally propagate feedback to Agent0's
 * on-chain reputation system for network-wide visibility.
 *
 * @param feedbackId - Local feedback record ID
 * @param submitToBlockchain - Whether to also submit to ERC-8004 (requires gas)
 * @returns Agent0 submission result
 */
export async function submitFeedbackToAgent0(feedbackId: string, submitToBlockchain = false) {
  const startTime = Date.now()
  
  try {
    // Get feedback record with agent info
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        toUser: {
          select: {
            id: true,
            agent0TokenId: true,
            nftTokenId: true,
          },
        },
      },
    })

    if (!feedback) {
      throw new Agent0FeedbackError(`Feedback ${feedbackId} not found`, feedbackId)
    }

    if (!feedback.toUser) {
      throw new Agent0FeedbackError('Feedback has no recipient user', feedbackId)
    }

    // Check if already submitted to prevent duplicates
    if (
      feedback.metadata &&
      typeof feedback.metadata === 'object' &&
      'agent0Submitted' in feedback.metadata &&
      feedback.metadata.agent0Submitted === true
    ) {
      logger.info('Feedback already submitted to Agent0', {
        feedbackId,
        agent0TokenId: feedback.toUser.agent0TokenId,
      })
      
      // Track as duplicate
      agent0Metrics.increment('agent0.feedback.duplicate', {
        feedbackId,
        targetAgentId: feedback.toUser.agent0TokenId,
      })
      
      throw new Agent0DuplicateFeedbackError(feedbackId, feedback.toUser.agent0TokenId!)
    }

    const agent0TokenId = feedback.toUser.agent0TokenId

    if (!agent0TokenId) {
      logger.warn('Agent has no Agent0 token ID, skipping submission', {
        feedbackId,
        userId: feedback.toUser.id,
      })
      return null
    }

    // Get Agent0 client
    const agent0Client = getAgent0Client()

    // Use score directly (already 0-100 scale, matches SDK requirement)
    const agent0Score = Math.max(0, Math.min(100, feedback.score))

    // Extract optional parameters from feedback metadata
    const tags = (feedback.metadata && typeof feedback.metadata === 'object' && 'tags' in feedback.metadata)
      ? (Array.isArray(feedback.metadata.tags) ? feedback.metadata.tags as string[] : [])
      : []
    
    const capability = (feedback.metadata && typeof feedback.metadata === 'object' && 'capability' in feedback.metadata)
      ? feedback.metadata.capability as string
      : feedback.category || undefined
    
    const skill = (feedback.metadata && typeof feedback.metadata === 'object' && 'skill' in feedback.metadata)
      ? feedback.metadata.skill as string
      : undefined

    // Submit to Agent0 network with retry mechanism (only for retryable errors)
    await retryIfRetryable(
      async () => {
        await agent0Client.submitFeedback({
          targetAgentId: agent0TokenId,
          rating: agent0Score, // 0-100 scale (matches SDK)
          comment: feedback.comment || 'Feedback from Babylon platform',
          transactionId: feedback.id,
          tags: tags.length > 0 ? tags : undefined,
          capability,
          skill,
        })
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        onRetry: (attempt, error) => {
          logger.warn('Retrying Agent0 feedback submission', {
            feedbackId,
            attempt,
            error: error.message,
          })
        },
      }
    )

    // Update feedback record to mark as submitted to Agent0
    await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        agent0TokenId: agent0TokenId,
        metadata: {
          ...(typeof feedback.metadata === 'object' && feedback.metadata !== null
            ? feedback.metadata
            : {}),
          agent0Submitted: true,
          agent0SubmittedAt: new Date().toISOString(),
        },
      },
    })

    logger.info('Feedback submitted to Agent0', {
      feedbackId,
      agent0TokenId,
      score: feedback.score,
      agent0Score,
      tags: tags.length,
      capability,
      skill,
      duration: Date.now() - startTime,
    })
    
    // Track success metric
    agent0Metrics.increment('agent0.feedback.success', {
      targetAgentId: agent0TokenId,
      hasTags: tags.length > 0,
      hasCapability: !!capability,
      hasSkill: !!skill,
    })

    // If requested, also submit to blockchain (ERC-8004)
    if (submitToBlockchain && feedback.toUser.nftTokenId) {
      logger.info('Submitting feedback to blockchain would require wallet client', {
        feedbackId,
        nftTokenId: feedback.toUser.nftTokenId,
      })
      // Note: Blockchain submission requires wallet client and gas
      // This would be called from a user-facing endpoint with wallet connection
    }

    return {
      agent0TokenId,
      agent0Rating: agent0Score, // Keep for backward compatibility
      submitted: true,
    }
  } catch (error) {
    // Track error metric
    agent0Metrics.increment('agent0.feedback.error', {
      errorType: error instanceof Error ? error.name : 'Unknown',
    })
    
    logger.error('Failed to submit feedback to Agent0', { 
      feedbackId, 
      error,
      duration: Date.now() - startTime,
    })
    
    // If it's already a structured error, rethrow
    if (error instanceof Agent0FeedbackError) {
      throw error
    }
    
    // Otherwise wrap in Agent0FeedbackError
    throw new Agent0FeedbackError(
      `Failed to submit feedback to Agent0: ${error instanceof Error ? error.message : String(error)}`,
      feedbackId,
      undefined,
      undefined,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Periodic sync of on-chain reputation to local database
 *
 * Should be called periodically (e.g., daily cron job) to keep local
 * reputation metrics in sync with blockchain state.
 *
 * @param userId - Optional user ID to sync (if not provided, syncs all agents)
 * @returns Sync results
 */
export async function periodicReputationSync(userId?: string) {
  try {
    logger.info('Starting periodic reputation sync', { userId })

    // Get users with Agent0 registration
    const users = await prisma.user.findMany({
      where: {
        agent0TokenId: { not: null },
        ...(userId ? { id: userId } : {}),
      },
      select: {
        id: true,
        agent0TokenId: true,
        nftTokenId: true,
        performanceMetrics: {
          select: {
            lastSyncedAt: true,
          },
        },
      },
    })

    logger.info(`Found ${users.length} agents to sync`, { userId })

    const results = []

    for (const user of users) {
      try {
        if (!user.agent0TokenId) continue

        // Skip if synced recently (within last hour)
        const lastSync = user.performanceMetrics?.lastSyncedAt
        if (lastSync && Date.now() - lastSync.getTime() < 3600000) {
          logger.debug('Skipping recently synced user', {
            userId: user.id,
            lastSync,
          })
          continue
        }

        // Sync on-chain reputation (ERC-8004)
        await syncOnChainReputation(user.id, user.agent0TokenId)

        // Sync from Agent0 network reputation
        try {
          const agent0Client = getAgent0Client()
          
          // Use getReputationSummary for more complete data
          const reputationSummary = await agent0Client.getReputationSummary(user.agent0TokenId)

          if (reputationSummary) {
            // Update local metrics with Agent0 reputation
            // Only update lastSyncedAt - Agent0 reputation is tracked via ReputationBridge
            await prisma.agentPerformanceMetrics.update({
              where: { userId: user.id },
              data: {
                lastSyncedAt: new Date(),
              },
            })

            logger.info('Synced Agent0 reputation', {
              userId: user.id,
              agent0TokenId: user.agent0TokenId,
              trustScore: reputationSummary.trustScore,
              accuracyScore: reputationSummary.accuracyScore,
              totalFeedback: reputationSummary.totalFeedback,
              note: 'Agent0 reputation aggregated via ReputationBridge.getAggregatedReputation()',
            })
          } else {
            // Fallback to getAgentProfile if getReputationSummary returns null
            const agent0Profile = await agent0Client.getAgentProfile(user.agent0TokenId)

            if (agent0Profile?.reputation) {
              await prisma.agentPerformanceMetrics.update({
                where: { userId: user.id },
                data: {
                  lastSyncedAt: new Date(),
                },
              })

              logger.info('Synced Agent0 reputation (fallback)', {
                userId: user.id,
                agent0TokenId: user.agent0TokenId,
                trustScore: agent0Profile.reputation.trustScore,
                accuracyScore: agent0Profile.reputation.accuracyScore,
                note: 'Agent0 reputation aggregated via ReputationBridge.getAggregatedReputation()',
              })
            }
          }
        } catch (error) {
          logger.warn('Failed to sync Agent0 reputation (non-critical)', {
            userId: user.id,
            agent0TokenId: user.agent0TokenId,
            error,
          })
          // Don't fail the entire sync if Agent0 sync fails
        }

        // Recalculate local reputation
        await recalculateReputation(user.id)

        results.push({
          userId: user.id,
          agent0TokenId: user.agent0TokenId,
          success: true,
          syncedAt: new Date(),
        })

        logger.info('User reputation synced', {
          userId: user.id,
          agent0TokenId: user.agent0TokenId,
        })
      } catch (error) {
        logger.error('Failed to sync user reputation', {
          userId: user.id,
          error,
        })

        results.push({
          userId: user.id,
          agent0TokenId: user.agent0TokenId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info('Periodic reputation sync completed', {
      total: users.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    })

    return {
      total: users.length,
      results,
    }
  } catch (error) {
    logger.error('Failed to run periodic reputation sync', { error })
    throw error
  }
}

/**
 * Enhance Agent0 registration metadata with reputation data
 *
 * Includes current reputation score and trust level in Agent0 metadata
 * when registering or updating agent profile.
 *
 * @param userId - User ID
 * @returns Enhanced metadata object
 */
export async function getReputationForAgent0Metadata(userId: string) {
  try {
    // Get reputation breakdown
    const reputation = await getReputationBreakdown(userId)

    if (!reputation) {
      return {
        reputation: {
          score: 50,
          trustLevel: 'UNRATED',
          confidence: 0,
          gamesPlayed: 0,
          winRate: 0,
        },
      }
    }

    return {
      reputation: {
        score: Math.round(reputation.reputationScore),
        trustLevel: reputation.trustLevel,
        confidence: Math.round(reputation.confidenceScore * 100) / 100,
        gamesPlayed: reputation.metrics.gamesPlayed,
        winRate: Math.round(reputation.metrics.winRate * 100) / 100,
        normalizedPnL: Math.round(reputation.metrics.normalizedPnL * 100) / 100,
        averageFeedbackScore: Math.round(reputation.metrics.averageFeedbackScore),
        totalFeedback: reputation.metrics.totalFeedbackCount,
      },
    }
  } catch (error) {
    logger.error('Failed to get reputation for Agent0 metadata', { userId, error })
    return {
      reputation: {
        score: 50,
        trustLevel: 'UNRATED',
        confidence: 0,
      },
    }
  }
}

/**
 * Sync specific user's reputation on demand
 *
 * Useful for immediate sync after important events (e.g., game completion, large trade).
 *
 * @param userId - User ID
 * @returns Updated metrics
 */
export async function syncUserReputationNow(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        agent0TokenId: true,
        nftTokenId: true,
      },
    })

    if (!user) {
      throw new Error(`User ${userId} not found`)
    }

    if (!user.agent0TokenId) {
      throw new Error(`User ${userId} has no Agent0 token ID`)
    }

    // Sync on-chain reputation
    const metrics = await syncOnChainReputation(userId, user.agent0TokenId)

    // Recalculate local reputation
    await recalculateReputation(userId)

    logger.info('On-demand reputation sync completed', {
      userId,
      agent0TokenId: user.agent0TokenId,
    })

    return metrics
  } catch (error) {
    logger.error('Failed to sync user reputation on demand', { userId, error })
    throw error
  }
}

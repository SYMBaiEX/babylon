/**
 * Reputation Calculation Service
 *
 * Aggregates performance metrics and feedback to calculate composite reputation scores.
 * Integrates PNL normalization, game scores, and user feedback into unified reputation.
 */

import { prisma } from '@/lib/database-service'
import {
  normalizePnL,
  calculateWinRate,
  getTrustLevel,
  calculateConfidenceScore,
} from './pnl-normalizer'
import { logger } from '@/lib/logger'

export interface ReputationScoreBreakdown {
  reputationScore: number
  trustLevel: string
  confidenceScore: number
  breakdown: {
    pnlComponent: number
    feedbackComponent: number
    activityComponent: number
  }
  metrics: {
    normalizedPnL: number
    averageFeedbackScore: number
    gamesPlayed: number
    totalFeedbackCount: number
    winRate: number
  }
}

/**
 * Calculate composite reputation score for a user/agent
 *
 * Weighted composite formula:
 * Reputation = (PNL * 0.4) + (Feedback * 0.4) + (Activity * 0.2)
 *
 * Components:
 * - PNL (40%): Normalized profit/loss performance (0-100)
 * - Feedback (40%): Average feedback score from others (0-100)
 * - Activity (20%): Games/interactions played (0-100, capped at 50 games)
 *
 * @param normalizedPnL - PNL normalized to 0-1 scale
 * @param averageFeedbackScore - Average feedback score (0-100)
 * @param gamesPlayed - Number of games played
 * @returns Composite reputation score (0-100)
 */
export function calculateReputationScore(
  normalizedPnL: number,
  averageFeedbackScore: number,
  gamesPlayed: number
): number {
  // Weight distribution
  const pnlWeight = 0.4
  const feedbackWeight = 0.4
  const activityWeight = 0.2

  // Convert normalized PNL (0-1) to 0-100 scale
  const pnlComponent = normalizedPnL * 100

  // Feedback is already on 0-100 scale
  const feedbackComponent = averageFeedbackScore

  // Activity bonus: linear scaling, caps at 50 games = 100 points
  // 0 games = 0 points, 25 games = 50 points, 50+ games = 100 points
  const activityComponent = Math.min(100, gamesPlayed * 2)

  // Weighted sum
  const score =
    pnlComponent * pnlWeight + feedbackComponent * feedbackWeight + activityComponent * activityWeight

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score))
}

/**
 * Update agent performance metrics based on completed game
 *
 * @param userId - User/agent ID
 * @param gameScore - Game performance score (0-100)
 * @param won - Whether the game was won
 * @returns Updated metrics
 */
export async function updateGameMetrics(userId: string, gameScore: number, won: boolean) {
  logger.info('Updating game metrics', { userId, gameScore, won }, 'ReputationService')

  // Get or create metrics
  let metrics = await prisma.agentPerformanceMetrics.findUnique({
    where: { userId },
  })

  if (!metrics) {
    metrics = await prisma.agentPerformanceMetrics.create({
      data: {
        userId,
        gamesPlayed: 0,
        gamesWon: 0,
        averageGameScore: 0,
      },
    })
  }

  // Calculate new average game score
  const totalGames = metrics.gamesPlayed + 1
  const newAverageScore =
    (metrics.averageGameScore * metrics.gamesPlayed + gameScore) / totalGames

  // Update metrics
  const updated = await prisma.agentPerformanceMetrics.update({
    where: { userId },
    data: {
      gamesPlayed: totalGames,
      gamesWon: won ? metrics.gamesWon + 1 : metrics.gamesWon,
      averageGameScore: newAverageScore,
      lastGameScore: gameScore,
      lastGamePlayedAt: new Date(),
      lastActivityAt: new Date(),
      firstActivityAt: metrics.firstActivityAt || new Date(),
    },
  })

  // Recalculate reputation
  await recalculateReputation(userId)

  return updated
}

/**
 * Update trading performance metrics
 *
 * @param userId - User/agent ID
 * @param pnl - Profit/loss from trade
 * @param invested - Amount invested
 * @param profitable - Whether trade was profitable
 */
export async function updateTradingMetrics(
  userId: string,
  pnl: number,
  invested: number,
  profitable: boolean
) {
  logger.info('Updating trading metrics', { userId, pnl, invested, profitable }, 'ReputationService')

  // Get user's lifetime PNL and total deposits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lifetimePnL: true, totalDeposited: true },
  })

  if (!user) {
    throw new Error(`User ${userId} not found`)
  }

  // Normalize PNL based on total deposits
  const totalInvested = user.totalDeposited.toNumber()
  const lifetimePnLNum = user.lifetimePnL.toNumber()
  const normalized = normalizePnL(lifetimePnLNum, totalInvested)

  // Get or create metrics
  let metrics = await prisma.agentPerformanceMetrics.findUnique({
    where: { userId },
  })

  if (!metrics) {
    metrics = await prisma.agentPerformanceMetrics.create({
      data: {
        userId,
        normalizedPnL: normalized,
        totalTrades: 0,
        profitableTrades: 0,
      },
    })
  }

  // Update trade counts
  const newTotalTrades = metrics.totalTrades + 1
  const newProfitableTrades = profitable ? metrics.profitableTrades + 1 : metrics.profitableTrades

  // Calculate win rate
  const winRate = calculateWinRate(newProfitableTrades, newTotalTrades)

  // Calculate average ROI (simplified - would need full trade history for accuracy)
  const avgROI = lifetimePnLNum / totalInvested

  // Update metrics
  const updated = await prisma.agentPerformanceMetrics.update({
    where: { userId },
    data: {
      normalizedPnL: normalized,
      totalTrades: newTotalTrades,
      profitableTrades: newProfitableTrades,
      winRate,
      averageROI: avgROI,
      lastActivityAt: new Date(),
      firstActivityAt: metrics.firstActivityAt || new Date(),
    },
  })

  // Recalculate reputation
  await recalculateReputation(userId)

  return updated
}

/**
 * Update feedback metrics when new feedback is submitted
 *
 * @param userId - User/agent receiving feedback
 * @param score - Feedback score (0-100)
 */
export async function updateFeedbackMetrics(userId: string, score: number) {
  logger.info('Updating feedback metrics', { userId, score }, 'ReputationService')

  // Get or create metrics
  let metrics = await prisma.agentPerformanceMetrics.findUnique({
    where: { userId },
  })

  if (!metrics) {
    metrics = await prisma.agentPerformanceMetrics.create({
      data: {
        userId,
        totalFeedbackCount: 0,
        averageFeedbackScore: 50, // Start at neutral
      },
    })
  }

  // Calculate new average
  const newCount = metrics.totalFeedbackCount + 1
  const newAverage = (metrics.averageFeedbackScore * metrics.totalFeedbackCount + score) / newCount

  // Classify feedback
  const isPositive = score >= 70
  const isNeutral = score >= 40 && score < 70
  const isNegative = score < 40

  // Update metrics
  const updated = await prisma.agentPerformanceMetrics.update({
    where: { userId },
    data: {
      totalFeedbackCount: newCount,
      averageFeedbackScore: newAverage,
      positiveCount: isPositive ? metrics.positiveCount + 1 : metrics.positiveCount,
      neutralCount: isNeutral ? metrics.neutralCount + 1 : metrics.neutralCount,
      negativeCount: isNegative ? metrics.negativeCount + 1 : metrics.negativeCount,
      totalInteractions: metrics.totalInteractions + 1,
      lastActivityAt: new Date(),
      firstActivityAt: metrics.firstActivityAt || new Date(),
    },
  })

  // Recalculate reputation
  await recalculateReputation(userId)

  return updated
}

/**
 * Recalculate composite reputation score for a user
 *
 * @param userId - User/agent ID
 * @returns Updated metrics with new reputation score
 */
export async function recalculateReputation(userId: string) {
  const metrics = await prisma.agentPerformanceMetrics.findUnique({
    where: { userId },
  })

  if (!metrics) {
    return null
  }

  // Calculate composite reputation
  const reputationScore = calculateReputationScore(
    metrics.normalizedPnL,
    metrics.averageFeedbackScore,
    metrics.gamesPlayed
  )

  // Determine trust level
  const trustLevel = getTrustLevel(reputationScore)

  // Calculate confidence based on sample size (games + feedback)
  const sampleSize = metrics.gamesPlayed + metrics.totalFeedbackCount
  const confidenceScore = calculateConfidenceScore(sampleSize)

  // Update metrics
  const updated = await prisma.agentPerformanceMetrics.update({
    where: { userId },
    data: {
      reputationScore,
      trustLevel,
      confidenceScore,
    },
  })

  logger.info(
    'Recalculated reputation',
    { userId, reputationScore, trustLevel, confidenceScore },
    'ReputationService'
  )

  return updated
}

/**
 * Get detailed reputation breakdown for a user
 *
 * @param userId - User/agent ID
 * @returns Reputation score with component breakdown
 */
export async function getReputationBreakdown(userId: string): Promise<ReputationScoreBreakdown | null> {
  const metrics = await prisma.agentPerformanceMetrics.findUnique({
    where: { userId },
  })

  if (!metrics) {
    return null
  }

  // Calculate components
  const pnlComponent = metrics.normalizedPnL * 100
  const feedbackComponent = metrics.averageFeedbackScore
  const activityComponent = Math.min(100, metrics.gamesPlayed * 2)

  return {
    reputationScore: metrics.reputationScore,
    trustLevel: metrics.trustLevel,
    confidenceScore: metrics.confidenceScore,
    breakdown: {
      pnlComponent,
      feedbackComponent,
      activityComponent,
    },
    metrics: {
      normalizedPnL: metrics.normalizedPnL,
      averageFeedbackScore: metrics.averageFeedbackScore,
      gamesPlayed: metrics.gamesPlayed,
      totalFeedbackCount: metrics.totalFeedbackCount,
      winRate: metrics.winRate,
    },
  }
}

/**
 * Get leaderboard of top-rated agents
 *
 * @param limit - Number of agents to return
 * @param minGames - Minimum games played to qualify
 * @returns Array of agents sorted by reputation score
 */
export async function getReputationLeaderboard(limit = 100, minGames = 5) {
  const topAgents = await prisma.agentPerformanceMetrics.findMany({
    where: {
      gamesPlayed: {
        gte: minGames,
      },
    },
    orderBy: {
      reputationScore: 'desc',
    },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          profileImageUrl: true,
          isActor: true,
        },
      },
    },
  })

  return topAgents.map((agent, index) => ({
    rank: index + 1,
    userId: agent.userId,
    username: agent.user.username,
    displayName: agent.user.displayName,
    profileImageUrl: agent.user.profileImageUrl,
    isActor: agent.user.isActor,
    reputationScore: agent.reputationScore,
    trustLevel: agent.trustLevel,
    confidenceScore: agent.confidenceScore,
    gamesPlayed: agent.gamesPlayed,
    winRate: agent.winRate,
    normalizedPnL: agent.normalizedPnL,
  }))
}

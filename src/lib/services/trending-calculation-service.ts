/**
 * Trending Calculation Service
 * 
 * Calculates trending tags using time-weighted algorithm
 * Similar to X/Twitter trending topics
 */

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  getTagStatistics,
  storeTrendingTags,
  getRelatedTags,
} from './tag-storage-service'

const CALCULATION_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const TRENDING_WINDOW_DAYS = 7 // Look at last 7 days

/**
 * Check if we should recalculate trending tags
 */
export async function shouldRecalculateTrending(): Promise<boolean> {
  const lastCalculation = await prisma.trendingTag.findFirst({
    orderBy: { calculatedAt: 'desc' },
    select: { calculatedAt: true },
  })

  if (!lastCalculation) {
    return true // Never calculated before
  }

  const timeSinceLastCalc = Date.now() - lastCalculation.calculatedAt.getTime()
  return timeSinceLastCalc >= CALCULATION_INTERVAL_MS
}

/**
 * Calculate trending score for a tag
 * 
 * Algorithm:
 * - Time decay: More recent posts weighted higher
 * - Volume boost: More posts = higher score
 * - Velocity boost: Rapid increase in last 24h = higher score
 */
function calculateTrendingScore(
  postCount: number,
  recentPostCount: number,
  oldestPostDate: Date,
  newestPostDate: Date,
  windowEnd: Date
): number {
  // Base score from total post count
  let score = postCount

  // Time decay factor (exponential decay over 7 days)
  const avgPostAge = (windowEnd.getTime() - oldestPostDate.getTime()) / 2
  const daysSinceAvgPost = avgPostAge / (1000 * 60 * 60 * 24)
  const decayFactor = Math.exp(-daysSinceAvgPost / 3) // Decay half-life of 3 days
  score *= decayFactor

  // Velocity boost (recent activity)
  if (postCount > 0) {
    const recentRatio = recentPostCount / postCount
    const velocityBoost = 1 + (recentRatio * 2) // Up to 3x multiplier for very recent activity
    score *= velocityBoost
  }

  // Recency boost (how fresh is the newest post)
  const hoursSinceNewest = (windowEnd.getTime() - newestPostDate.getTime()) / (1000 * 60 * 60)
  if (hoursSinceNewest < 1) {
    score *= 1.5 // 50% boost for posts in last hour
  } else if (hoursSinceNewest < 6) {
    score *= 1.2 // 20% boost for posts in last 6 hours
  }

  return score
}

/**
 * Calculate trending tags
 */
export async function calculateTrendingTags(): Promise<void> {
  const startTime = Date.now()
  logger.info('Starting trending tags calculation', undefined, 'TrendingCalculationService')

  try {
    // Define time window (last 7 days)
    const windowEnd = new Date()
    const windowStart = new Date(windowEnd.getTime() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Get tag statistics
    const tagStats = await getTagStatistics(windowStart, windowEnd)
    
    if (tagStats.length === 0) {
      logger.info('No tags to calculate trending for', undefined, 'TrendingCalculationService')
      return
    }

    logger.debug('Retrieved tag statistics', {
      tagCount: tagStats.length,
    }, 'TrendingCalculationService')

    // Calculate scores for each tag
    const scoredTags = tagStats.map(tag => ({
      tagId: tag.tagId,
      tagName: tag.tagName,
      tagDisplayName: tag.tagDisplayName,
      tagCategory: tag.tagCategory,
      postCount: tag.postCount,
      score: calculateTrendingScore(
        tag.postCount,
        tag.recentPostCount,
        tag.oldestPostDate,
        tag.newestPostDate,
        windowEnd
      ),
    }))

    // Sort by score and assign ranks
    scoredTags.sort((a, b) => b.score - a.score)
    
    // Take top 20 trending tags
    const topTrending = scoredTags.slice(0, 20)

    // Get related tags for context (async)
    const trendingWithContext = await Promise.all(
      topTrending.map(async (tag, index) => {
        // Only add "Trending with" context for some tags
        let relatedContext: string | undefined
        if (index < 10 && Math.random() > 0.5) {
          const relatedTags = await getRelatedTags(tag.tagId, 1)
          if (relatedTags.length > 0) {
            relatedContext = `Trending with ${relatedTags[0]}`
          }
        }

        return {
          tagId: tag.tagId,
          score: tag.score,
          postCount: tag.postCount,
          rank: index + 1,
          relatedContext,
        }
      })
    )

    // Store trending tags
    await storeTrendingTags(trendingWithContext, windowStart, windowEnd)

    const duration = Date.now() - startTime
    logger.info('Trending tags calculation completed', {
      duration: `${duration}ms`,
      tagsCalculated: topTrending.length,
      topTag: topTrending[0]?.tagDisplayName,
    }, 'TrendingCalculationService')
  } catch (error) {
    logger.error('Error calculating trending tags', { error }, 'TrendingCalculationService')
    throw error
  }
}

/**
 * Calculate trending tags if needed (called from cron)
 */
export async function calculateTrendingIfNeeded(): Promise<boolean> {
  const shouldCalculate = await shouldRecalculateTrending()
  
  if (!shouldCalculate) {
    logger.debug('Trending calculation not needed yet', undefined, 'TrendingCalculationService')
    return false
  }

  await calculateTrendingTags()
  return true
}


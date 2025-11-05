import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/database-service'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { StatsQuerySchema } from '@/lib/validation/schemas'
import { logger } from '@/lib/logger'

interface BabylonStats {
  activePlayers: number
  aiAgents: number
  totalHoots: number
  pointsInCirculation: string
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const queryParams = {
    includeMarkets: searchParams.get('includeMarkets') || 'true',
    includeUsers: searchParams.get('includeUsers') || 'true',
    includePools: searchParams.get('includePools') || 'true',
    includeVolume: searchParams.get('includeVolume') || 'true'
  }
  StatsQuerySchema.parse(queryParams)
  // Get all stats in parallel for better performance
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  
  const [activePlayers, aiAgents, totalHoots, userPointsResult, actorPointsResult] = await Promise.all([
    // Get active users (logged in within last 7 days) - exclude actors
    prisma.user.count({
      where: {
        isActor: false, // Only real users, not NPCs
        updatedAt: {
          gte: sevenDaysAgo,
        },
      },
    }),
    
    // Get AI agents from Actor table (all actors, not just those with pools)
    prisma.actor.count(),
    
    // Get total posts (hoots) - all posts from both users and actors
    prisma.post.count(),
    
    // Calculate points in circulation (sum of all user virtual balances)
    prisma.user.aggregate({
      _sum: {
        virtualBalance: true,
      },
      where: {
        isActor: false, // Only count real users' virtual balances
      },
    }),
    
    // Sum actor trading balances
    prisma.actor.aggregate({
      _sum: {
        tradingBalance: true,
      },
    })
  ])

  const userPoints = userPointsResult._sum.virtualBalance || BigInt(0)
  const actorPoints = actorPointsResult._sum.tradingBalance || BigInt(0)
  const totalPoints = Number(userPoints) + Number(actorPoints)
  const pointsInCirculation = formatPoints(BigInt(totalPoints))

  const stats: BabylonStats = {
    activePlayers,
    aiAgents,
    totalHoots,
    pointsInCirculation,
  }

  logger.info('Babylon stats fetched successfully', stats, 'GET /api/feed/widgets/stats')

  return successResponse({
    success: true,
    stats,
  })
})

function formatPoints(points: bigint): string {
  const num = Number(points)
  
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M pts`
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K pts`
  }
  
  return `${num.toLocaleString()} pts`
}

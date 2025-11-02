import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

interface BabylonStats {
  activePlayers: number
  aiAgents: number
  totalHoots: number
  pointsInCirculation: string
}

export async function GET(_request: NextRequest) {
  try {
    // Get active users (logged in within last 7 days) - exclude actors
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const activePlayers = await prisma.user.count({
      where: {
        isActor: false, // Only real users, not NPCs
        updatedAt: {
          gte: sevenDaysAgo,
        },
      },
    })

    // Get AI agents from Actor table (all actors, not just those with pools)
    // This represents NPCs/characters in the game
    const aiAgents = await prisma.actor.count()

    // Get total posts (hoots) - all posts from both users and actors
    const totalHoots = await prisma.post.count()

    // Calculate points in circulation (sum of all user virtual balances + actor trading balances)
    // This represents the total virtual currency in the game economy
    const userPointsResult = await prisma.user.aggregate({
      _sum: {
        virtualBalance: true,
      },
      where: {
        isActor: false, // Only count real users' virtual balances
      },
    })

    const actorPointsResult = await prisma.actor.aggregate({
      _sum: {
        tradingBalance: true,
      },
    })

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

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error) {
    logger.error('Error fetching Babylon stats:', error, 'GET /api/feed/widgets/stats')
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}

function formatPoints(points: bigint): string {
  const num = Number(points)
  
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M pts`
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K pts`
  }
  
  return `${num.toLocaleString()} pts`
}

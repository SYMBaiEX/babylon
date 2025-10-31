/**
 * User Reputation API Route
 *
 * Fetches on-chain reputation data and calculates stats
 * GET /api/users/[userId]/reputation
 */

import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { errorResponse, successResponse } from '@/lib/api/auth-middleware'
import { ReputationService } from '@/lib/services/reputation-service'

const prisma = new PrismaClient()

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params

    if (!userId) {
      return errorResponse('User ID is required', 400)
    }

    // 1. Get user's NFT token ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nftTokenId: true,
        onChainRegistered: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404)
    }

    if (!user.onChainRegistered || !user.nftTokenId) {
      return successResponse({
        hasNft: false,
        message: 'User has not completed on-chain registration',
      })
    }

    // 2. Get on-chain reputation
    const currentReputation = await ReputationService.getOnChainReputation(userId)

    // 3. Get all positions for this user
    const positions = await prisma.position.findMany({
      where: {
        userId: userId,
      },
      include: {
        market: {
          select: {
            id: true,
            question: true,
            resolvedAt: true,
            actualOutcome: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // 4. Calculate wins and losses from resolved positions
    const resolvedPositions = positions.filter(
      (p) => p.market.resolvedAt && p.market.actualOutcome !== null
    )

    let totalWins = 0
    let totalLosses = 0
    const recentActivity: Array<{
      marketId: string
      marketTitle: string
      outcome: 'win' | 'loss'
      reputationChange: number
      timestamp: Date
    }> = []

    for (const position of resolvedPositions) {
      const isWinner = position.side === position.market.actualOutcome

      if (isWinner) {
        totalWins++
        recentActivity.push({
          marketId: position.marketId,
          marketTitle: position.market.question,
          outcome: 'win',
          reputationChange: 10,
          timestamp: position.market.resolvedAt!,
        })
      } else {
        totalLosses++
        recentActivity.push({
          marketId: position.marketId,
          marketTitle: position.market.question,
          outcome: 'loss',
          reputationChange: -5,
          timestamp: position.market.resolvedAt!,
        })
      }
    }

    // 5. Calculate win rate
    const totalResolved = totalWins + totalLosses
    const winRate = totalResolved > 0 ? (totalWins / totalResolved) * 100 : 0

    // 6. Sort recent activity by timestamp and limit to 10 most recent
    recentActivity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    const limitedActivity = recentActivity.slice(0, 10)

    return successResponse({
      hasNft: true,
      currentReputation: currentReputation || 100, // Default to 100 if blockchain read fails
      totalWins,
      totalLosses,
      winRate: Number(winRate.toFixed(1)),
      recentActivity: limitedActivity,
      nftTokenId: user.nftTokenId,
    })
  } catch (error) {
    console.error('Reputation fetch error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch reputation',
      500
    )
  }
}

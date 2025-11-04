/**
 * Agent Monitoring API
 *
 * Provides visibility into agent activity:
 * - Agent posts to feed
 * - Agent bets/trades
 * - Agent chat participation
 * - Agent health status
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/database-service'
import type { Prisma } from '@prisma/client'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { AuthorizationError } from '@/lib/errors'
import { authenticate } from '@/lib/api/auth-middleware'
import { logger } from '@/lib/logger'
import { AgentMonitoringQuerySchema } from '@/lib/validation/schemas'

interface AgentActivity {
  agentId: string
  username: string | null
  displayName: string | null
  tokenId: number | null
  walletAddress: string | null
  stats: {
    posts: number
    comments: number
    positions: number
    trades: number
    totalVolume: number
    lifetimePnL: number
  }
  recentActivity: {
    lastPost?: string
    lastTrade?: string
    lastComment?: string
  }
  isActive: boolean
}

/**
 * GET /api/agents/monitoring
 * Get activity metrics for all agents
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Authenticate (admin or system only - can be relaxed later)
  const user = await authenticate(request)

  // Log monitoring access for audit trail
  logger.info(`User ${user.userId} (isAgent: ${user.isAgent}) accessing agent monitoring`, {
    userId: user.userId,
    isAgent: user.isAgent ?? false
  }, 'AgentMonitoring')

  // For now, allow all authenticated users, but log access
  // TODO: Add admin-only restriction when admin roles are implemented
  if (!user.userId) {
    throw new AuthorizationError('Authentication required for monitoring endpoint', 'monitoring', 'read')
  }

  // Validate query parameters
  const { searchParams } = new URL(request.url)
  const query = {
    agentId: searchParams.get('agentId'),
    limit: searchParams.get('limit')
  }
  const validatedQuery = AgentMonitoringQuerySchema.parse(query)

  const agentId = validatedQuery.agentId
  const limit = validatedQuery.limit

    // Build where clause for agents
    const where: Prisma.UserWhereInput = {
      username: {
        startsWith: 'babylon-agent-',
      },
    }

    if (agentId) {
      where.username = agentId
    }

    // Get all agents
    const agents = await prisma.user.findMany({
      where,
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        walletAddress: true,
        nftTokenId: true,
        createdAt: true,
        _count: {
          select: {
            positions: true,
            comments: true,
          },
        },
      },
    })

    // Get activity stats for each agent
    const agentActivities: AgentActivity[] = await Promise.all(
      agents.map(async (agent) => {
        // Count posts
        const posts = await prisma.post.count({
          where: {
            authorId: agent.id,
          },
        })

        // Get recent posts
        const lastPost = await prisma.post.findFirst({
          where: { authorId: agent.id },
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true },
        })

        // Get positions and calculate volume
        const positions = await prisma.position.findMany({
          where: { userId: agent.id },
          include: {
            market: {
              select: {
                id: true,
                question: true,
              },
            },
          },
        })

        // Calculate total volume from positions
        let totalVolume = 0
        for (const pos of positions) {
          totalVolume += Number(pos.shares) * Number(pos.avgPrice)
        }

        // Get recent trades (from balance transactions)
        const recentTrades = await prisma.balanceTransaction.findMany({
          where: {
            userId: agent.id,
            description: {
              contains: 'pred_',
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        })

        // Get recent comments
        const lastComment = await prisma.comment.findFirst({
          where: { authorId: agent.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })

        // Determine if agent is active (activity in last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const isActive =
          (lastPost && lastPost.timestamp > oneDayAgo) ||
          (lastComment && lastComment.createdAt > oneDayAgo) ||
          (recentTrades.length > 0 && recentTrades[0]!.createdAt > oneDayAgo)

        // Get lifetime P&L
        const user = await prisma.user.findUnique({
          where: { id: agent.id },
          select: { lifetimePnL: true },
        })

        return {
          agentId: agent.username || agent.id,
          username: agent.username,
          displayName: agent.displayName,
          tokenId: agent.nftTokenId,
          walletAddress: agent.walletAddress,
          stats: {
            posts,
            comments: agent._count.comments,
            positions: agent._count.positions,
            trades: positions.length, // Each position is a trade
            totalVolume,
            lifetimePnL: user ? Number(user.lifetimePnL) : 0,
          },
          recentActivity: {
            lastPost: lastPost?.timestamp.toISOString(),
            lastTrade: recentTrades[0]?.createdAt.toISOString(),
            lastComment: lastComment?.createdAt.toISOString(),
          },
          isActive,
        }
      })
    )

  // Calculate summary stats
  const summary = {
    totalAgents: agentActivities.length,
    activeAgents: agentActivities.filter((a) => a.isActive).length,
    totalPosts: agentActivities.reduce((sum, a) => sum + a.stats.posts, 0),
    totalTrades: agentActivities.reduce((sum, a) => sum + a.stats.trades, 0),
    totalVolume: agentActivities.reduce((sum, a) => sum + a.stats.totalVolume, 0),
  }

  logger.info('Agent monitoring data fetched successfully', { totalAgents: summary.totalAgents, activeAgents: summary.activeAgents }, 'GET /api/agents/monitoring')

  return successResponse({
    agents: agentActivities,
    summary,
    timestamp: new Date().toISOString(),
  })
})



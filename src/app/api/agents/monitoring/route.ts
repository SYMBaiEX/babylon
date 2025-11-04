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

    // Batch fetch all activity data for all agents (7 queries total instead of 6N+1!)
    const agentIds = agents.map(a => a.id)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const [
      postCounts,
      lastPosts,
      allPositions,
      recentTrades,
      lastComments,
      lifetimePnLData
    ] = await Promise.all([
      // 1. Count posts by author (batched)
      prisma.post.groupBy({
        by: ['authorId'],
        where: { authorId: { in: agentIds } },
        _count: { id: true },
      }),
      // 2. Get last post for each author
      prisma.post.findMany({
        where: { authorId: { in: agentIds } },
        orderBy: { timestamp: 'desc' },
        select: { authorId: true, timestamp: true },
        distinct: ['authorId'],
      }),
      // 3. Get all positions (batched)
      prisma.position.findMany({
        where: { userId: { in: agentIds } },
        select: {
          userId: true,
          shares: true,
          avgPrice: true,
        },
      }),
      // 4. Get recent trades (batched)
      prisma.balanceTransaction.findMany({
        where: {
          userId: { in: agentIds },
          description: { contains: 'pred_' },
        },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, createdAt: true },
        distinct: ['userId'],
      }),
      // 5. Get last comments (batched)
      prisma.comment.findMany({
        where: { authorId: { in: agentIds } },
        orderBy: { createdAt: 'desc' },
        select: { authorId: true, createdAt: true },
        distinct: ['authorId'],
      }),
      // 6. Get lifetime P&L (batched)
      prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, lifetimePnL: true },
      }),
    ])

    // Create lookup maps for O(1) access
    const postCountMap = new Map(postCounts.map(p => [p.authorId, p._count.id]))
    const lastPostMap = new Map(lastPosts.map(p => [p.authorId, p.timestamp]))
    const lastCommentMap = new Map(lastComments.map(c => [c.authorId, c.createdAt]))
    const recentTradeMap = new Map(recentTrades.map(t => [t.userId, t.createdAt]))
    const pnlMap = new Map(lifetimePnLData.map(u => [u.id, u.lifetimePnL]))
    
    // Group positions by userId and calculate volume + count
    const positionDataMap = new Map<string, { volume: number; count: number }>()
    for (const pos of allPositions) {
      const volume = Number(pos.shares) * Number(pos.avgPrice)
      const existing = positionDataMap.get(pos.userId)
      if (existing) {
        existing.volume += volume
        existing.count += 1
      } else {
        positionDataMap.set(pos.userId, { volume, count: 1 })
      }
    }

    // Build agent activities using pre-fetched data
    const agentActivities: AgentActivity[] = agents.map((agent) => {
      const lastPost = lastPostMap.get(agent.id)
      const lastComment = lastCommentMap.get(agent.id)
      const lastTrade = recentTradeMap.get(agent.id)
      const positionData = positionDataMap.get(agent.id) || { volume: 0, count: 0 }
      
      // Determine if agent is active (activity in last 24 hours)
      const isActive = !!(
        (lastPost && lastPost > oneDayAgo) ||
        (lastComment && lastComment > oneDayAgo) ||
        (lastTrade && lastTrade > oneDayAgo)
      )

      return {
        agentId: agent.username || agent.id,
        username: agent.username,
        displayName: agent.displayName,
        tokenId: agent.nftTokenId,
        walletAddress: agent.walletAddress,
        stats: {
          posts: postCountMap.get(agent.id) || 0,
          comments: agent._count.comments,
          positions: agent._count.positions,
          trades: positionData.count,
          totalVolume: positionData.volume,
          lifetimePnL: Number(pnlMap.get(agent.id) || 0),
        },
        recentActivity: {
          lastPost: lastPost?.toISOString(),
          lastTrade: lastTrade?.toISOString(),
          lastComment: lastComment?.toISOString(),
        },
        isActive,
      }
    })

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



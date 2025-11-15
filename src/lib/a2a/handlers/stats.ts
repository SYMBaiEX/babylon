/**
 * A2A Stats & Discovery Handlers
 * Handlers for leaderboard, reputation, trending, organizations, referrals
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  GetLeaderboardParamsSchema,
  GetUserStatsParamsSchema,
  GetReputationParamsSchema,
  GetReputationBreakdownParamsSchema,
  GetTrendingTagsParamsSchema,
  GetPostsByTagParamsSchema,
  GetOrganizationsParamsSchema,
} from '../validation'

export async function handleGetLeaderboard(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetLeaderboardParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { page, pageSize, minPoints } = validation.data
    const skip = (page - 1) * pageSize
    
    const users = await prisma.user.findMany({
      where: {
        reputationPoints: { gte: minPoints }
      },
      take: pageSize,
      skip,
      orderBy: { reputationPoints: 'desc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true,
        reputationPoints: true
      }
    })
    
    const total = await prisma.user.count({
      where: { reputationPoints: { gte: minPoints } }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        leaderboard: users.map((u, idx) => ({
          rank: skip + idx + 1,
          ...u,
          points: u.reputationPoints
        })),
        pagination: {
          page,
          pageSize,
          totalCount: total,
          totalPages: Math.ceil(total / pageSize)
        }
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetLeaderboard', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch leaderboard' },
      id: request.id
    }
  }
}

export async function handleGetUserStats(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetUserStatsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId } = validation.data
    
    const [user, postCount, followerCount, followingCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.post.count({ where: { authorId: userId } }),
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } })
    ])
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'User not found' },
        id: request.id
      }
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        posts: postCount,
        followers: followerCount,
        following: followingCount,
        reputationPoints: user.reputationPoints
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetUserStats', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch user stats' },
      id: request.id
    }
  }
}

export async function handleGetSystemStats(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const [userCount, postCount, marketCount] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.market.count()
    ])
    
    return {
      jsonrpc: '2.0',
      result: {
        users: userCount,
        posts: postCount,
        markets: marketCount
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetSystemStats', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch system stats' },
      id: request.id
    }
  }
}

export async function handleGetReferrals(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true }
    })
    
    if (!user?.referralCode) {
      return {
        jsonrpc: '2.0',
        result: { referrals: [] } as unknown as JsonRpcResult,
        id: request.id
      }
    }
    
    const referrals = await prisma.user.findMany({
      where: { referredBy: user.referralCode },
      select: {
        id: true,
        username: true,
        displayName: true,
        createdAt: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { referrals } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetReferrals', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch referrals' },
      id: request.id
    }
  }
}

export async function handleGetReferralStats(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true }
    })
    
    const totalReferrals = user?.referralCode
      ? await prisma.user.count({ where: { referredBy: user.referralCode } })
      : 0
    
    return {
      jsonrpc: '2.0',
      result: {
        totalReferrals,
        referralCode: user?.referralCode || null
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetReferralStats', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch referral stats' },
      id: request.id
    }
  }
}

export async function handleGetReferralCode(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const userId = agentId
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        referralCode: user?.referralCode || null
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetReferralCode', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch referral code' },
      id: request.id
    }
  }
}

export async function handleGetReputation(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetReputationParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const userId = validation.data.userId || agentId
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reputationPoints: true }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'User not found' },
        id: request.id
      }
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        reputationPoints: user.reputationPoints
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetReputation', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch reputation' },
      id: request.id
    }
  }
}

export async function handleGetReputationBreakdown(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetReputationBreakdownParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId } = validation.data
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        reputationPoints: true
      }
    })
    
    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'User not found' },
        id: request.id
      }
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        total: user.reputationPoints,
        earned: 0,
        invites: 0
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetReputationBreakdown', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch reputation breakdown' },
      id: request.id
    }
  }
}

export async function handleGetTrendingTags(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetTrendingTagsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { limit } = validation.data
    
    const tags = await prisma.tag.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        displayName: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { tags } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetTrendingTags', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch trending tags' },
      id: request.id
    }
  }
}

export async function handleGetPostsByTag(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetPostsByTagParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { tag, limit, offset } = validation.data
    
    const posts = await prisma.post.findMany({
      where: {
        content: { contains: `#${tag}`, mode: 'insensitive' }
      },
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' }
    })
    
    return {
      jsonrpc: '2.0',
      result: { posts } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetPostsByTag', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch posts by tag' },
      id: request.id
    }
  }
}

export async function handleGetOrganizations(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetOrganizationsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { limit } = validation.data
    
    const orgs = await prisma.organization.findMany({
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        currentPrice: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { organizations: orgs } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetOrganizations', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch organizations' },
      id: request.id
    }
  }
}


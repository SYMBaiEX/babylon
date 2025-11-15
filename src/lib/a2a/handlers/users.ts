/**
 * A2A User Management Handlers
 * Handlers for profiles, following, search
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { logger } from '@/lib/logger'
import {
  GetUserProfileParamsSchema,
  UpdateProfileParamsSchema,
  FollowUserParamsSchema,
  UnfollowUserParamsSchema,
  GetFollowersParamsSchema,
  GetFollowingParamsSchema,
  SearchUsersParamsSchema,
} from '../validation'

export async function handleGetUserProfile(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetUserProfileParamsSchema.safeParse(request.params)
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
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        reputationPoints: true,
        virtualBalance: true
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
      result: user as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetUserProfile', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch user profile' },
      id: request.id
    }
  }
}

export async function handleUpdateProfile(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = UpdateProfileParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const updates = validation.data
    const userId = agentId
    
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true, user } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleUpdateProfile', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to update profile' },
      id: request.id
    }
  }
}

export async function handleFollowUser(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = FollowUserParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId: targetUserId } = validation.data
    const userId = agentId
    
    if (userId === targetUserId) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: 'Cannot follow yourself' },
        id: request.id
      }
    }
    
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!targetUser) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'User not found' },
        id: request.id
      }
    }
    
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targetUserId
        }
      }
    })
    
    if (!existing) {
      await prisma.follow.create({
        data: {
          id: await generateSnowflakeId(),
          followerId: userId,
          followingId: targetUserId
        }
      })
    }
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleFollowUser', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to follow user' },
      id: request.id
    }
  }
}

export async function handleUnfollowUser(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = UnfollowUserParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId: targetUserId } = validation.data
    const userId = agentId
    
    await prisma.follow.deleteMany({
      where: {
        followerId: userId,
        followingId: targetUserId
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleUnfollowUser', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to unfollow user' },
      id: request.id
    }
  }
}

export async function handleGetFollowers(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetFollowersParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId, limit } = validation.data
    
    const follows = await prisma.follow.findMany({
      where: { followingId: userId },
      take: limit,
      select: {
        followerId: true
      }
    })
    
    const followerIds = follows.map(f => f.followerId)
    const followers = await prisma.user.findMany({
      where: { id: { in: followerIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { followers } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetFollowers', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch followers' },
      id: request.id
    }
  }
}

export async function handleGetFollowing(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetFollowingParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { userId, limit } = validation.data
    
    const follows = await prisma.follow.findMany({
      where: { followerId: userId },
      take: limit,
      select: {
        followingId: true
      }
    })
    
    const followingIds = follows.map(f => f.followingId)
    const following = await prisma.user.findMany({
      where: { id: { in: followingIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { following } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetFollowing', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch following' },
      id: request.id
    }
  }
}

export async function handleSearchUsers(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = SearchUsersParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { query, limit } = validation.data
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true,
        reputationPoints: true
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { users } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleSearchUsers', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to search users' },
      id: request.id
    }
  }
}


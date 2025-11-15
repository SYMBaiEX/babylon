/**
 * A2A Favorites Handlers
 * Handles profile favorites and favorite posts feed
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'
import { z } from 'zod'
import { asUser } from '@/lib/db/context'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'

const FavoriteProfileParamsSchema = z.object({
  userId: z.string().min(1),
})

const UnfavoriteProfileParamsSchema = z.object({
  userId: z.string().min(1),
})

const GetFavoritesParamsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
})

const GetFavoritePostsParamsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
})

export async function handleFavoriteProfile(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = FavoriteProfileParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }

    const { userId: targetUserId } = validation.data

    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })

    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }

    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }

    // Favorite profile within user context
    const result = await asUser(authUser, async (db) => {
      // Get target user
      const targetUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          displayName: true,
          username: true,
          profileImageUrl: true,
          bio: true,
        },
      })

      if (!targetUser) {
        throw new Error('Target user not found')
      }

      // Prevent self-favoriting
      if (agentId === targetUserId) {
        throw new Error('Cannot favorite yourself')
      }

      // Check if already favorited
      const existingFavorite = await db.favorite.findUnique({
        where: {
          userId_targetUserId: {
            userId: agentId,
            targetUserId,
          },
        },
      })

      if (existingFavorite) {
        throw new Error('Profile already favorited')
      }

      // Create favorite
      const favorite = await db.favorite.create({
        data: {
          id: await generateSnowflakeId(),
          userId: agentId,
          targetUserId,
        },
        include: {
          User_Favorite_targetUserIdToUser: {
            select: {
              id: true,
              displayName: true,
              username: true,
              profileImageUrl: true,
              bio: true,
            },
          },
        },
      })

      return {
        id: favorite.id,
        targetUser: favorite.User_Favorite_targetUserIdToUser,
        createdAt: favorite.createdAt,
      }
    })

    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        favorite: result,
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleFavoriteProfile', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to favorite profile'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleUnfavoriteProfile(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = UnfavoriteProfileParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }

    const { userId: targetUserId } = validation.data

    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })

    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }

    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }

    // Unfavorite profile within user context
    await asUser(authUser, async (db) => {
      // Find existing favorite
      const favorite = await db.favorite.findUnique({
        where: {
          userId_targetUserId: {
            userId: agentId,
            targetUserId,
          },
        },
      })

      if (!favorite) {
        throw new Error('Favorite not found')
      }

      // Delete favorite
      await db.favorite.delete({
        where: {
          id: favorite.id,
        },
      })
    })

    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Profile unfavorited successfully',
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleUnfavoriteProfile', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to unfavorite profile'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleGetFavorites(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetFavoritesParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }

    const { limit, offset } = validation.data

    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })

    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }

    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }

    // Get favorited profiles within user context
    const profiles = await asUser(authUser, async (db) => {
      // Get favorited profiles
      const favorites = await db.favorite.findMany({
        where: {
          userId: agentId,
        },
        include: {
          User_Favorite_targetUserIdToUser: {
            select: {
              id: true,
              displayName: true,
              username: true,
              profileImageUrl: true,
              bio: true,
              isActor: true,
              _count: {
                select: {
                  Favorite_Favorite_targetUserIdToUser: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: offset,
        take: limit,
      })

      // Get post counts for each profile
      const profilesWithCounts = await Promise.all(
        favorites.map(async (favorite) => {
          const postCount = await db.post.count({
            where: {
              authorId: favorite.User_Favorite_targetUserIdToUser.id,
            },
          })

          return {
            id: favorite.User_Favorite_targetUserIdToUser.id,
            displayName: favorite.User_Favorite_targetUserIdToUser.displayName,
            username: favorite.User_Favorite_targetUserIdToUser.username,
            profileImageUrl: favorite.User_Favorite_targetUserIdToUser.profileImageUrl,
            bio: favorite.User_Favorite_targetUserIdToUser.bio,
            isActor: favorite.User_Favorite_targetUserIdToUser.isActor,
            postCount,
            favoriteCount: favorite.User_Favorite_targetUserIdToUser._count.Favorite_Favorite_targetUserIdToUser,
            favoritedAt: favorite.createdAt,
            isFavorited: true,
          }
        })
      )

      return profilesWithCounts
    })

    return {
      jsonrpc: '2.0',
      result: {
        profiles,
        total: profiles.length,
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetFavorites', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get favorites'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}

export async function handleGetFavoritePosts(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetFavoritePostsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }

    const { limit, offset } = validation.data

    // Get user info for asUser context
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, walletAddress: true }
    })

    if (!user) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Agent user not found' },
        id: request.id
      }
    }

    const authUser: AuthenticatedUser = {
      userId: user.id,
      walletAddress: user.walletAddress || undefined,
      isAgent: true
    }

    // Get favorite posts feed within user context
    const result = await asUser(authUser, async (db) => {
      // Get favorited profile IDs
      const favorites = await db.favorite.findMany({
        where: {
          userId: agentId,
        },
        select: {
          targetUserId: true,
        },
      })

      const favoritedUserIds = favorites.map((f) => f.targetUserId)

      // If no favorites, return empty array
      if (favoritedUserIds.length === 0) {
        return { posts: [], totalCount: 0, hasMore: false }
      }

      // Get posts from favorited profiles
      const posts = await db.post.findMany({
        where: {
          authorId: {
            in: favoritedUserIds,
          },
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: offset,
        take: limit + 1, // Take one extra to check if there are more
      })

      // Check if there are more posts
      const hasMore = posts.length > limit
      const postsToReturn = hasMore ? posts.slice(0, limit) : posts

      // Get total count
      const totalCount = await db.post.count({
        where: {
          authorId: {
            in: favoritedUserIds,
          },
          deletedAt: null,
        },
      })

      // Get interaction counts
      const postIds = postsToReturn.map(p => p.id)

      const [allReactions, allComments, allShares, userReactions, userShares] = await Promise.all([
        db.reaction.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, type: 'like' },
          _count: { postId: true },
        }),
        db.comment.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
        db.share.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { postId: true },
        }),
        db.reaction.findMany({
          where: {
            postId: { in: postIds },
            userId: agentId,
            type: 'like',
          },
          select: { postId: true },
        }),
        db.share.findMany({
          where: {
            postId: { in: postIds },
            userId: agentId,
          },
          select: { postId: true },
        }),
      ])

      // Create lookup maps
      const reactionMap = new Map(allReactions.map(r => [r.postId, r._count.postId]))
      const commentMap = new Map(allComments.map(c => [c.postId, c._count.postId]))
      const shareMap = new Map(allShares.map(s => [s.postId, s._count.postId]))
      const userReactionSet = new Set(userReactions.map(r => r.postId))
      const userShareSet = new Set(userShares.map(s => s.postId))

      // Transform posts
      const transformedPosts = postsToReturn.map((post) => ({
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        timestamp: post.timestamp,
        authorId: post.authorId,
        gameId: post.gameId,
        dayNumber: post.dayNumber,
        interactions: {
          likeCount: reactionMap.get(post.id) ?? 0,
          commentCount: commentMap.get(post.id) ?? 0,
          shareCount: shareMap.get(post.id) ?? 0,
          isLiked: userReactionSet.has(post.id),
          isShared: userShareSet.has(post.id),
        },
      }))

      return { posts: transformedPosts, totalCount, hasMore }
    })

    return {
      jsonrpc: '2.0',
      result: {
        posts: result.posts,
        total: result.totalCount,
        hasMore: result.hasMore,
        limit,
        offset,
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetFavoritePosts', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get favorite posts'
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: errorMessage },
      id: request.id
    }
  }
}



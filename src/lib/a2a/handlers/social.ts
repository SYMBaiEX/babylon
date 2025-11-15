/**
 * A2A Social Feature Handlers
 * Handlers for posts, comments, likes, shares
 */

import type { JsonRpcRequest, JsonRpcResponse } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'
import { cachedDb } from '@/lib/cached-database-service'
import { broadcastToChannel } from '@/lib/sse/event-broadcaster'
import { notifyMention, notifyReactionOnPost, notifyCommentOnPost } from '@/lib/services/notification-service'
import { logger } from '@/lib/logger'
import {
  GetFeedParamsSchema,
  GetPostParamsSchema,
  CreatePostParamsSchema,
  DeletePostParamsSchema,
  LikePostParamsSchema,
  SharePostParamsSchema,
  GetCommentsParamsSchema,
  CreateCommentParamsSchema,
  DeleteCommentParamsSchema,
  LikeCommentParamsSchema,
} from '../validation'

export async function handleGetFeed(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetFeedParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { limit, offset } = validation.data
    const posts = await cachedDb.getRecentPosts(limit, offset)
    
    return {
      jsonrpc: '2.0',
      result: {
        posts: posts.map(p => ({
          id: p.id,
          content: p.content,
          authorId: p.authorId,
          timestamp: p.timestamp,
          type: p.type || 'post'
        })),
        hasMore: posts.length === limit
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetFeed', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch feed' },
      id: request.id
    }
  }
}

export async function handleGetPost(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetPostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId } = validation.data
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        _count: {
          select: {
            Reaction: { where: { type: 'like' } },
            Comment: true,
            Share: true
          }
        }
      }
    })
    
    if (!post) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: `Post ${postId} not found` },
        id: request.id
      }
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        timestamp: post.timestamp,
        likeCount: post._count.Reaction,
        commentCount: post._count.Comment,
        shareCount: post._count.Share
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetPost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch post' },
      id: request.id
    }
  }
}

export async function handleCreatePost(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = CreatePostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { content, type } = validation.data
    const userId = agentId
    
    const post = await prisma.post.create({
      data: {
        id: await generateSnowflakeId(),
        content: content.trim(),
        authorId: userId,
        timestamp: new Date(),
        type: type || 'post'
      }
    })
    
    await cachedDb.invalidatePostsCache()
    await cachedDb.invalidateActorPostsCache(userId)
    
    broadcastToChannel('feed', {
      type: 'new_post',
      post: {
        id: post.id,
        content: post.content,
        authorId: post.authorId,
        timestamp: post.timestamp.toISOString()
      }
    })
    
    const mentions = content.match(/@(\w+)/g)
    if (mentions) {
      const usernames = [...new Set(mentions.map((m: string) => m.substring(1)))]
      const mentionedUsers = await prisma.user.findMany({
        where: { username: { in: usernames } },
        select: { id: true }
      })
      
      await Promise.all(
        mentionedUsers.map(u => notifyMention(u.id, userId, post.id, 'post'))
      )
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        postId: post.id
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleCreatePost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to create post' },
      id: request.id
    }
  }
}

export async function handleDeletePost(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = DeletePostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId } = validation.data
    const userId = agentId
    
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Post not found' },
        id: request.id
      }
    }
    
    if (post.authorId !== userId) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.FORBIDDEN, message: 'Not authorized to delete this post' },
        id: request.id
      }
    }
    
    await prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() }
    })
    
    await cachedDb.invalidatePostsCache()
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleDeletePost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to delete post' },
      id: request.id
    }
  }
}

export async function handleLikePost(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = LikePostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId } = validation.data
    const userId = agentId
    
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Post not found' },
        id: request.id
      }
    }
    
    const existing = await prisma.reaction.findUnique({
      where: {
        postId_userId_type: {
          postId,
          userId,
          type: 'like'
        }
      }
    })
    
    if (existing) {
      const likeCount = await prisma.reaction.count({
        where: { postId, type: 'like' }
      })
      return {
        jsonrpc: '2.0',
        result: { success: true, alreadyLiked: true, likeCount } as unknown as JsonRpcResult,
        id: request.id
      }
    }
    
    await prisma.reaction.create({
      data: {
        id: await generateSnowflakeId(),
        postId,
        userId,
        type: 'like'
      }
    })
    
    if (post.authorId && post.authorId !== userId) {
      await notifyReactionOnPost(post.authorId, userId, postId, 'like')
    }
    
    const likeCount = await prisma.reaction.count({
      where: { postId, type: 'like' }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        likeCount
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleLikePost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to like post' },
      id: request.id
    }
  }
}

export async function handleUnlikePost(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = LikePostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId } = validation.data
    const userId = agentId
    
    await prisma.reaction.deleteMany({
      where: {
        postId,
        userId,
        type: 'like'
      }
    })
    
    const likeCount = await prisma.reaction.count({
      where: { postId, type: 'like' }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        likeCount
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleUnlikePost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to unlike post' },
      id: request.id
    }
  }
}

export async function handleSharePost(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = SharePostParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId } = validation.data
    const userId = agentId
    
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Post not found' },
        id: request.id
      }
    }
    
    await prisma.share.create({
      data: {
        id: await generateSnowflakeId(),
        postId,
        userId
      }
    })
    
    const shareCount = await prisma.share.count({ where: { postId } })
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        shareCount
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleSharePost', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to share post' },
      id: request.id
    }
  }
}

export async function handleGetComments(_agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = GetCommentsParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId, limit } = validation.data
    
    const comments = await prisma.comment.findMany({
      where: { postId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        User: {
          select: {
            id: true,
            displayName: true,
            username: true,
            profileImageUrl: true
          }
        }
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: {
        comments: comments.map(c => ({
          id: c.id,
          content: c.content,
          authorId: c.authorId,
          authorName: c.User?.displayName || c.User?.username || c.authorId,
          createdAt: c.createdAt
        }))
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleGetComments', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to fetch comments' },
      id: request.id
    }
  }
}

export async function handleCreateComment(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = CreateCommentParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { postId, content } = validation.data
    const userId = agentId
    
    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Post not found' },
        id: request.id
      }
    }
    
    const comment = await prisma.comment.create({
      data: {
        id: await generateSnowflakeId(),
        content: content.trim(),
        postId,
        authorId: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    
    if (post.authorId && post.authorId !== userId) {
      await notifyCommentOnPost(post.authorId, userId, postId, comment.id)
    }
    
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
        commentId: comment.id
      } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleCreateComment', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to create comment' },
      id: request.id
    }
  }
}

export async function handleDeleteComment(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = DeleteCommentParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { commentId } = validation.data
    const userId = agentId
    
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Comment not found' },
        id: request.id
      }
    }
    
    if (comment.authorId !== userId) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.FORBIDDEN, message: 'Not authorized to delete this comment' },
        id: request.id
      }
    }
    
    await prisma.comment.delete({ where: { id: commentId } })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleDeleteComment', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to delete comment' },
      id: request.id
    }
  }
}

export async function handleLikeComment(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const validation = LikeCommentParamsSchema.safeParse(request.params)
    if (!validation.success) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.INVALID_PARAMS, message: validation.error.message },
        id: request.id
      }
    }
    
    const { commentId } = validation.data
    const userId = agentId
    
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) {
      return {
        jsonrpc: '2.0',
        error: { code: ErrorCode.AGENT_NOT_FOUND, message: 'Comment not found' },
        id: request.id
      }
    }
    
    await prisma.reaction.create({
      data: {
        id: await generateSnowflakeId(),
        postId: comment.postId,
        userId,
        type: 'like'
      }
    })
    
    return {
      jsonrpc: '2.0',
      result: { success: true } as unknown as JsonRpcResult,
      id: request.id
    }
  } catch (error) {
    logger.error('Error in handleLikeComment', error)
    return {
      jsonrpc: '2.0',
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Failed to like comment' },
      id: request.id
    }
  }
}


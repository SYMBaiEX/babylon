/**
 * Grouped Trending API
 * 
 * @route GET /api/trending/group - Get posts for multiple trending tags
 * @access Public
 * 
 * @description
 * Returns posts for a group of trending tags. Used when displaying grouped
 * trends (e.g., "OpenAGI" + "Sam Altman" as one trending topic).
 * 
 * @openapi
 * /api/trending/group:
 *   get:
 *     tags:
 *       - Trending
 *     summary: Get posts for grouped trending tags
 *     description: Returns posts that match any of the provided tag IDs
 *     parameters:
 *       - in: query
 *         name: tags
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated tag IDs (e.g., "id1,id2,id3")
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of posts to return
 *     responses:
 *       200:
 *         description: Posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 posts:
 *                   type: array
 *                   items:
 *                     type: object
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       category:
 *                         type: string
 *       400:
 *         description: Invalid parameters
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/trending/group?tags=id1,id2,id3');
 * const { posts, tags } = await response.json();
 * ```
 */

import { optionalAuth, type AuthenticatedUser } from '@/lib/api/auth-middleware'
import { asPublic, asUser } from '@/lib/db/context'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const tagsParam = searchParams.get('tags')
  const limitParam = searchParams.get('limit')

  if (!tagsParam) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter: tags' },
      { status: 400 }
    )
  }

  const tagIds = tagsParam.split(',').map(id => id.trim()).filter(id => id.length > 0)
  
  if (tagIds.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Invalid tags parameter' },
      { status: 400 }
    )
  }

  const limit = limitParam ? parseInt(limitParam, 10) : 50

  logger.info('Fetching grouped trending posts', { tagIds, limit }, 'GET /api/trending/group')

  // Optional auth for RLS
  const authUser: AuthenticatedUser | null = await optionalAuth(request).catch(() => null)

  // Get tag information
  const tags = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        return await db.tag.findMany({
          where: { id: { in: tagIds } },
          select: {
            id: true,
            displayName: true,
            category: true,
          },
        })
      })
    : await asPublic(async (db) => {
        return await db.tag.findMany({
          where: { id: { in: tagIds } },
          select: {
            id: true,
            displayName: true,
            category: true,
          },
        })
      })

  // Get posts that have any of these tags
  const postTagRelations = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        return await db.postTag.findMany({
          where: {
            tagId: { in: tagIds },
          },
          include: {
            Post: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: limit * 2, // Get more to deduplicate
        })
      })
    : await asPublic(async (db) => {
        return await db.postTag.findMany({
          where: {
            tagId: { in: tagIds },
          },
          include: {
            Post: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: limit * 2,
        })
      })

  // Deduplicate posts (same post might have multiple tags from the group)
  const seenPostIds = new Set<string>()
  const uniquePosts = postTagRelations
    .filter((pt) => {
      if (seenPostIds.has(pt.postId)) {
        return false
      }
      seenPostIds.add(pt.postId)
      return true
    })
    .slice(0, limit)

  // Get interaction counts for posts
  const postIds = uniquePosts.map(pt => pt.postId)
  
  // Get user info for authors
  const authorIds = [...new Set(uniquePosts.map(pt => pt.Post.authorId))]
  const [users, actors, organizations] = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        return await Promise.all([
          db.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, username: true, displayName: true },
          }),
          db.actor.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true },
          }),
          db.organization.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true },
          }),
        ])
      })
    : await asPublic(async (db) => {
        return await Promise.all([
          db.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, username: true, displayName: true },
          }),
          db.actor.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true },
          }),
          db.organization.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true },
          }),
        ])
      })

  const userMap = new Map(users.map(u => [u.id, u]))
  const actorMap = new Map(actors.map(a => [a.id, a]))
  const orgMap = new Map(organizations.map(o => [o.id, o]))
  
  const [likeCounts, commentCounts, shareCounts] = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        return await Promise.all([
          db.reaction.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
              type: 'like',
            },
            _count: { postId: true },
          }),
          db.comment.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
            },
            _count: { postId: true },
          }),
          db.share.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
            },
            _count: { postId: true },
          }),
        ])
      })
    : await asPublic(async (db) => {
        return await Promise.all([
          db.reaction.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
              type: 'like',
            },
            _count: { postId: true },
          }),
          db.comment.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
            },
            _count: { postId: true },
          }),
          db.share.groupBy({
            by: ['postId'],
            where: {
              postId: { in: postIds },
            },
            _count: { postId: true },
          }),
        ])
      })

  const likeMap = new Map(likeCounts.map((lc) => [lc.postId, lc._count.postId || 0]))
  const commentMap = new Map(commentCounts.map((cc) => [cc.postId, cc._count.postId || 0]))
  const shareMap = new Map(shareCounts.map((sc) => [sc.postId, sc._count.postId || 0]))

  // Format posts
  const posts = uniquePosts.map((pt) => {
    const user = userMap.get(pt.Post.authorId)
    const actor = actorMap.get(pt.Post.authorId)
    const org = orgMap.get(pt.Post.authorId)
    
    let authorName = pt.Post.authorId
    let authorUsername: string | null = null
    
    if (user) {
      authorName = user.displayName || user.username || pt.Post.authorId
      authorUsername = user.username
    } else if (actor) {
      authorName = actor.name
    } else if (org) {
      authorName = org.name || pt.Post.authorId
    }
    
    return {
      id: pt.Post.id,
      content: pt.Post.content,
      authorId: pt.Post.authorId,
      authorName,
      authorUsername,
      timestamp: pt.Post.timestamp.toISOString(),
      likeCount: likeMap.get(pt.Post.id) || 0,
      commentCount: commentMap.get(pt.Post.id) || 0,
      shareCount: shareMap.get(pt.Post.id) || 0,
      type: pt.Post.type,
    }
  })

  logger.info('Grouped trending posts retrieved', {
    tagCount: tags.length,
    postCount: posts.length,
  }, 'GET /api/trending/group')

  return NextResponse.json({
    success: true,
    posts,
    tags,
  })
})


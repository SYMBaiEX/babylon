/**
 * Trending Tag Detail API
 * 
 * GET /api/trending/[tag] - Get posts with a specific tag
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getPostsByTag } from '@/lib/services/tag-storage-service'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const { tag } = await params
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Validate params
    if (!tag) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tag parameter is required',
        },
        { status: 400 }
      )
    }

    // Get posts with this tag
    const result = await getPostsByTag(tag, { limit, offset })

    if (!result.tag) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tag not found',
          posts: [],
          total: 0,
        },
        { status: 404 }
      )
    }

    // Enrich posts with author information and engagement stats
    const enrichedPosts = await Promise.all(
      result.posts.map(async (post) => {
        // Get author info (could be User or Actor)
        const [user, actor, likeCount, commentCount, shareCount] = await Promise.all([
          prisma.user.findUnique({
            where: { id: post.authorId },
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
              isActor: true,
            },
          }),
          prisma.actor.findUnique({
            where: { id: post.authorId },
            select: {
              id: true,
              name: true,
              profileImageUrl: true,
            },
          }),
          prisma.reaction.count({
            where: { postId: post.id, type: 'like' },
          }),
          prisma.comment.count({
            where: { postId: post.id },
          }),
          prisma.share.count({
            where: { postId: post.id },
          }),
        ])

        // Determine author info
        const authorName = user?.displayName || user?.username || actor?.name || 'Unknown'
        const authorUsername = user?.username || null
        const authorProfileImageUrl = user?.profileImageUrl || actor?.profileImageUrl || null

        return {
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          authorName,
          authorUsername,
          authorProfileImageUrl,
          timestamp: post.timestamp.toISOString(),
          likeCount,
          commentCount,
          shareCount,
          isLiked: false, // TODO: Check if current user liked this
          isShared: false, // TODO: Check if current user shared this
        }
      })
    )

    return NextResponse.json({
      success: true,
      tag: {
        name: result.tag.name,
        displayName: result.tag.displayName,
        category: result.tag.category,
      },
      posts: enrichedPosts,
      total: result.total,
    })
  } catch (error) {
    logger.error('Error fetching posts by tag:', error, 'GET /api/trending/[tag]')
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch posts',
        posts: [],
        total: 0,
      },
      { status: 500 }
    )
  }
}


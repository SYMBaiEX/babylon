/**
 * Post Embed API
 * 
 * @route GET /api/embed/post/[id] - Get post embed metadata
 * @access Public
 * 
 * @description
 * Returns Farcaster embed metadata for post sharing. Includes post content,
 * author info, interaction counts, and Open Graph data for rich link previews.
 * 
 * @openapi
 * /api/embed/post/{id}:
 *   get:
 *     tags:
 *       - Embed
 *     summary: Get post embed metadata
 *     description: Returns Farcaster embed metadata for post sharing (Open Graph)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Embed metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: post
 *                 version:
 *                   type: string
 *                   example: "1"
 *                 url:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 author:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     username:
 *                       type: string
 *                       nullable: true
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     likeCount:
 *                       type: integer
 *                     commentCount:
 *                       type: integer
 *                     shareCount:
 *                       type: integer
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 image:
 *                   type: string
 *       404:
 *         description: Post not found
 * 
 * @example
 * ```typescript
 * const metadata = await fetch(`/api/embed/post/${postId}`)
 *   .then(r => r.json());
 * ```
 * 
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/sharing} Farcaster embed docs
 */

import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PostIdParamSchema } from '@/lib/validation/schemas'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = PostIdParamSchema.parse(await context.params)

    // Fetch post data
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        content: true,
        type: true,
        articleTitle: true,
        authorId: true,
        timestamp: true,
        deletedAt: true,
      },
    })

    if (!post || post.deletedAt) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }

    // Get interaction counts
    const [likeCount, commentCount, shareCount] = await Promise.all([
      prisma.reaction.count({ where: { postId, type: 'like' } }),
      prisma.comment.count({ where: { postId } }),
      prisma.share.count({ where: { postId } }),
    ])

    // Get author info - could be User, Actor, or Organization
    let authorName = 'Unknown'
    let authorUsername: string | null = null

    // Try to find user author
    const userAuthor = await prisma.user.findUnique({
      where: { id: post.authorId },
      select: { displayName: true, username: true },
    })

    if (userAuthor) {
      authorName = userAuthor.displayName || 'Unknown'
      authorUsername = userAuthor.username || null
    } else {
      // Check for actor
      const actor = await prisma.actor.findUnique({
        where: { id: post.authorId },
        select: { name: true },
      })
      
      if (actor) {
        authorName = actor.name
      } else {
        // Check for organization
        const org = await prisma.organization.findUnique({
          where: { id: post.authorId },
          select: { name: true },
        })
        
        if (org) {
          authorName = org.name
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://babylon.market'
    const postUrl = `${baseUrl}/post/${postId}`
    
    // Truncate content for preview
    const previewText = post.content.length > 200 
      ? post.content.substring(0, 200) + '...' 
      : post.content

    const title = post.type === 'article' && post.articleTitle
      ? post.articleTitle
      : `${authorName} on Babylon`

    // Return Farcaster embed metadata
    return NextResponse.json({
      type: 'post',
      version: '1',
      url: postUrl,
      title,
      description: previewText,
      author: {
        name: authorName,
        username: authorUsername,
      },
      metadata: {
        likeCount,
        commentCount,
        shareCount,
        timestamp: post.timestamp.toISOString(),
      },
      image: `${baseUrl}/assets/images/og-image.png`,
    })
  } catch (error) {
    console.error('Error fetching embed data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch embed data' },
      { status: 500 }
    )
  }
}


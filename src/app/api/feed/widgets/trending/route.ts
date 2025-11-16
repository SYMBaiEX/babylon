/**
 * Trending Tags Widget API
 * 
 * @route GET /api/feed/widgets/trending - Get trending tags
 * @access Public
 * 
 * @description
 * Returns current trending tags with post counts, summaries, and recent post
 * samples. Uses cached trending data from tag storage service. Includes AI-generated
 * summaries for each trending tag.
 * 
 * @openapi
 * /api/feed/widgets/trending:
 *   get:
 *     tags:
 *       - Feed
 *     summary: Get trending tags
 *     description: Returns current trending tags with summaries and post counts
 *     responses:
 *       200:
 *         description: Trending tags retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 trending:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       tag:
 *                         type: string
 *                       tagSlug:
 *                         type: string
 *                       category:
 *                         type: string
 *                       postCount:
 *                         type: integer
 *                       summary:
 *                         type: string
 *                       rank:
 *                         type: integer
 *                 message:
 *                   type: string
 *                   nullable: true
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/feed/widgets/trending');
 * const { trending } = await response.json();
 * ```
 * 
 * @see {@link /lib/services/tag-storage-service} Tag storage service
 * @see {@link /lib/services/trending-summary-service} Trending summary service
 */

import { optionalAuth, type AuthenticatedUser } from '@/lib/api/auth-middleware'
import { asPublic, asUser } from '@/lib/db/context'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { getCurrentTrendingTags } from '@/lib/services/tag-storage-service'
import { generateTrendingSummary } from '@/lib/services/trending-summary-service'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Get trending tags from cache
  const trending = await getCurrentTrendingTags(5)

  if (!trending || trending.length === 0) {
    return NextResponse.json({
      success: true,
      trending: [],
      message: 'No trending data yet - check back after first game tick',
    })
  }

  // Optional auth - trending tags are public but RLS still applies
  const authUser: AuthenticatedUser | null = await optionalAuth(request).catch(() => null)

  const trendingItems = await Promise.all(
    trending.map(async (item) => {
      const recentPosts = (authUser && authUser.userId)
        ? await asUser(authUser, async (db) => {
          return await db.postTag.findMany({
            where: { tagId: item.Tag.id },
            include: {
              Post: {
                select: {
                  content: true,
                },
              },
            },
            take: 3,
            orderBy: {
              createdAt: 'desc',
            },
          })
        })
        : await asPublic(async (db) => {
          return await db.postTag.findMany({
            where: { tagId: item.Tag.id },
            include: {
              Post: {
                select: {
                  content: true,
                },
              },
            },
            take: 3,
            orderBy: {
              createdAt: 'desc',
            },
          })
        })

      const postContents = recentPosts.map(pt => pt.Post.content)
      
      const summary = await generateTrendingSummary(
        item.Tag.displayName,
        item.Tag.category,
        postContents
      )

      return {
        id: item.id,
        tag: item.Tag.displayName,
        tagSlug: item.Tag.name,
        category: item.Tag.category,
        postCount: item.postCount,
        summary,
        rank: item.rank,
      }
    })
  )

  // Filter out null values
  const validItems = trendingItems.filter((item): item is NonNullable<typeof item> => item !== null)

  return NextResponse.json({
    success: true,
    trending: validItems,
  })
})

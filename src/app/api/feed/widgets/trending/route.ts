/**
 * Trending Tags Widget API
 * 
 * GET /api/feed/widgets/trending - Get current trending tags
 */

import type { NextRequest } from 'next/server'
import { optionalAuth, type AuthenticatedUser } from '@/lib/api/auth-middleware'
import { asUser, asPublic } from '@/lib/db/context'
import { getCurrentTrendingTags } from '@/lib/services/tag-storage-service'
import { generateTrendingSummary } from '@/lib/services/trending-summary-service'
import { NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/errors/error-handler'
import { prisma } from '@/lib/database-service'

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
            where: { tagId: item.tagId },
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
            where: { tagId: item.tagId },
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
      
      // Fetch Tag separately to get display information
      const tag = await prisma.tag.findUnique({
        where: { id: item.tagId },
        select: {
          id: true,
          name: true,
          displayName: true,
          category: true,
        },
      })

      if (!tag) {
        return null
      }
      
      const summary = await generateTrendingSummary(
        tag.displayName,
        tag.category,
        postContents
      )

      return {
        id: item.id,
        tag: tag.displayName,
        tagSlug: tag.name,
        category: tag.category,
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

/**
 * Trending Tags Widget API
 * 
 * GET /api/feed/widgets/trending - Get current trending tags
 */

import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import { asUser } from '@/lib/db/context'
import { getCurrentTrendingTags } from '@/lib/services/tag-storage-service'
import { generateTrendingSummary } from '@/lib/services/trending-summary-service'
import { NextResponse } from 'next/server'

export async function GET() {
  const trending = await getCurrentTrendingTags(5)

  // Optional auth - trending tags are public but RLS still applies
  // No request available in this route, so auth is not possible
  const authUser: AuthenticatedUser | null = null

  const trendingItems = await Promise.all(
    trending.map(async (item) => {
      const recentPosts = await asUser(authUser, async (db) => {
        return await db.postTag.findMany({
        where: { tagId: item.tag.id },
        include: {
          post: {
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

      const postContents = recentPosts.map(pt => pt.post.content)
      
      const summary = await generateTrendingSummary(
        item.tag.displayName,
        item.tag.category,
        postContents
      )

      return {
        id: item.id,
        tag: item.tag.displayName,
        tagSlug: item.tag.name,
        category: item.tag.category,
        postCount: item.postCount,
        summary,
        rank: item.rank,
      }
    })
  )

  return NextResponse.json({
    success: true,
    trending: trendingItems,
  })
}


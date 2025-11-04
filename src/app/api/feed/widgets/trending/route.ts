/**
 * Trending Tags Widget API
 * 
 * GET /api/feed/widgets/trending - Get current trending tags
 */

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getCurrentTrendingTags } from '@/lib/services/tag-storage-service'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const trending = await getCurrentTrendingTags(5) // Only top 5

    // Format for frontend with generated summaries
    const trendingItems = await Promise.all(
      trending.map(async (item) => {
        // Generate a brief summary based on recent posts with this tag
        const recentPosts = await prisma.postTag.findMany({
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

        // Create a simple summary from recent posts
        let summary = ''
        if (recentPosts.length > 0) {
          // Simple summary generation (could be enhanced with LLM later)
          if (item.tag.category === 'Tech') {
            summary = `Latest discussions about ${item.tag.displayName}`
          } else if (item.tag.category === 'Finance') {
            summary = `Market movements and predictions around ${item.tag.displayName}`
          } else if (item.tag.category === 'Politics') {
            summary = `Political developments related to ${item.tag.displayName}`
          } else if (item.tag.category === 'News') {
            summary = `Breaking updates on ${item.tag.displayName}`
          } else {
            summary = `${item.postCount} posts discussing ${item.tag.displayName}`
          }
        }

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
  } catch (error) {
    logger.error('Error fetching trending tags:', error, 'GET /api/feed/widgets/trending')
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch trending tags',
        trending: [],
      },
      { status: 500 }
    )
  }
}


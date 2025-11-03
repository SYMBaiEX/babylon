/**
 * Trending Tags Widget API
 * 
 * GET /api/feed/widgets/trending - Get current trending tags
 */

import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getCurrentTrendingTags } from '@/lib/services/tag-storage-service'

export async function GET() {
  try {
    const trending = await getCurrentTrendingTags(10)

    // Format for frontend
    const trendingItems = trending.map(item => ({
      id: item.id,
      tag: item.tag.displayName,
      tagSlug: item.tag.name,
      category: item.tag.category,
      postCount: item.postCount,
      relatedContext: item.relatedContext,
      rank: item.rank,
    }))

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


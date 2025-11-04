/**
 * API Route: /api/users/[userId]/share
 * Methods: POST (track share action and award points)
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/database-service'
import {
  authenticate,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'


interface ShareRequest {
  platform: string // 'twitter', 'farcaster', 'link', etc.
  contentType: string // 'post', 'profile', 'market', 'referral'
  contentId?: string
  url?: string
}

/**
 * POST /api/users/[userId]/share
 * Track a share action and award points
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const authUser = await authenticate(request)
    const { userId } = await params

    // Verify user is sharing their own content
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403)
    }

    // Parse request body
    const body: ShareRequest = await request.json()
    const { platform, contentType, contentId, url } = body

    if (!platform || !contentType) {
      return errorResponse('Platform and content type are required', 400)
    }

    // Validate platform
    const validPlatforms = ['twitter', 'farcaster', 'link', 'telegram', 'discord']
    if (!validPlatforms.includes(platform)) {
      return errorResponse('Invalid platform', 400)
    }

    // Validate content type
    const validContentTypes = ['post', 'profile', 'market', 'referral', 'leaderboard']
    if (!validContentTypes.includes(contentType)) {
      return errorResponse('Invalid content type', 400)
    }

    // Create share action record
    const shareAction = await prisma.shareAction.create({
      data: {
        userId,
        platform,
        contentType,
        contentId,
        url,
        pointsAwarded: false,
      },
    })

    // Award points for the share
    const pointsResult = await PointsService.awardShareAction(
      userId,
      platform,
      contentType,
      contentId
    )

    // Update share action to mark points as awarded
    if (pointsResult.success && pointsResult.pointsAwarded > 0) {
      await prisma.shareAction.update({
        where: { id: shareAction.id },
        data: { pointsAwarded: true },
      })
    }

    logger.info(
      `User ${userId} shared ${contentType} on ${platform}`,
      { userId, platform, contentType, contentId, pointsAwarded: pointsResult.pointsAwarded },
      'POST /api/users/[userId]/share'
    )

    return successResponse({
      shareAction,
      points: {
        awarded: pointsResult.pointsAwarded,
        newTotal: pointsResult.newTotal,
        alreadyAwarded: pointsResult.alreadyAwarded,
      },
    })
  } catch (error) {
    logger.error('Error tracking share action:', error, 'POST /api/users/[userId]/share')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to track share action',
      500
    )
  }
}


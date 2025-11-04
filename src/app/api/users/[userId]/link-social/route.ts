/**
 * API Route: /api/users/[userId]/link-social
 * Methods: POST (link social account and award points)
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


interface LinkSocialRequest {
  platform: string // 'farcaster', 'twitter', 'wallet'
  username?: string // For farcaster/twitter
  address?: string // For wallet
}

/**
 * POST /api/users/[userId]/link-social
 * Link a social account and award points if first time
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const authUser = await authenticate(request)
    const { userId } = await params

    // Verify user is linking their own account
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403)
    }

    // Parse request body
    const body: LinkSocialRequest = await request.json()
    const { platform, username, address } = body

    if (!platform) {
      return errorResponse('Platform is required', 400)
    }

    // Validate platform
    const validPlatforms = ['farcaster', 'twitter', 'wallet']
    if (!validPlatforms.includes(platform)) {
      return errorResponse('Invalid platform. Must be: farcaster, twitter, or wallet', 400)
    }

    // Get current user state
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasFarcaster: true,
        hasTwitter: true,
        walletAddress: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404)
    }

    // Check if already linked
    let alreadyLinked = false
    switch (platform) {
      case 'farcaster':
        alreadyLinked = user.hasFarcaster
        break
      case 'twitter':
        alreadyLinked = user.hasTwitter
        break
      case 'wallet':
        alreadyLinked = !!user.walletAddress
        break
    }

    // Update user with social connection
    const updateData: Record<string, string | boolean> = {}
    switch (platform) {
      case 'farcaster':
        updateData.hasFarcaster = true
        if (username) updateData.farcasterUsername = username
        break
      case 'twitter':
        updateData.hasTwitter = true
        if (username) updateData.twitterUsername = username
        break
      case 'wallet':
        if (address) updateData.walletAddress = address
        break
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    })

    // Award points if not already linked
    let pointsResult
    if (!alreadyLinked) {
      switch (platform) {
        case 'farcaster':
          pointsResult = await PointsService.awardFarcasterLink(userId, username)
          break
        case 'twitter':
          pointsResult = await PointsService.awardTwitterLink(userId, username)
          break
        case 'wallet':
          pointsResult = await PointsService.awardWalletConnect(userId, address)
          break
      }
    }

    logger.info(
      `User ${userId} linked ${platform} account`,
      { userId, platform, username, address, alreadyLinked },
      'POST /api/users/[userId]/link-social'
    )

    return successResponse({
      platform,
      linked: true,
      alreadyLinked,
      points: pointsResult ? {
        awarded: pointsResult.pointsAwarded,
        newTotal: pointsResult.newTotal,
      } : null,
    })
  } catch (error) {
    logger.error('Error linking social account:', error, 'POST /api/users/[userId]/link-social')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to link social account',
      500
    )
  }
}


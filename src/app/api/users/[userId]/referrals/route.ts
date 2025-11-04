/**
 * API Route: /api/users/[userId]/referrals
 * Methods: GET (get referral stats and list of referred users)
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/database-service'
import {
  authenticate,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware'
import { logger } from '@/lib/logger'


/**
 * GET /api/users/[userId]/referrals
 * Get user's referral statistics and list of referred users
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const authUser = await authenticate(request)
    const { userId } = await params

    // Verify user is accessing their own referrals
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403)
    }

    // Get user's referral data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        referralCode: true,
        referralCount: true,
        reputationPoints: true,
        pointsAwardedForProfile: true,
        pointsAwardedForFarcaster: true,
        pointsAwardedForTwitter: true,
        pointsAwardedForWallet: true,
        farcasterUsername: true,
        twitterUsername: true,
        walletAddress: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404)
    }

    // Get all completed referrals
    const referrals = await prisma.referral.findMany({
      where: {
        referrerId: userId,
        status: 'completed',
      },
      include: {
        referredUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true,
            createdAt: true,
            reputationPoints: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    })

    // Calculate total points earned from referrals
    const totalPointsEarned = referrals.length * 250

    // Check if referrer (current user) is following the referred users
    const referredUserIds = referrals
      .map(r => r.referredUserId)
      .filter((id): id is string => id !== null)

    const followStatuses = await prisma.follow.findMany({
      where: {
        followerId: userId,
        followingId: { in: referredUserIds },
      },
      select: {
        followingId: true,
      },
    })

    const followingUserIds = new Set(followStatuses.map(f => f.followingId))

    // Format referred users with follow status
    const referredUsers = referrals
      .filter(r => r.referredUser)
      .map(r => ({
        id: r.referredUser!.id,
        username: r.referredUser!.username,
        displayName: r.referredUser!.displayName,
        profileImageUrl: r.referredUser!.profileImageUrl,
        createdAt: r.referredUser!.createdAt,
        reputationPoints: r.referredUser!.reputationPoints,
        isFollowing: followingUserIds.has(r.referredUser!.id),
        joinedAt: r.completedAt,
      }))

    // Use username as referral code (without @)
    const referralCode = user.username || null
    const referralUrl = referralCode
      ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.game'}?ref=${referralCode}`
      : null

    return successResponse({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
        referralCode: referralCode,
        reputationPoints: user.reputationPoints,
        pointsAwardedForProfile: user.pointsAwardedForProfile,
        pointsAwardedForFarcaster: user.pointsAwardedForFarcaster,
        pointsAwardedForTwitter: user.pointsAwardedForTwitter,
        pointsAwardedForWallet: user.pointsAwardedForWallet,
        farcasterUsername: user.farcasterUsername,
        twitterUsername: user.twitterUsername,
        walletAddress: user.walletAddress,
      },
      stats: {
        totalReferrals: referrals.length,
        totalPointsEarned,
        pointsPerReferral: 250,
        followingCount: followingUserIds.size,
      },
      referredUsers,
      referralUrl,
    })
  } catch (error) {
    logger.error('Error getting referrals:', error, 'GET /api/users/[userId]/referrals')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to get referrals',
      500
    )
  }
}


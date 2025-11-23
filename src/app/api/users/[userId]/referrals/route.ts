/**
 * User Referrals API
 * 
 * @route GET /api/users/[userId]/referrals - Get referral stats and list
 * @access Authenticated (own profile only)
 * 
 * @description
 * Returns referral statistics and list of referred users. Includes total count,
 * referred users list, and optional detailed stats.
 * 
 * @openapi
 * /api/users/{userId}/referrals:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get referral stats
 *     description: Returns referral statistics and referred users list (own profile only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (must match authenticated user)
 *       - in: query
 *         name: includeStats
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include detailed statistics
 *     responses:
 *       200:
 *         description: Referrals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 referrals:
 *                   type: array
 *                 total:
 *                   type: integer
 *                 stats:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Cannot access another user's referrals
 * 
 * @example
 * ```typescript
 * const { referrals, total } = await fetch(`/api/users/${userId}/referrals?includeStats=true`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/prisma';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { ReferralQuerySchema, UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';
import { requireUserByIdentifier } from '@/lib/users/user-lookup';

/**
 * GET /api/users/[userId]/referrals
 * Get user's referral statistics and list of referred users
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await context.params;
  const { userId } = UserIdParamSchema.parse(params);
  
  // Check if the authenticated user has a database record
  if (!authUser.dbUserId) {
    throw new NotFoundError('User', userId, 'User profile not found. Please complete onboarding first.');
  }
  
  const targetUser = await requireUserByIdentifier(userId, { id: true });
  const canonicalUserId = targetUser.id;
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    userId,
    includeStats: searchParams.get('includeStats') || 'false'
  };
  ReferralQuerySchema.parse(queryParams);

  // Verify user is accessing their own referrals
  if (authUser.dbUserId !== canonicalUserId) {
    throw new AuthorizationError('You can only access your own referrals', 'referrals', 'read');
  }

  // Get user's referral data
  const user = await prisma.user.findUnique({
    where: { id: canonicalUserId },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      profileImageUrl: true,
      referralCode: true,
      referralCount: true,
      reputationPoints: true,
      totalFeesEarned: true,
      pointsAwardedForProfile: true,
      pointsAwardedForFarcaster: true,
      pointsAwardedForTwitter: true,
      pointsAwardedForWallet: true,
      farcasterUsername: true,
      twitterUsername: true,
      walletAddress: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', canonicalUserId);
  }

  // Get all completed referrals
  const completedReferrals = await prisma.referral.findMany({
    where: {
      referrerId: canonicalUserId,
      status: 'completed',
    },
    include: {
      User_Referral_referredUserIdToUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          profileImageUrl: true,
          createdAt: true,
          reputationPoints: true,
          profileComplete: true,
        },
      },
    },
    orderBy: {
      completedAt: 'desc',
    },
  });

  // Get pending referrals (users who haven't completed profile yet)
  // We find users where referredBy = currentUser but no completed referral exists
  const pendingReferredUsers = await prisma.user.findMany({
    where: {
      referredBy: canonicalUserId,
      profileComplete: false, // Not completed profile yet
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      createdAt: true,
      reputationPoints: true,
      profileComplete: true,
      // Include fallback identifiers for pending users
      email: true,
      farcasterUsername: true,
      twitterUsername: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Get fee earnings from referrals
  const feeEarnings = await prisma.tradingFee.aggregate({
    where: {
      referrerId: canonicalUserId,
    },
    _sum: {
      referrerFee: true,
    },
  })
  
  const totalFeesEarned = Number(feeEarnings._sum.referrerFee || 0)

  // Calculate weekly referral count (last 7 days) - only completed
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyReferralCount = await prisma.referral.count({
    where: {
      referrerId: canonicalUserId,
      status: 'completed',
      completedAt: {
        gte: oneWeekAgo,
      },
    },
  });

  // Check if referrer (current user) is following the referred users
  const completedUserIds = completedReferrals
    .map(r => r.referredUserId)
    .filter((id): id is string => id !== null);
  const pendingUserIds = pendingReferredUsers.map(u => u.id);
  const allReferredUserIds = [...completedUserIds, ...pendingUserIds];

  const followStatuses = await prisma.follow.findMany({
    where: {
      followerId: canonicalUserId,
      followingId: { in: allReferredUserIds },
    },
    select: {
      followingId: true,
    },
  });

  const followingUserIds = new Set(followStatuses.map(f => f.followingId));

  // Format completed referred users with follow status
  const completedReferredUsers = completedReferrals
    .filter(r => r.User_Referral_referredUserIdToUser)
    .map(r => ({
      id: r.User_Referral_referredUserIdToUser!.id,
      username: r.User_Referral_referredUserIdToUser!.username,
      displayName: r.User_Referral_referredUserIdToUser!.displayName,
      profileImageUrl: r.User_Referral_referredUserIdToUser!.profileImageUrl,
      createdAt: r.User_Referral_referredUserIdToUser!.createdAt,
      reputationPoints: r.User_Referral_referredUserIdToUser!.reputationPoints,
      isFollowing: followingUserIds.has(r.User_Referral_referredUserIdToUser!.id),
      joinedAt: r.completedAt,
      status: 'completed' as const,
    }));

  // Format pending referred users
  const formattedPendingUsers = pendingReferredUsers.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    profileImageUrl: u.profileImageUrl,
    createdAt: u.createdAt,
    reputationPoints: u.reputationPoints,
    isFollowing: followingUserIds.has(u.id),
    joinedAt: null, // No completion date yet
    status: 'pending' as const,
    // Include fallback identifiers for pending users
    email: u.email,
    farcasterUsername: u.farcasterUsername,
    twitterUsername: u.twitterUsername,
  }));

  // Use username as referral code (without @)
  const referralCode = user.username || null;
  const referralUrl = referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.market'}?ref=${referralCode}`
    : null;

  logger.info('Referrals fetched successfully', { 
    userId: canonicalUserId, 
    completedReferrals: completedReferrals.length,
    pendingReferrals: pendingReferredUsers.length,
  }, 'GET /api/users/[userId]/referrals');

  return successResponse({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      profileImageUrl: user.profileImageUrl,
      referralCode: referralCode,
      reputationPoints: user.reputationPoints,
      totalFeesEarned: user.totalFeesEarned,
      pointsAwardedForProfile: user.pointsAwardedForProfile,
      pointsAwardedForFarcaster: user.pointsAwardedForFarcaster,
      pointsAwardedForTwitter: user.pointsAwardedForTwitter,
      pointsAwardedForWallet: user.pointsAwardedForWallet,
      farcasterUsername: user.farcasterUsername,
      twitterUsername: user.twitterUsername,
      walletAddress: user.walletAddress,
    },
    stats: {
      totalReferrals: completedReferrals.length, // Only completed count
      pendingReferrals: pendingReferredUsers.length, // NEW: Pending count
      totalFeesEarned,
      feeShareRate: 0.50, // 50% of fees
      followingCount: followingUserIds.size,
      weeklyReferralCount,
      weeklyLimit: 10,
    },
    referredUsers: completedReferredUsers, // Completed users
    pendingReferredUsers: formattedPendingUsers, // NEW: Pending users
    referralUrl,
  });
});

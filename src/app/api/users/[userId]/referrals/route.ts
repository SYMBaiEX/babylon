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
import {
  db,
  users,
  referrals,
  follows,
  tradingFees,
  eq,
  and,
  inArray,
  isNull,
  isNotNull,
  count,
  sum,
  desc
} from '@/db';
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
  const [user] = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    bio: users.bio,
    profileImageUrl: users.profileImageUrl,
    referralCode: users.referralCode,
    referralCount: users.referralCount,
    reputationPoints: users.reputationPoints,
    totalFeesEarned: users.totalFeesEarned,
    pointsAwardedForProfile: users.pointsAwardedForProfile,
    pointsAwardedForFarcaster: users.pointsAwardedForFarcaster,
    pointsAwardedForTwitter: users.pointsAwardedForTwitter,
    pointsAwardedForWallet: users.pointsAwardedForWallet,
    farcasterUsername: users.farcasterUsername,
    twitterUsername: users.twitterUsername,
    walletAddress: users.walletAddress,
  })
    .from(users)
    .where(eq(users.id, canonicalUserId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User', canonicalUserId);
  }

  // Get all completed referrals
  const completedReferralsData = await db.select()
    .from(referrals)
    .where(and(
      eq(referrals.referrerId, canonicalUserId),
      eq(referrals.status, 'completed')
    ))
    .orderBy(desc(referrals.completedAt));

  // Get referred user IDs from completed referrals
  const completedReferredUserIds = completedReferralsData
    .map(r => r.referredUserId)
    .filter((id): id is string => id !== null);

  // Fetch user data for completed referrals
  let completedReferredUsersData: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    createdAt: Date;
    reputationPoints: number;
    profileComplete: boolean;
  }> = [];

  if (completedReferredUserIds.length > 0) {
    completedReferredUsersData = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      profileImageUrl: users.profileImageUrl,
      createdAt: users.createdAt,
      reputationPoints: users.reputationPoints,
      profileComplete: users.profileComplete,
    })
      .from(users)
      .where(inArray(users.id, completedReferredUserIds));
  }

  const completedUsersMap = new Map(completedReferredUsersData.map(u => [u.id, u]));

  // Get pending referrals (users who haven't completed profile yet)
  const pendingReferredUsers = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    profileImageUrl: users.profileImageUrl,
    createdAt: users.createdAt,
    reputationPoints: users.reputationPoints,
    profileComplete: users.profileComplete,
    email: users.email,
    farcasterUsername: users.farcasterUsername,
    twitterUsername: users.twitterUsername,
  })
    .from(users)
    .where(and(
      eq(users.referredBy, canonicalUserId),
      eq(users.profileComplete, false)
    ))
    .orderBy(desc(users.createdAt));

  // Get fee earnings from referrals
  const [feeEarnings] = await db.select({
    total: sum(tradingFees.referrerFee),
  })
    .from(tradingFees)
    .where(eq(tradingFees.referrerId, canonicalUserId));

  const totalFeesEarned = Number(feeEarnings?.total || 0);

  // Calculate referral stats for the unqualified limit system
  // Unqualified = completed AND qualifiedAt IS NULL AND signupPointsAwarded = true
  const [unqualifiedCountResult] = await db.select({
    count: count(),
  })
    .from(referrals)
    .where(and(
      eq(referrals.referrerId, canonicalUserId),
      eq(referrals.status, 'completed'),
      isNull(referrals.qualifiedAt),
      eq(referrals.signupPointsAwarded, true)
    ));

  const unqualifiedCount = Number(unqualifiedCountResult?.count || 0);

  // Qualified = completed AND qualifiedAt IS NOT NULL
  const [qualifiedCountResult] = await db.select({
    count: count(),
  })
    .from(referrals)
    .where(and(
      eq(referrals.referrerId, canonicalUserId),
      eq(referrals.status, 'completed'),
      isNotNull(referrals.qualifiedAt)
    ));

  const qualifiedCount = Number(qualifiedCountResult?.count || 0);

  // Pending points = completed AND signupPointsAwarded = false (waiting for slot)
  const [pendingPointsCountResult] = await db.select({
    count: count(),
  })
    .from(referrals)
    .where(and(
      eq(referrals.referrerId, canonicalUserId),
      eq(referrals.status, 'completed'),
      eq(referrals.signupPointsAwarded, false)
    ));

  const pendingPointsCount = Number(pendingPointsCountResult?.count || 0);

  // Check if referrer (current user) is following the referred users
  const completedUserIds = completedReferralsData
    .map(r => r.referredUserId)
    .filter((id): id is string => id !== null);
  const pendingUserIds = pendingReferredUsers.map(u => u.id);
  const allReferredUserIds = [...completedUserIds, ...pendingUserIds];

  let followingUserIds = new Set<string>();
  if (allReferredUserIds.length > 0) {
    const followStatuses = await db.select({
      followingId: follows.followingId,
    })
      .from(follows)
      .where(and(
        eq(follows.followerId, canonicalUserId),
        inArray(follows.followingId, allReferredUserIds)
      ));

    followingUserIds = new Set(followStatuses.map(f => f.followingId));
  }

  // Format completed referred users with follow status
  const completedReferredUsers = completedReferralsData
    .filter(r => r.referredUserId && completedUsersMap.has(r.referredUserId))
    .map(r => {
      const userData = completedUsersMap.get(r.referredUserId!)!;
      return {
        id: userData.id,
        username: userData.username,
        displayName: userData.displayName,
        profileImageUrl: userData.profileImageUrl,
        createdAt: userData.createdAt,
        reputationPoints: userData.reputationPoints,
        isFollowing: followingUserIds.has(userData.id),
        joinedAt: r.completedAt,
        status: 'completed' as const,
      };
    });

  // Format pending referred users
  const formattedPendingUsers = pendingReferredUsers.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    profileImageUrl: u.profileImageUrl,
    createdAt: u.createdAt,
    reputationPoints: u.reputationPoints,
    isFollowing: followingUserIds.has(u.id),
    joinedAt: null,
    status: 'pending' as const,
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
    completedReferrals: completedReferralsData.length,
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
      totalReferrals: completedReferralsData.length, // Only completed count
      pendingReferrals: pendingReferredUsers.length, // Pending profile completion count
      totalFeesEarned,
      feeShareRate: 0.50, // 50% of fees
      followingCount: followingUserIds.size,
      // Unqualified referral limit stats
      unqualifiedCount, // Unqualified referrals with points awarded (counts toward limit)
      qualifiedCount, // Qualified referrals (unlimited, don't count toward limit)
      pendingPointsCount, // Referrals waiting for points (FIFO queue)
      unqualifiedLimit: 10, // Maximum unqualified referrals at any time
      slotsAvailable: Math.max(0, 10 - unqualifiedCount), // Available slots for new referrals
    },
    referredUsers: completedReferredUsers, // Completed users
    pendingReferredUsers: formattedPendingUsers, // NEW: Pending users
    referralUrl,
  });
});

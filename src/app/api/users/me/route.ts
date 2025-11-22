/**
 * Current User Profile API
 * 
 * @route GET /api/users/me
 * @access Authenticated
 * 
 * @description
 * Returns the authenticated user's complete profile information including
 * profile status, social connections, reputation, and onboarding state.
 * Central endpoint for user session management and profile data.
 * 
 * **Automatic User Creation:**
 * Creates a minimal user record in the database on first authentication if
 * one doesn't exist. This allows tracking of users through the onboarding
 * funnel and ensures a user record is always available for authenticated requests.
 * 
 * @openapi
 * /api/users/me:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get current user profile
 *     description: Returns the authenticated user complete profile including onboarding status, social connections, and reputation.
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated:
 *                   type: boolean
 *                 needsOnboarding:
 *                   type: boolean
 *                 needsOnchain:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                     bio:
 *                       type: string
 *                     profileImageUrl:
 *                       type: string
 *                     walletAddress:
 *                       type: string
 *                     reputationPoints:
 *                       type: number
 *                     isAdmin:
 *                       type: boolean
 *                     stats:
 *                       type: object
 *       401:
 *         description: Unauthorized
 * 
 * **Profile Data Includes:**
 * - **Identity:** username, display name, bio, avatar, cover image
 * - **Onboarding Status:** profile completion, on-chain registration
 * - **Social Links:** Farcaster, Twitter connections and visibility settings
 * - **Blockchain:** wallet address, NFT token ID, on-chain status
 * - **Reputation:** reputation points, referral code, referral source
 * - **Stats:** cached profile statistics (posts, followers, following)
 * - **Permissions:** admin status, actor/agent flag
 * 
 * **Onboarding States:**
 * - `needsOnboarding: true` - User exists in DB but hasn't completed profile setup
 * - `needsOnchain: true` - Profile complete but not registered on-chain
 * - Both false - Fully onboarded user
 * 
 * **Profile Completeness:**
 * A profile is considered complete when user has:
 * - Set a username
 * - Added a bio
 * - Uploaded a profile image
 * 
 * **Caching:**
 * Profile stats (posts, followers, etc.) are cached for performance.
 * Cache is invalidated on relevant user actions.
 * 
 * @returns {object} User profile response
 * @property {boolean} authenticated - Always true (auth required)
 * @property {boolean} needsOnboarding - Whether user needs profile setup
 * @property {boolean} needsOnchain - Whether user needs on-chain registration
 * @property {object} user - User profile object (minimal record until profile completed)
 * @property {object} user.stats - Cached profile statistics
 * 
 * **User Object Fields:**
 * @property {string} user.id - User ID
 * @property {string} user.privyId - Privy authentication ID
 * @property {string} user.username - Unique username
 * @property {string} user.displayName - Display name
 * @property {string} user.bio - User biography
 * @property {string} user.profileImageUrl - Profile image URL
 * @property {string} user.coverImageUrl - Cover image URL
 * @property {string} user.walletAddress - Blockchain wallet address
 * @property {boolean} user.onChainRegistered - On-chain registration status
 * @property {string} user.nftTokenId - Associated NFT token ID
 * @property {string} user.referralCode - User's referral code
 * @property {string} user.referredBy - Referrer's code (if referred)
 * @property {number} user.reputationPoints - Reputation score
 * @property {boolean} user.hasFarcaster - Farcaster connected
 * @property {boolean} user.hasTwitter - Twitter connected
 * @property {boolean} user.isAdmin - Admin privileges
 * @property {boolean} user.isActor - Agent/actor flag
 * 
 * @throws {401} Unauthorized - authentication required
 * @throws {500} Internal server error
 * 
 * @example
 * ```typescript
 * // Get current user profile
 * const response = await fetch('/api/users/me', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * const { user, needsOnboarding, needsOnchain } = await response.json();
 * 
 * if (needsOnboarding) {
 *   // Redirect to onboarding flow
 *   router.push('/onboarding');
 * } else if (needsOnchain) {
 *   // Prompt for on-chain registration
 *   showOnchainModal();
 * } else {
 *   // User fully onboarded
 *   console.log(`Welcome, ${user.displayName}!`);
 * }
 * ```
 * 
 * @see {@link /lib/cached-database-service} Profile stats caching
 * @see {@link /lib/api/auth-middleware} Authentication
 * @see {@link /src/app/onboarding/page.tsx} Onboarding flow
 * @see {@link /src/contexts/AuthContext.tsx} Auth context consumer
 */

import type { NextRequest } from 'next/server'
import { authenticate, getPrivyClient } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { cachedDb } from '@/lib/cached-database-service'

const userSelect = {
  id: true,
  privyId: true,
  username: true,
  displayName: true,
  bio: true,
  profileImageUrl: true,
  coverImageUrl: true,
  walletAddress: true,
  email: true, // For displaying pending referrals
  profileComplete: true,
  hasUsername: true,
  hasBio: true,
  hasProfileImage: true,
  onChainRegistered: true,
  nftTokenId: true,
  referralCode: true,
  referredBy: true,
  reputationPoints: true,
  pointsAwardedForProfile: true,
  hasFarcaster: true,
  hasTwitter: true,
  farcasterUsername: true,
  twitterUsername: true,
  showTwitterPublic: true,
  showFarcasterPublic: true,
  showWalletPublic: true,
  isAdmin: true,
  isActor: true,
  createdAt: true,
  updatedAt: true,
} as const

export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request)
  const privyId = authUser.privyId ?? authUser.userId
  const canonicalUserId = authUser.dbUserId ?? authUser.userId

  // Extract referralCode from query params (passed from frontend)
  const { searchParams } = new URL(request.url)
  const referralCode = searchParams.get('ref') || null

  logger.info(
    'Fetching user profile',
    { privyId, dbUserId: authUser.dbUserId, hasReferralCode: !!referralCode },
    'GET /api/users/me'
  )

  let dbUser = await prisma.user.findUnique({
    where: { privyId },
    select: userSelect,
  })

  // Create minimal user record on first authentication
  if (!dbUser) {
    // Fetch user data from Privy to get email and social accounts
    let email: string | null = null
    let farcasterUsername: string | null = null
    let farcasterFid: string | null = null
    let twitterUsername: string | null = null
    let twitterId: string | null = null

    try {
      const privyClient = getPrivyClient()
      const privyUser = await privyClient.getUser(privyId)
      
      // Extract email from linked accounts
      if (privyUser.email?.address) {
        email = privyUser.email.address
      }
      
      // Extract Farcaster info
      if (privyUser.farcaster) {
        farcasterUsername = privyUser.farcaster.username ?? null
        farcasterFid = privyUser.farcaster.fid ? String(privyUser.farcaster.fid) : null
      }
      
      // Extract Twitter info
      if (privyUser.twitter) {
        twitterUsername = privyUser.twitter.username ?? null
        twitterId = privyUser.twitter.subject ?? null
      }
      
      logger.info(
        'Fetched Privy user data for new user',
        { 
          privyId, 
          hasEmail: !!email, 
          hasFarcaster: !!farcasterUsername, 
          hasTwitter: !!twitterUsername 
        },
        'GET /api/users/me'
      )
    } catch (error) {
      logger.warn(
        'Failed to fetch Privy user data',
        { privyId, error },
        'GET /api/users/me'
      )
      // Continue with user creation even if Privy fetch fails
    }

    // Resolve referrer if referralCode provided
    let resolvedReferrerId: string | null = null
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true, username: true },
      })
      
      // Only set referrer if valid and not self-referral
      if (referrer && referrer.id !== canonicalUserId) {
        resolvedReferrerId = referrer.id
        
        logger.info(
          'Found valid referrer for new user',
          { referrerId: referrer.id, referrerUsername: referrer.username, referredUserId: canonicalUserId, referralCode },
          'GET /api/users/me'
        )
      } else if (referrer?.id === canonicalUserId) {
        logger.warn(
          'Self-referral attempt blocked',
          { userId: canonicalUserId, referralCode },
          'GET /api/users/me'
        )
      } else {
        logger.warn(
          'Invalid referral code provided',
          { referralCode, userId: canonicalUserId },
          'GET /api/users/me'
        )
      }
    }

    logger.info(
      'Creating minimal user record on first authentication',
      { 
        privyId, 
        userId: canonicalUserId, 
        walletAddress: authUser.walletAddress, 
        referredBy: resolvedReferrerId,
        email,
        farcasterUsername,
        twitterUsername,
      },
      'GET /api/users/me'
    )

    dbUser = await prisma.user.create({
      data: {
        id: canonicalUserId,
        privyId,
        walletAddress: authUser.walletAddress?.toLowerCase() ?? null,
        referredBy: resolvedReferrerId,
        email,
        farcasterUsername,
        farcasterFid,
        twitterUsername,
        twitterId,
        hasFarcaster: !!farcasterUsername,
        hasTwitter: !!twitterUsername,
        profileComplete: false,
        hasUsername: false,
        hasBio: false,
        hasProfileImage: false,
        updatedAt: new Date(),
      },
      select: userSelect,
    })

    logger.info(
      'Minimal user record created',
      { userId: dbUser.id, privyId, referredBy: dbUser.referredBy, email: dbUser.email },
      'GET /api/users/me'
    )
  } else if (referralCode && !dbUser.profileComplete) {
    // User exists BUT profile not complete - update referredBy with latest referral code (latest wins!)
    // ⚠️ IMPORTANT: Only allow referral changes BEFORE profile completion to prevent gaming
    const referrer = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true, username: true },
    })
    
    if (referrer && referrer.id !== dbUser.id) {
      const previousReferrer = dbUser.referredBy
      
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: { referredBy: referrer.id },
        select: userSelect,
      })
      
      if (previousReferrer && previousReferrer !== referrer.id) {
        logger.info(
          'Updated user with NEW referrer (latest referral wins)',
          { 
            userId: dbUser.id, 
            previousReferrer, 
            newReferrer: referrer.id, 
            referrerUsername: referrer.username, 
            referralCode 
          },
          'GET /api/users/me'
        )
      } else if (!previousReferrer) {
        logger.info(
          'Updated existing user with referrer',
          { userId: dbUser.id, referrerId: referrer.id, referrerUsername: referrer.username, referralCode },
          'GET /api/users/me'
        )
      }
    } else if (referrer?.id === dbUser.id) {
      logger.warn(
        'Self-referral attempt blocked for existing user',
        { userId: dbUser.id, referralCode },
        'GET /api/users/me'
      )
    }
  } else if (referralCode && dbUser.profileComplete) {
    // User has completed profile - don't allow referral changes anymore
    logger.warn(
      'Referral change blocked - profile already complete',
      { userId: dbUser.id, referralCode, existingReferrer: dbUser.referredBy },
      'GET /api/users/me'
    )
  }

  // Get cached profile stats
  const stats = await cachedDb.getUserProfileStats(dbUser.id)

  const responseUser = {
    id: dbUser.id,
    privyId: dbUser.privyId,
    username: dbUser.username,
    displayName: dbUser.displayName,
    bio: dbUser.bio,
    profileImageUrl: dbUser.profileImageUrl,
    coverImageUrl: dbUser.coverImageUrl,
    walletAddress: dbUser.walletAddress,
    profileComplete: dbUser.profileComplete,
    hasUsername: dbUser.hasUsername,
    hasBio: dbUser.hasBio,
    hasProfileImage: dbUser.hasProfileImage,
    onChainRegistered: dbUser.onChainRegistered,
    nftTokenId: dbUser.nftTokenId,
    referralCode: dbUser.referralCode,
    referredBy: dbUser.referredBy,
    reputationPoints: dbUser.reputationPoints,
    pointsAwardedForProfile: dbUser.pointsAwardedForProfile,
    hasFarcaster: dbUser.hasFarcaster,
    hasTwitter: dbUser.hasTwitter,
    farcasterUsername: dbUser.farcasterUsername,
    twitterUsername: dbUser.twitterUsername,
    showTwitterPublic: dbUser.showTwitterPublic,
    showFarcasterPublic: dbUser.showFarcasterPublic,
    showWalletPublic: dbUser.showWalletPublic,
    isAdmin: dbUser.isAdmin,
    isActor: dbUser.isActor,
    createdAt: dbUser.createdAt.toISOString(),
    updatedAt: dbUser.updatedAt.toISOString(),
    stats: stats || undefined,
  }

  const needsOnboarding = !dbUser.profileComplete
  const needsOnchain = dbUser.profileComplete && !dbUser.onChainRegistered

  logger.info(
    'Authenticated user profile fetched',
    { 
      userId: dbUser.id, 
      username: dbUser.username,
      profileComplete: dbUser.profileComplete,
      onChainRegistered: dbUser.onChainRegistered,
      nftTokenId: dbUser.nftTokenId,
      needsOnboarding, 
      needsOnchain 
    },
    'GET /api/users/me'
  )

  return successResponse({
    authenticated: true,
    needsOnboarding,
    needsOnchain,
    user: responseUser,
  })
})

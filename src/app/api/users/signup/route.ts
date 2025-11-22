/**
 * User Signup API
 * 
 * @route POST /api/users/signup - Complete user signup/onboarding
 * @access Authenticated
 * 
 * @description
 * Completes off-chain user onboarding with profile creation, referral handling,
 * social account linking, and points awards. Supports waitlist users, legal
 * acceptance tracking, and identity token verification from Privy.
 * 
 * @openapi
 * /api/users/signup:
 *   post:
 *     tags:
 *       - Users
 *     summary: Complete user signup
 *     description: Completes off-chain onboarding with profile creation and points awards
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - displayName
 *             properties:
 *               username:
 *                 type: string
 *               displayName:
 *                 type: string
 *               bio:
 *                 type: string
 *               profileImageUrl:
 *                 type: string
 *               coverImageUrl:
 *                 type: string
 *               referralCode:
 *                 type: string
 *               identityToken:
 *                 type: string
 *                 description: Privy identity token for social account linking
 *               isWaitlist:
 *                 type: boolean
 *                 default: false
 *               tosAccepted:
 *                 type: boolean
 *               privacyPolicyAccepted:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Signup completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 referral:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Username taken or invalid input
 *       401:
 *         description: Unauthorized
 * 
 * @example
 * ```typescript
 * await fetch('/api/users/signup', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     username: 'alice',
 *     displayName: 'Alice',
 *     bio: 'Hello world',
 *     referralCode: 'friend123'
 *   })
 * });
 * ```
 * 
 * @see {@link /lib/services/points-service} Points service
 * @see {@link /lib/onboarding/types} Onboarding types
 */

import type { NextRequest } from 'next/server'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { OnboardingProfileSchema } from '@/lib/validation/schemas'
import { prisma } from '@/lib/prisma'
import { PointsService } from '@/lib/services/points-service'
import { POINTS } from '@/lib/constants/points'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { getPrivyClient } from '@/lib/api/auth-middleware'
import type { User as PrivyUser } from '@privy-io/server-auth'
import type { OnboardingProfilePayload } from '@/lib/onboarding/types'
import { trackServerEvent } from '@/lib/posthog/server'
import { notifyNewAccount } from '@/lib/services/notification-service'
import { generateSnowflakeId } from '@/lib/snowflake'
import { withRetry, isRetryableError } from '@/lib/prisma-retry'
import type { JsonValue } from '@/types/common'
import { getOrCreateReferralCode } from '@/lib/services/referral-service'
import { getHashedClientIp } from '@/lib/utils/ip-utils'
import { ConflictError } from '@/lib/errors'

interface SignupRequestBody {
  username: string
  displayName: string
  bio?: string | null
  profileImageUrl?: string | null
  coverImageUrl?: string | null
  referralCode?: string | null
  identityToken?: string | null
  isWaitlist?: boolean // Mark user as waitlist during signup
  tosAccepted?: boolean
  privacyPolicyAccepted?: boolean
}

const selectUserSummary = {
  id: true,
  privyId: true,
  username: true,
  displayName: true,
  bio: true,
  profileImageUrl: true,
  coverImageUrl: true,
  walletAddress: true,
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
  createdAt: true,
  updatedAt: true,
} as const

const SignupSchema = OnboardingProfileSchema.extend({
  identityToken: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  isWaitlist: z.boolean().optional().default(false),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request)
  const body = await request.json() as SignupRequestBody | Record<string, JsonValue>

  const parsedBody = SignupSchema.parse(body)
  const { identityToken, referralCode: rawReferralCode, isWaitlist, ...profileData } = parsedBody
  const parsedProfile = profileData as OnboardingProfilePayload
  const referralCode = rawReferralCode?.trim() || null

  const canonicalUserId = authUser.dbUserId ?? authUser.userId
  const privyId = authUser.privyId ?? authUser.userId
  const walletAddress = authUser.walletAddress?.toLowerCase() ?? null

  // Capture and hash IP address for self-referral detection
  const registrationIpHash = getHashedClientIp(request)

  // Fetch identity data from Privy if token provided
  let identityFarcasterUsername: string | undefined
  let identityTwitterUsername: string | undefined

  if (identityToken) {
    try {
      const privyClient = getPrivyClient()
      const identityUser: PrivyUser = await privyClient.getUserFromIdToken(identityToken)

      identityFarcasterUsername = identityUser.farcaster?.username ?? undefined
      identityTwitterUsername = identityUser.twitter?.username ?? undefined
    } catch (error) {
      logger.warn(
        'Failed to decode identity token during signup',
        { error },
        'POST /api/users/signup'
      )
    }
  } else {
    logger.info('Signup received no identity token; proceeding with provided payload only', undefined, 'POST /api/users/signup')
  }
  
  // Check for imported social data from onboarding flow
  const importedTwitter = parsedProfile.importedFrom === 'twitter'
  const importedFarcaster = parsedProfile.importedFrom === 'farcaster'

  // Wrap transaction with retry logic for connection errors
  const result = await withRetry(
    () => prisma.$transaction(async (tx) => {
      // Check if username is already taken by another user
      const existingUsername = await tx.user.findUnique({
        where: { username: parsedProfile.username },
        select: { id: true },
      })
      if (existingUsername && existingUsername.id !== canonicalUserId) {
        throw new ConflictError('Username is already taken', 'User.username')
      }

      // Check if wallet address is already linked to another user
      if (walletAddress) {
        const existingWallet = await tx.user.findUnique({
          where: { walletAddress: walletAddress },
          select: { id: true },
        })
        if (existingWallet && existingWallet.id !== canonicalUserId) {
          throw new ConflictError('Wallet address is already linked to another account', 'User.walletAddress')
        }
      }

      // Resolve referral (if provided AND not already set)
      let resolvedReferrerId: string | null = null
      let resolvedReferralRecordId: string | null = null
      const normalizedCode = referralCode?.trim() || null

      // Check if user already has referredBy (set in /api/users/me)
      const existingUser = await tx.user.findUnique({
        where: { id: canonicalUserId },
        select: { referredBy: true },
      })

      // Only resolve referral if not already set
      if (!existingUser?.referredBy && normalizedCode) {
        // First, try to find referrer by username (legacy system)
        const referrerByUsername = await tx.user.findUnique({
          where: { username: normalizedCode },
          select: { id: true },
        })

        if (referrerByUsername && referrerByUsername.id !== canonicalUserId) {
          resolvedReferrerId = referrerByUsername.id
        } else {
          // If not found by username, look up who owns this referral code
          const referralOwner = await tx.user.findUnique({
            where: { referralCode: normalizedCode },
            select: { id: true },
          })

          if (referralOwner && referralOwner.id !== canonicalUserId) {
            resolvedReferrerId = referralOwner.id
          }
        }

        // Note: Referral record will be created AFTER user upsert to satisfy FK constraint
      } else if (existingUser?.referredBy) {
        // User already has referredBy (set in /api/users/me)
        resolvedReferrerId = existingUser.referredBy
        logger.info('Using existing referredBy from user record', {
          userId: canonicalUserId,
          referredBy: resolvedReferrerId,
        }, 'POST /api/users/signup')
      }

      const baseUserData = {
        username: parsedProfile.username,
        displayName: parsedProfile.displayName,
        email: parsedProfile.email || null,
        bio: parsedProfile.bio ?? '',
        profileImageUrl: parsedProfile.profileImageUrl ?? null,
        coverImageUrl: parsedProfile.coverImageUrl ?? null,
        walletAddress,
        profileComplete: true,
        profileSetupCompletedAt: new Date(), // Track when profile was completed
        hasUsername: true,
        hasBio: Boolean(parsedProfile.bio && parsedProfile.bio.trim().length > 0),
        hasProfileImage: Boolean(parsedProfile.profileImageUrl),
        // Waitlist users start with 100 points instead of 1000
        ...(isWaitlist ? { reputationPoints: 100 } : {}),
        // Store IP hash for self-referral detection
        ...(registrationIpHash ? { registrationIpHash } : {}),
        // Legal acceptance (GDPR compliance)
        ...(parsedProfile.tosAccepted ? {
          tosAccepted: true,
          tosAcceptedAt: new Date(),
          tosAcceptedVersion: '2025-11-11',
        } : {}),
        ...(parsedProfile.privacyPolicyAccepted ? {
          privacyPolicyAccepted: true,
          privacyPolicyAcceptedAt: new Date(),
          privacyPolicyAcceptedVersion: '2025-11-11',
        } : {}),
      }

      const user = await tx.user.upsert({
        where: { id: canonicalUserId },
        update: {
          ...baseUserData,
          referredBy: resolvedReferrerId ?? undefined,
          // Handle Farcaster from Privy identity or onboarding import
          ...(identityFarcasterUsername || importedFarcaster
            ? {
                hasFarcaster: true,
                farcasterUsername: parsedProfile.farcasterUsername ?? identityFarcasterUsername,
                farcasterFid: parsedProfile.farcasterFid ?? undefined,
              }
            : {}),
          // Handle Twitter from Privy identity or onboarding import
          ...(identityTwitterUsername || importedTwitter
            ? {
                hasTwitter: true,
                twitterUsername: parsedProfile.twitterUsername ?? identityTwitterUsername,
                twitterId: parsedProfile.twitterId ?? undefined,
              }
            : {}),
        },
        create: {
          id: canonicalUserId,
          privyId,
          ...baseUserData,
          referredBy: resolvedReferrerId,
          updatedAt: new Date(),
          // Handle Farcaster from Privy identity or onboarding import
          ...(identityFarcasterUsername || importedFarcaster
            ? {
                hasFarcaster: true,
                farcasterUsername: parsedProfile.farcasterUsername ?? identityFarcasterUsername,
                farcasterFid: parsedProfile.farcasterFid ?? undefined,
              }
            : {}),
          // Handle Twitter from Privy identity or onboarding import
          ...(identityTwitterUsername || importedTwitter
            ? {
                hasTwitter: true,
                twitterUsername: parsedProfile.twitterUsername ?? identityTwitterUsername,
                twitterId: parsedProfile.twitterId ?? undefined,
              }
            : {}),
        },
        select: selectUserSummary,
      })

      // Create referral record AFTER user exists (to satisfy FK constraint)
      if (resolvedReferrerId && normalizedCode) {
        const referralRecord = await tx.referral.upsert({
          where: {
            referralCode_referredUserId: {
              referralCode: normalizedCode,
              referredUserId: user.id,
            },
          },
          create: {
            id: await generateSnowflakeId(),
            referrerId: resolvedReferrerId,
            referralCode: normalizedCode,
            referredUserId: user.id,
            status: 'pending',
          },
          update: {
            // On retry, keep existing record but ensure status is pending
            status: 'pending',
          },
          select: { id: true },
        })
        resolvedReferralRecordId = referralRecord.id
      }

      return {
        user,
        referrerId: resolvedReferrerId,
        referralRecordId: resolvedReferralRecordId,
      }
    }),
    'signup transaction',
    { maxRetries: 3, initialDelayMs: 200, maxDelayMs: 2000 }
  ).catch((error: unknown) => {
    // Improve error message for connection errors
    if (isRetryableError(error)) {
      logger.error(
        'Database connection error during signup transaction',
        { error: error instanceof Error ? error.message : String(error) },
        'POST /api/users/signup'
      );
      throw new Error('Database connection error. Please try again in a moment.');
    }
    throw error;
  })

  // Generate referral code for new user (ensures they can refer others immediately)
  await getOrCreateReferralCode(result.user.id)

  // Award points for social account linking
  const pointsAwarded = {
    farcaster: 0,
    twitter: 0,
    wallet: 0,
    profile: 0,
    referral: 0,
    referralBonus: 0,
  };

  // Award referral points if user was referred
  if (result.referrerId) {
    // Award points to REFERRER
    const referralResult = await PointsService.awardReferralSignup(result.referrerId, result.user.id)
    pointsAwarded.referral = referralResult.pointsAwarded
    
    // Only proceed with referral rewards if referrer was successfully awarded
    if (referralResult.success) {
      // Award bonus to NEW USER (referee) for using referral code
      const refereeBonus = await PointsService.awardPoints(
        result.user.id,
        POINTS.REFERRAL_BONUS,
        'referral_bonus',
        { referrerId: result.referrerId }
      )
      pointsAwarded.referralBonus = refereeBonus.pointsAwarded
      
      // Update referral status to completed
      if (result.referralRecordId) {
        await prisma.referral.update({
          where: { id: result.referralRecordId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        })
      }
      
      // Auto-follow the referrer (new user follows the person who referred them)
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: result.user.id,       // New user is the follower
            followingId: result.referrerId,   // Referrer is being followed
          },
        },
        update: {},
        create: {
          id: await generateSnowflakeId(),
          followerId: result.user.id,
          followingId: result.referrerId,
        },
      })
      
      logger.info(
        'Awarded referral points to both referrer and referee',
        { 
          referrerId: result.referrerId, 
          referredUserId: result.user.id, 
          referrerPoints: referralResult.pointsAwarded,
          refereeBonus: refereeBonus.pointsAwarded,
        },
        'POST /api/users/signup'
      )
    } else {
      // Referral was blocked (self-referral, weekly limit, etc.)
      // Update referral status to rejected
      if (result.referralRecordId) {
        await prisma.referral.update({
          where: { id: result.referralRecordId },
          data: {
            status: 'rejected',
          },
        })
      }
      
      logger.warn(
        'Referral blocked - referrer not rewarded',
        { 
          referrerId: result.referrerId, 
          referredUserId: result.user.id, 
          error: referralResult.error,
        },
        'POST /api/users/signup'
      )
    }
  }

  if (identityFarcasterUsername || importedFarcaster) {
    const farcasterUsername = parsedProfile.farcasterUsername ?? identityFarcasterUsername
    if (farcasterUsername) {
      const pointsResult = await PointsService.awardFarcasterLink(result.user.id, farcasterUsername)
      pointsAwarded.farcaster = pointsResult.pointsAwarded;
      logger.info(
        'Awarded Farcaster link points',
        { userId: result.user.id, username: farcasterUsername, points: pointsResult.pointsAwarded },
        'POST /api/users/signup'
      );
    }
  }
  if (identityTwitterUsername || importedTwitter) {
    const twitterUsername = parsedProfile.twitterUsername ?? identityTwitterUsername
    if (twitterUsername) {
      const pointsResult = await PointsService.awardTwitterLink(result.user.id, twitterUsername)
      pointsAwarded.twitter = pointsResult.pointsAwarded;
      logger.info(
        'Awarded Twitter link points',
        { userId: result.user.id, username: twitterUsername, points: pointsResult.pointsAwarded },
        'POST /api/users/signup'
      );
    }
  }
  if (walletAddress) {
    const pointsResult = await PointsService.awardWalletConnect(result.user.id, walletAddress)
    pointsAwarded.wallet = pointsResult.pointsAwarded;
    logger.info(
      'Awarded wallet connect points',
      { userId: result.user.id, address: walletAddress, points: pointsResult.pointsAwarded },
      'POST /api/users/signup'
    );
  }

  if (!result.user.pointsAwardedForProfile) {
    const pointsResult = await PointsService.awardProfileCompletion(result.user.id)
    pointsAwarded.profile = pointsResult.pointsAwarded;
    logger.info(
      'Awarded profile completion points',
      { userId: result.user.id, points: pointsResult.pointsAwarded },
      'POST /api/users/signup'
    );
  }

  const totalPointsAwarded = Object.values(pointsAwarded).reduce((sum, p) => sum + p, 0);

  logger.info(
    'User completed off-chain onboarding',
    {
      userId: result.user.id,
      hasReferrer: Boolean(result.referrerId),
      pointsAwarded: pointsAwarded,
      totalPointsAwarded: totalPointsAwarded,
      hasFarcaster: result.user.hasFarcaster,
      hasTwitter: result.user.hasTwitter,
    },
    'POST /api/users/signup'
  )

  try {
    await notifyNewAccount(result.user.id)
  } catch (error) {
    logger.warn('Failed to send welcome notification', { userId: result.user.id, error }, 'POST /api/users/signup')
  }

  // Track signup with PostHog
  await trackServerEvent(result.user.id, 'signup_completed', {
    username: result.user.username,
    hasReferrer: Boolean(result.referrerId),
    hasFarcaster: result.user.hasFarcaster,
    hasTwitter: result.user.hasTwitter,
    hasProfileImage: result.user.hasProfileImage,
    hasBio: result.user.hasBio,
    onChainRegistered: result.user.onChainRegistered,
    pointsAwarded: totalPointsAwarded,
    pointsBreakdown: pointsAwarded,
    importedFrom: parsedProfile.importedFrom || null,
  })

  return successResponse({
    user: {
      ...result.user,
      createdAt: result.user.createdAt.toISOString(),
      updatedAt: result.user.updatedAt.toISOString(),
    },
    referral: result.referrerId
      ? {
          referrerId: result.referrerId,
          referralRecordId: result.referralRecordId,
        }
      : null,
  })
})

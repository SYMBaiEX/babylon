/**
 * Twitter OAuth Callback API
 * 
 * @route GET /api/auth/twitter/callback - Handle Twitter OAuth callback
 * @access Public (with state validation)
 * 
 * @description
 * Handles OAuth callback from Twitter, exchanges code for token, fetches profile,
 * links Twitter account, and awards points. Redirects to rewards page with status.
 * 
 * @openapi
 * /api/auth/twitter/callback:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Handle Twitter OAuth callback
 *     description: Processes OAuth callback and links Twitter account (redirects to rewards page)
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Twitter
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State parameter (userId|timestamp|nonce)
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: OAuth error if authorization failed
 *     responses:
 *       302:
 *         description: Redirect to rewards page
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: /rewards?success=twitter_linked&points=100
 *       400:
 *         description: Invalid parameters or state expired
 * 
 * @example
 * ```typescript
 * // Twitter redirects to:
 * // /api/auth/twitter/callback?code=abc123&state=user-id|timestamp|nonce
 * 
 * // On success, user redirected to:
 * // /rewards?success=twitter_linked&points=100
 * ```
 * 
 * @see {@link /api/auth/twitter/initiate} OAuth initiation
 * @see {@link /lib/services/points-service} Points service
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { PointsService } from '@/lib/services/points-service'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/errors/error-handler'

const TwitterCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams
  const parsed = TwitterCallbackQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL(`/rewards?error=${encodeURIComponent('Invalid parameters received from Twitter')}`, request.url)
    )
  }

  const { code, state, error: oauthError } = parsed.data;

  // Handle OAuth error
  if (oauthError) {
    logger.error('Twitter OAuth error', { oauthError }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL(`/rewards?error=${encodeURIComponent('Twitter authentication failed')}`, request.url)
    )
  }

  if (!code || !state) {
    logger.warn('Twitter callback missing code or state', { hasCode: !!code, hasState: !!state }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=missing_params', request.url)
    )
  }

  // Verify state and get user ID from it
  // State format: "userId|timestamp|random" (using | to avoid conflicts with Privy DIDs)
  const stateParts = state.split('|')
  if (stateParts.length < 2) {
    logger.warn('Twitter callback invalid state format', { state }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=invalid_state', request.url)
    )
  }

  const [userId, timestampStr] = stateParts
  if (!userId || !timestampStr) {
    logger.warn('Twitter callback missing userId or timestamp in state', { state }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=invalid_state', request.url)
    )
  }

  const stateTimestamp = parseInt(timestampStr, 10)
  if (isNaN(stateTimestamp)) {
    logger.warn('Twitter callback invalid timestamp in state', { state, timestampStr }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=invalid_state', request.url)
    )
  }

  const now = Date.now()
  
  // State expires after 10 minutes
  if (now - stateTimestamp > 10 * 60 * 1000) {
    logger.warn('Twitter callback state expired', { stateTimestamp, now, ageMs: now - stateTimestamp }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=state_expired', request.url)
    )
  }

  // Retrieve PKCE code verifier from database
  const oauthState = await prisma.oAuthState.findFirst({
    where: {
      state,
      returnPath: 'twitter', // Provider stored in returnPath
      userId,
      expiresAt: { gte: new Date() },
    },
  })

  // Debug: Check all records without filters
  const allStates = await prisma.oAuthState.findMany({
    where: {
      userId,
    },
    select: {
      state: true,
      returnPath: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 3,
  })

  if (!oauthState || !oauthState.codeVerifier) {
    logger.warn('Twitter callback missing or expired PKCE state', { 
      state, 
      userId, 
      allStates,
      found: !!oauthState 
    }, 'TwitterCallback')
    
    return NextResponse.redirect(
      new URL(`/rewards?error=invalid_stat`, request.url)
    )
  }

  // Exchange code for access token with PKCE verifier
  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/twitter/callback`,
      code_verifier: oauthState.codeVerifier,
    }),
  })
  
  // Clean up OAuth state after use
  await prisma.oAuthState.delete({
    where: { id: oauthState.id },
  }).catch((error) => {
    logger.warn('Failed to delete OAuth state', { error, stateId: oauthState.id }, 'TwitterCallback')
  })

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.text()
    logger.error('Failed to exchange Twitter code', { errorData }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=token_exchange_failed', request.url)
    )
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // Get user info from Twitter - fetch comprehensive profile data
  const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url,description', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!userResponse.ok) {
    logger.error('Failed to get Twitter user info', {}, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=failed_to_get_user', request.url)
    )
  }

  const userData = await userResponse.json() as { 
    data?: { 
      id?: string
      username?: string
      name?: string
      profile_image_url?: string
      description?: string
    } 
  }
  
  if (!userData.data?.id || !userData.data?.username) {
    logger.error('Invalid Twitter user data received', { userData }, 'TwitterCallback')
    return NextResponse.redirect(
      new URL('/rewards?error=invalid_twitter_data', request.url)
    )
  }

  const twitterUser = userData.data
  const twitterUsername = twitterUser.username
  const twitterId = twitterUser.id

  // Check if Twitter account is already linked to another user
  const existingLink = await prisma.user.findFirst({
    where: {
      twitterId,
      id: { not: userId },
    },
  })

  if (existingLink) {
    return NextResponse.redirect(
      new URL('/rewards?error=twitter_already_linked', request.url)
    )
  }

  // Update user with Twitter info
  await prisma.user.update({
    where: { id: userId },
    data: {
      twitterId,
      twitterUsername,
      hasTwitter: true,
      twitterAccessToken: accessToken, // Store encrypted in production
      twitterRefreshToken: tokenData.refresh_token,
      twitterTokenExpiresAt: tokenData.expires_in 
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null,
    },
  })

  // Award points if this is the first time linking Twitter
  const pointsResult = await PointsService.awardTwitterLink(userId, twitterUsername)

  // Check if this qualifies a referral (award bonus to referrer)
  if (pointsResult.success) {
    await PointsService.checkAndQualifyReferral(userId).catch((error) => {
      // Log error but don't fail the request if qualification check fails
      logger.warn(
        `Failed to check and qualify referral for user ${userId}`,
        { userId, error },
        'TwitterCallback'
      );
    });
  }

  logger.info(
    'Twitter account linked successfully',
    { userId, twitterUsername, pointsAwarded: pointsResult.pointsAwarded },
    'TwitterCallback'
  )

  // Redirect back to rewards page with success
  return NextResponse.redirect(
    new URL(
      `/rewards?success=twitter_linked&points=${pointsResult.pointsAwarded}`,
      request.url
    )
  )
});


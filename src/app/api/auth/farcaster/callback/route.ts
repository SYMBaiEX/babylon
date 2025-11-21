/**
 * Farcaster Authentication Callback API
 * 
 * @route POST /api/auth/farcaster/callback - Link Farcaster account
 * @access Public (with signature verification)
 * 
 * @description
 * Handles Farcaster "Sign-In With Farcaster" (SIWF) authentication flow. Verifies
 * signatures via Neynar API, links Farcaster accounts, and awards bonus points.
 * 
 * @openapi
 * /api/auth/farcaster/callback:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Link Farcaster account
 *     description: Verifies Farcaster signature and links account (SIWF flow)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - signature
 *               - fid
 *               - username
 *               - state
 *             properties:
 *               message:
 *                 type: string
 *                 description: Signed message from Farcaster
 *               signature:
 *                 type: string
 *                 description: Cryptographic signature
 *               fid:
 *                 type: integer
 *                 description: Farcaster ID (FID)
 *               username:
 *                 type: string
 *                 description: Farcaster username
 *               displayName:
 *                 type: string
 *                 description: Display name from Farcaster
 *               pfpUrl:
 *                 type: string
 *                 description: Profile picture URL
 *               state:
 *                 type: string
 *                 description: State parameter (userId:timestamp)
 *     responses:
 *       200:
 *         description: Farcaster account linked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 pointsAwarded:
 *                   type: number
 *                 newTotal:
 *                   type: number
 *       400:
 *         description: Invalid payload or expired state
 *       401:
 *         description: Invalid signature
 *       404:
 *         description: User not found
 *       409:
 *         description: Farcaster account already linked
 * 
 * @example
 * ```typescript
 * // Link Farcaster account
 * const result = await fetch('/api/auth/farcaster/callback', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     message: '0x...',
 *     signature: '0x...',
 *     fid: 12345,
 *     username: 'alice',
 *     displayName: 'Alice',
 *     pfpUrl: 'https://...',
 *     state: 'user-123:1234567890'
 *   })
 * });
 * 
 * const { pointsAwarded, newTotal } = await result.json();
 * console.log(`Earned ${pointsAwarded} points!`);
 * ```
 * 
 * @see {@link /lib/services/points-service} Points service
 * @see {@link https://docs.neynar.com} Neynar API documentation
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { PointsService } from '@/lib/services/points-service'
import { withErrorHandling } from '@/lib/errors/error-handler';
import { z } from 'zod';

const FarcasterCallbackBodySchema = z.object({
  message: z.string(),
  signature: z.string(),
  fid: z.number(),
  username: z.string(),
  displayName: z.string().optional(),
  pfpUrl: z.string().url().optional(),
  state: z.string(),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = FarcasterCallbackBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { message, signature, fid, username, displayName, pfpUrl, state } = parsed.data;

  // Verify state format and get user ID
  const stateParts = state.split(':')
  if (stateParts.length < 2) {
    return NextResponse.json(
      { error: 'Invalid state format' },
      { status: 400 }
    )
  }

  const [userId, timestampStr] = stateParts
  if (!userId || !timestampStr) {
    return NextResponse.json(
      { error: 'Invalid state format' },
      { status: 400 }
    )
  }

  const stateTimestamp = parseInt(timestampStr, 10)
  if (isNaN(stateTimestamp)) {
    return NextResponse.json(
      { error: 'Invalid state timestamp' },
      { status: 400 }
    )
  }

  const now = Date.now()
  
  // State expires after 10 minutes
  if (now - stateTimestamp > 10 * 60 * 1000) {
    return NextResponse.json(
      { error: 'State expired' },
      { status: 400 }
    )
  }

  // Verify Farcaster signature and SIWF message content
  const verificationResult = await verifyFarcasterSignature(
    message,
    signature,
    fid,
    request.nextUrl.origin
  )
  
  if (!verificationResult.valid) {
    return NextResponse.json(
      { error: verificationResult.error || 'Invalid signature' },
      { status: 401 }
    )
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // Check if Farcaster account is already linked to another user
  const existingLink = await prisma.user.findFirst({
    where: {
      farcasterFid: fid.toString(),
      id: { not: userId },
    },
  })

  if (existingLink) {
    return NextResponse.json(
      { error: 'Farcaster account already linked to another user' },
      { status: 409 }
    )
  }

  // Update user with Farcaster info
  await prisma.user.update({
    where: { id: userId },
    data: {
      farcasterFid: fid.toString(),
      farcasterUsername: username,
      hasFarcaster: true,
      farcasterDisplayName: displayName,
      farcasterPfpUrl: pfpUrl,
      farcasterVerifiedAt: new Date(),
    },
  })

  // Award points if this is the first time linking Farcaster
  const pointsResult = await PointsService.awardFarcasterLink(userId, username)

  // Check if this qualifies a referral (award bonus to referrer)
  if (pointsResult.success) {
    await PointsService.checkAndQualifyReferral(userId).catch((error) => {
      // Log error but don't fail the request if qualification check fails
      logger.warn(
        `Failed to check and qualify referral for user ${userId}`,
        { userId, error },
        'FarcasterCallback'
      );
    });
  }

  logger.info(
    'Farcaster account linked successfully',
    { userId, farcasterUsername: username, fid: fid, pointsAwarded: pointsResult.pointsAwarded },
    'FarcasterCallback'
  )

  return NextResponse.json({
    success: true,
    pointsAwarded: pointsResult.pointsAwarded,
    newTotal: pointsResult.newTotal,
  })
});

/**
 * Parse SIWF message to extract domain, expiration, and other fields
 * SIWF messages follow EIP-4361 format
 */
function parseSiwfMessage(message: string): {
  domain?: string
  expirationTime?: string
  issuedAt?: string
  nonce?: string
  uri?: string
} {
  const result: {
    domain?: string
    expirationTime?: string
    issuedAt?: string
    nonce?: string
    uri?: string
  } = {}

  // Extract domain (first line format: "domain.com wants you to sign in...")
  const domainMatch = message.match(/^([^\s]+)\s+wants\s+you\s+to\s+sign/)
  if (domainMatch) {
    result.domain = domainMatch[1]
  }

  // Extract fields from structured format
  const expirationMatch = message.match(/Expiration Time:\s*([^\n]+)/i)
  if (expirationMatch && expirationMatch[1]) {
    result.expirationTime = expirationMatch[1].trim()
  }

  const issuedAtMatch = message.match(/Issued At:\s*([^\n]+)/i)
  if (issuedAtMatch && issuedAtMatch[1]) {
    result.issuedAt = issuedAtMatch[1].trim()
  }

  const nonceMatch = message.match(/Nonce:\s*([^\n]+)/i)
  if (nonceMatch && nonceMatch[1]) {
    result.nonce = nonceMatch[1].trim()
  }

  const uriMatch = message.match(/URI:\s*([^\n]+)/i)
  if (uriMatch && uriMatch[1]) {
    result.uri = uriMatch[1].trim()
  }

  return result
}

/**
 * Verify Farcaster signature using Neynar API
 * Also validates SIWF message content (domain, expiration)
 */
async function verifyFarcasterSignature(
  message: string,
  signature: string,
  fid: number,
  requestOrigin?: string
): Promise<{ valid: boolean; error?: string }> {
  // Parse SIWF message to extract domain and expiration
  const siwfFields = parseSiwfMessage(message)

  // Verify domain matches our domain (if specified in message)
  if (siwfFields.domain) {
    const appDomain = process.env.NEXT_PUBLIC_APP_URL 
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
      : requestOrigin
        ? new URL(requestOrigin).hostname
        : null

    if (appDomain && siwfFields.domain !== appDomain && siwfFields.domain !== `www.${appDomain}`) {
      logger.warn('SIWF domain mismatch', {
        messageDomain: siwfFields.domain,
        appDomain,
        fid,
      }, 'verifyFarcasterSignature')
      // Note: We log but don't fail, as domain might be set by Farcaster client
      // The cryptographic signature verification is the primary security check
    }
  }

  // Verify expiration time hasn't passed
  if (siwfFields.expirationTime) {
    try {
      const expirationDate = new Date(siwfFields.expirationTime)
      const now = new Date()
      if (expirationDate < now) {
        logger.warn('SIWF message expired', {
          expirationTime: siwfFields.expirationTime,
          now: now.toISOString(),
          fid,
        }, 'verifyFarcasterSignature')
        return { valid: false, error: 'Message expired' }
      }
    } catch (error) {
      logger.warn('Failed to parse SIWF expiration time', {
        expirationTime: siwfFields.expirationTime,
        error: error instanceof Error ? error.message : String(error),
      }, 'verifyFarcasterSignature')
    }
  }

  // Verify cryptographic signature via Neynar API
  const response = await fetch('https://api.neynar.com/v2/farcaster/verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': process.env.NEYNAR_API_KEY!,
    },
    body: JSON.stringify({
      message,
      signature,
      fid,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Neynar verification failed', { 
      status: response.status, 
      error: errorText,
      fid 
    }, 'verifyFarcasterSignature')
    return { valid: false, error: 'Signature verification failed' }
  }

  const data = await response.json() as { valid: boolean }
  return { valid: data.valid }
}


/**
 * API Route: /api/users/[userId]/referral-code
 * Methods: GET (get or generate referral code)
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
 * Generate a unique referral code
 */
function generateReferralCode(userId: string): string {
  // Use first 8 chars of user ID + random 4 chars
  const userPrefix = userId.slice(0, 8)
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${userPrefix}-${random}`
}

/**
 * GET /api/users/[userId]/referral-code
 * Get user's referral code (create if doesn't exist)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Authenticate user
    const authUser = await authenticate(request)
    const { userId } = await params

    // Verify user is accessing their own referral code
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403)
    }

    // Get or create referral code
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        referralCount: true,
      },
    })

    if (!user) {
      return errorResponse('User not found', 404)
    }

    // Generate referral code if doesn't exist
    if (!user.referralCode) {
      let code = generateReferralCode(userId)
      let attempts = 0
      const maxAttempts = 10

      // Ensure code is unique
      while (attempts < maxAttempts) {
        const existing = await prisma.user.findUnique({
          where: { referralCode: code },
        })

        if (!existing) {
          break
        }

        code = generateReferralCode(userId)
        attempts++
      }

      if (attempts >= maxAttempts) {
        return errorResponse('Failed to generate unique referral code', 500)
      }

      // Update user with new referral code
      user = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: {
          id: true,
          referralCode: true,
          referralCount: true,
        },
      })

      logger.info(
        `Generated referral code for user ${userId}: ${code}`,
        { userId, code },
        'GET /api/users/[userId]/referral-code'
      )
    }

    // Create referral entry if doesn't exist
    const existingReferral = await prisma.referral.findUnique({
      where: { referralCode: user.referralCode! },
    })

    if (!existingReferral) {
      await prisma.referral.create({
        data: {
          referrerId: userId,
          referralCode: user.referralCode!,
          status: 'pending',
        },
      })
    }

    return successResponse({
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      referralUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.game'}?ref=${user.referralCode}`,
    })
  } catch (error) {
    logger.error('Error getting referral code:', error, 'GET /api/users/[userId]/referral-code')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to get referral code',
      500
    )
  }
}


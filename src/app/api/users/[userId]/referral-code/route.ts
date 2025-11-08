/**
 * API Route: /api/users/[userId]/referral-code
 * Methods: GET (get or generate referral code)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { AuthorizationError, BusinessLogicError, InternalServerError, NotFoundError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * Generate a unique referral code
 */
function generateReferralCode(userId: string): string {
  // Use first 8 chars of user ID + random 4 chars
  const userPrefix = userId.slice(0, 8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${userPrefix}-${random}`;
}

/**
 * GET /api/users/[userId]/referral-code
 * Get user's referral code (create if doesn't exist)
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Verify user is accessing their own referral code
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only access your own referral code', 'referral-code', 'read');
  }

  // Get or create referral code with RLS
  const { user } = await asUser(authUser, async (db) => {
    // Get or create referral code
    let usr = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        referralCount: true,
      },
    });

    if (!usr) {
      throw new NotFoundError('User', userId);
    }

    // Generate referral code if doesn't exist
    if (!usr.referralCode) {
      let code = generateReferralCode(userId);
      let attempts = 0;
      const maxAttempts = 10;

      // Ensure code is unique
      while (attempts < maxAttempts) {
        const existing = await db.user.findUnique({
          where: { referralCode: code },
        });

        if (!existing) {
          break;
        }

        code = generateReferralCode(userId);
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new InternalServerError('Failed to generate unique referral code');
      }

      // Update user with new referral code
      usr = await db.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: {
          id: true,
          referralCode: true,
          referralCount: true,
        },
      });

      logger.info(
        `Generated referral code for user ${userId}: ${code}`,
        { userId, code },
        'GET /api/users/[userId]/referral-code'
      );
    }

    // Create referral entry if doesn't exist
    const existingReferral = await db.referral.findUnique({
      where: { referralCode: usr.referralCode! },
    });

    let ref = existingReferral;
    if (!existingReferral) {
      ref = await db.referral.create({
        data: {
          referrerId: userId,
          referralCode: usr.referralCode!,
          status: 'pending',
        },
      });
    }

    return { user: usr, referral: ref };
  });

  logger.info('Referral code fetched successfully', { userId, referralCode: user.referralCode }, 'GET /api/users/[userId]/referral-code');

  return successResponse({
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    referralUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://babylon.game'}?ref=${user.referralCode}`,
  });
});


/**
 * API Route: /api/users/[userId]/balance
 * Methods: GET (get user balance)
 */

import type { NextRequest } from 'next/server';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { BusinessLogicError, AuthorizationError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { WalletService } from '@/lib/services/wallet-service';
import { logger } from '@/lib/logger';
/**
 * GET /api/users/[userId]/balance
 * Get user's virtual balance and stats
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Optional authentication - check if user is requesting their own balance
  const authUser = await optionalAuth(request);

  // If authenticated, ensure they're requesting their own balance
  if (authUser && authUser.userId !== userId) {
    throw new AuthorizationError('Can only view your own balance', 'balance', 'read');
  }

  // Ensure user exists in database with RLS
  await asUser(authUser, async (db) => {
    let dbUser = await db.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      // Create user if they don't exist yet
      dbUser = await db.user.create({
        data: {
          id: userId,
          isActor: false,
        },
      });
    }
  });

  // Get balance info (WalletService handles its own queries)
  const balanceInfo = await WalletService.getBalance(userId);

  logger.info('Balance fetched successfully', { userId, balance: balanceInfo.balance }, 'GET /api/users/[userId]/balance');

  return successResponse({
    balance: balanceInfo.balance,
    totalDeposited: balanceInfo.totalDeposited,
    totalWithdrawn: balanceInfo.totalWithdrawn,
    lifetimePnL: balanceInfo.lifetimePnL,
  });
});

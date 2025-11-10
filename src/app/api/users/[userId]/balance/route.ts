/**
 * API Route: /api/users/[userId]/balance
 * Methods: GET (get user balance)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { BusinessLogicError, AuthorizationError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { findUserByIdentifier } from '@/lib/users/user-lookup';
import { cachedDb } from '@/lib/cached-database-service';
/**
 * GET /api/users/[userId]/balance
 * Get user's virtual balance and stats
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const params = await context.params);
  const { userId } = UserIdParamSchema.parse(params);

  // Optional authentication - check if user is requesting their own balance
  const authUser = await optionalAuth(request);

  // Ensure user exists in database
  let dbUser = await findUserByIdentifier(userId);

  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: userId,
        privyId: userId,
        isActor: false,
      },
    });
  }

  const canonicalUserId = dbUser!.id;

  // If authenticated, ensure they're requesting their own balance
  if (authUser && authUser.userId !== canonicalUserId) {
    throw new AuthorizationError('Can only view your own balance', 'balance', 'read');
  }

  // Get balance info with caching
  const balanceData = await cachedDb.getUserBalance(canonicalUserId);

  if (!balanceData) {
    throw new BusinessLogicError('User balance not found', 'BALANCE_NOT_FOUND');
  }

  const balanceInfo = {
    balance: balanceData.virtualBalance.toString(),
    totalDeposited: balanceData.totalDeposited.toString(),
    totalWithdrawn: balanceData.totalWithdrawn.toString(),
    lifetimePnL: balanceData.lifetimePnL.toString(),
  };

  logger.info('Balance fetched successfully (cached)', { userId: canonicalUserId, balance: balanceInfo.balance }, 'GET /api/users/[userId]/balance');

  return successResponse({
    balance: balanceInfo.balance,
    totalDeposited: balanceInfo.totalDeposited,
    totalWithdrawn: balanceInfo.totalWithdrawn,
    lifetimePnL: balanceInfo.lifetimePnL,
  });
});

/**
 * API Route: /api/users/[userId]/balance
 * Methods: GET (get user balance)
 */

import { optionalAuth } from '@/lib/api/auth-middleware';
import { cachedDb } from '@/lib/cached-database-service';
import { prisma } from '@/lib/database-service';
import { AuthorizationError, BusinessLogicError } from '@/lib/errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { findUserByIdentifier } from '@/lib/users/user-lookup';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';
/**
 * GET /api/users/[userId]/balance
 * Get user's virtual balance and stats
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const { userId } = UserIdParamSchema.parse(await context.params);

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

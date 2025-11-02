/**
 * API Route: /api/users/[userId]/balance
 * Methods: GET (get user balance)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/lib/services/wallet-service';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * GET /api/users/[userId]/balance
 * Get user's virtual balance and stats
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return errorResponse('User ID is required', 400);
    }

    // Optional authentication - check if user is requesting their own balance
    const authUser = await optionalAuth(request);

    // If authenticated, ensure they're requesting their own balance
    if (authUser && authUser.userId !== userId) {
      return errorResponse('Unauthorized - can only view your own balance', 403);
    }

    // Ensure user exists in database
    let dbUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      // Create user if they don't exist yet
      dbUser = await prisma.user.create({
        data: {
          id: userId,
          isActor: false,
        },
      });
    }

    // Get balance info
    const balanceInfo = await WalletService.getBalance(userId);

    return successResponse({
      balance: balanceInfo.balance,
      totalDeposited: balanceInfo.totalDeposited,
      totalWithdrawn: balanceInfo.totalWithdrawn,
      lifetimePnL: balanceInfo.lifetimePnL,
    });
  } catch (error) {
    logger.error('Error fetching balance:', error, 'GET /api/users/[userId]/balance');
    return errorResponse('Failed to fetch balance', 500);
  }
}

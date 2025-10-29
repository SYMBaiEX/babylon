/**
 * API Route: /api/users/[userId]/balance
 * Methods: GET (get user's balance)
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse, optionalAuth } from '@/lib/api/auth-middleware';
import { WalletService } from '@/services/WalletService';

/**
 * GET /api/users/[userId]/balance
 * Get user's virtual wallet balance
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const user = await optionalAuth(request);

    // Only show detailed balance if requesting own
    const isOwnProfile = user?.userId === userId;

    if (!isOwnProfile) {
      return errorResponse('Cannot view other user balances', 403);
    }

    const balanceInfo = await WalletService.getBalance(userId);

    return successResponse({
      balance: balanceInfo.balance,
      totalDeposited: balanceInfo.totalDeposited,
      totalWithdrawn: balanceInfo.totalWithdrawn,
      lifetimePnL: balanceInfo.lifetimePnL,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return errorResponse('Failed to fetch balance');
  }
}


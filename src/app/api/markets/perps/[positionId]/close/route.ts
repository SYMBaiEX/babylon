/**
 * API Route: /api/markets/perps/[positionId]/close
 * Methods: POST (close a perpetual futures position)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { getPerpsEngine } from '@/lib/perps-service';
import { WalletService } from '@/services/WalletService';

const prisma = new PrismaClient();

/**
 * POST /api/markets/perps/[positionId]/close
 * Close an existing perpetual futures position
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await authenticate(request);
    const { positionId } = await params;

    if (!positionId) {
      return errorResponse('Position ID is required', 400);
    }

    // 2. Get position from database
    const dbPosition = await prisma.perpPosition.findUnique({
      where: { id: positionId },
    });

    if (!dbPosition) {
      return errorResponse('Position not found', 404);
    }

    // 3. Verify ownership
    if (dbPosition.userId !== user.userId) {
      return errorResponse('Unauthorized: not your position', 403);
    }

    // 4. Check if already closed
    if (dbPosition.closedAt) {
      return errorResponse('Position already closed', 400);
    }

    // 5. Close position via engine
    const perpsEngine = getPerpsEngine();
    const { position, realizedPnL } = perpsEngine.closePosition(positionId);

    // 6. Calculate final settlement
    const marginPaid = position.size / position.leverage;
    const settlement = marginPaid + realizedPnL; // Margin + PnL

    // 7. Credit settlement to balance
    if (settlement > 0) {
      await WalletService.credit(
        user.userId,
        settlement,
        'perp_close',
        `Closed ${position.leverage}x ${position.side} ${position.ticker} - PnL: ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`,
        position.id
      );
    }

    // 8. Record PnL
    await WalletService.recordPnL(user.userId, realizedPnL);

    // 9. Update position in database
    await prisma.perpPosition.update({
      where: { id: positionId },
      data: {
        closedAt: new Date(),
        realizedPnL: realizedPnL,
        currentPrice: position.currentPrice,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
      },
    });

    const newBalance = await WalletService.getBalance(user.userId);

    return successResponse({
      position: {
        id: position.id,
        ticker: position.ticker,
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: position.currentPrice,
        size: position.size,
        leverage: position.leverage,
        realizedPnL,
        fundingPaid: position.fundingPaid,
      },
      settlement,
      marginReturned: marginPaid,
      pnl: realizedPnL,
      newBalance: newBalance.balance,
      newLifetimePnL: newBalance.lifetimePnL,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error closing position:', error);
    return errorResponse('Failed to close position');
  }
}


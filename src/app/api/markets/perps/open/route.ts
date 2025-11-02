/**
 * API Route: /api/markets/perps/open
 * Methods: POST (open a new perpetual futures position)
 */

import { getPerpsEngine } from '@/lib/perps-service';
import {
    authenticate,
    authErrorResponse,
    errorResponse,
    successResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/services/WalletService';
import { prisma } from '@/lib/database-service';
import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * POST /api/markets/perps/open
 * Open a new perpetual futures position
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await authenticate(request);

    // 2. Parse request body
    const body = await request.json();
    const { ticker, side, size, leverage } = body;

    // 3. Validate inputs
    if (!ticker || !side || !size || !leverage) {
      return errorResponse('Missing required fields: ticker, side, size, leverage', 400);
    }

    if (side !== 'long' && side !== 'short') {
      return errorResponse('Invalid side. Must be "long" or "short"', 400);
    }

    if (size <= 0) {
      return errorResponse('Size must be positive', 400);
    }

    if (leverage < 1 || leverage > 100) {
      return errorResponse('Leverage must be between 1 and 100', 400);
    }

    // 4. Get market info
    const perpsEngine = getPerpsEngine();
    const markets = perpsEngine.getMarkets();
    const market = markets.find((m) => m.ticker === ticker);

    if (!market) {
      return errorResponse(`Market ${ticker} not found`, 404);
    }

    // 5. Validate position size
    const maxPositionSize = market.openInterest * 0.1; // Max 10% of open interest
    const minPositionSize = market.minOrderSize;

    if (size < minPositionSize) {
      return errorResponse(`Position size too small. Minimum: $${minPositionSize}`, 400);
    }

    if (size > maxPositionSize && maxPositionSize > 0) {
      return errorResponse(`Position size too large. Maximum: $${maxPositionSize.toFixed(2)}`, 400);
    }

    // 6. Calculate margin required
    const marginRequired = size / leverage;

    // 7. Check balance
    const hasFunds = await WalletService.hasSufficientBalance(user.userId, marginRequired);

    if (!hasFunds) {
      const balance = await WalletService.getBalance(user.userId);
      return errorResponse(
        `Insufficient balance. Need $${marginRequired.toFixed(2)} margin, have $${balance.balance.toFixed(2)}`,
        400
      );
    }

    // 8. Open position via engine first (before debiting)
    const position = perpsEngine.openPosition(user.userId, {
      ticker,
      side,
      size,
      leverage,
      orderType: 'market',
    });

    // 9. Execute debit and database operations in a transaction
    // This ensures atomicity - if anything fails, nothing is committed
    try {
      await prisma.$transaction(async (tx) => {
        // Debit margin from balance
        const dbUser = await tx.user.findUnique({
          where: { id: user.userId },
          select: {
            id: true,
            virtualBalance: true,
          },
        });

        if (!dbUser) {
          throw new Error('User not found');
        }

        if (dbUser.virtualBalance === null) {
          throw new Error('User balance not initialized');
        }

        const currentBalance = Number(dbUser.virtualBalance);
        if (currentBalance < marginRequired) {
          throw new Error(
            `Insufficient balance. Need ${marginRequired}, have ${currentBalance}`
          );
        }

        const newBalance = currentBalance - marginRequired;

        // Update balance
        await tx.user.update({
          where: { id: user.userId },
          data: {
            virtualBalance: newBalance,
          },
        });

        // Create balance transaction with position ID
        await tx.balanceTransaction.create({
          data: {
            userId: user.userId,
            type: 'perp_open',
            amount: -marginRequired,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            relatedId: position.id,
            description: `Opened ${leverage}x ${side} position on ${ticker}`,
          },
        });

        // Save position to database
        await tx.perpPosition.create({
          data: {
            id: position.id,
            userId: user.userId,
            ticker: position.ticker,
            organizationId: position.organizationId,
            side: position.side,
            entryPrice: position.entryPrice,
            currentPrice: position.currentPrice,
            size: position.size,
            leverage: position.leverage,
            liquidationPrice: position.liquidationPrice,
            unrealizedPnL: position.unrealizedPnL,
            unrealizedPnLPercent: position.unrealizedPnLPercent,
            fundingPaid: position.fundingPaid,
          },
        });
      });
    } catch (error) {
      // Rollback the position in the engine if database transaction fails
      perpsEngine.closePosition(position.id);
      throw error;
    }

    return successResponse(
      {
        position: {
          id: position.id,
          ticker: position.ticker,
          side: position.side,
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice,
          size: position.size,
          leverage: position.leverage,
          liquidationPrice: position.liquidationPrice,
          unrealizedPnL: position.unrealizedPnL,
          unrealizedPnLPercent: position.unrealizedPnLPercent,
          fundingPaid: position.fundingPaid,
          openedAt: position.openedAt,
        },
        marginPaid: marginRequired,
        newBalance: (await WalletService.getBalance(user.userId)).balance,
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    if (error instanceof Error && error.message.includes('Insufficient balance')) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof Error && error.message === 'User not found') {
      return errorResponse('User not found', 404);
    }
    logger.error('Error opening position:', error, 'POST /api/markets/perps/open');
    return errorResponse('Failed to open position');
  }
}


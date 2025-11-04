/**
 * API Route: /api/markets/perps/open
 * Methods: POST (open a new perpetual futures position)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { NotFoundError, BusinessLogicError, InsufficientFundsError, InternalServerError } from '@/lib/errors';
import { PerpOpenPositionSchema } from '@/lib/validation/schemas/trade';
import { getPerpsEngine } from '@/lib/perps-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { WalletService } from '@/lib/services/wallet-service';
import { logger } from '@/lib/logger';

/**
 * POST /api/markets/perps/open
 * Open a new perpetual futures position
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  const body = await request.json();
  const { ticker, side, size, leverage } = PerpOpenPositionSchema.parse(body);

  // Get market info
  const perpsEngine = getPerpsEngine();
  const markets = perpsEngine.getMarkets();
  const market = markets.find((m) => m.ticker === ticker);

  if (!market) {
    throw new NotFoundError('Market', ticker);
  }

  // Validate position size
  const maxPositionSize = market.openInterest * 0.1; // Max 10% of open interest
  const minPositionSize = market.minOrderSize;

  if (size < minPositionSize) {
    throw new BusinessLogicError(
      `Position size too small. Minimum: $${minPositionSize}`,
      'POSITION_SIZE_TOO_SMALL',
      { min: minPositionSize, requested: size }
    );
  }

  if (size > maxPositionSize && maxPositionSize > 0) {
    throw new BusinessLogicError(
      `Position size too large. Maximum: $${maxPositionSize.toFixed(2)}`,
      'POSITION_SIZE_TOO_LARGE',
      { max: maxPositionSize, requested: size }
    );
  }

  // Calculate margin required
  const marginRequired = size / leverage;

  // Check balance
  const hasFunds = await WalletService.hasSufficientBalance(user.userId, marginRequired);

  if (!hasFunds) {
    const balance = await WalletService.getBalance(user.userId);
    throw new InsufficientFundsError(marginRequired, Number(balance.balance), 'USD');
  }

  // Open position via engine first (before debiting)
  const position = perpsEngine.openPosition(user.userId, {
    ticker,
    side,
    size,
    leverage,
    orderType: 'market',
  });

  // Execute debit and database operations in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          virtualBalance: true,
        },
      });

      if (!dbUser) {
        throw new NotFoundError('User', user.userId);
      }

      if (dbUser.virtualBalance === null) {
        throw new InternalServerError('User balance not initialized', { userId: user.userId });
      }

      const currentBalance = Number(dbUser.virtualBalance);
      if (currentBalance < marginRequired) {
        throw new InsufficientFundsError(marginRequired, currentBalance, 'USD');
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

  logger.info('Position opened successfully', {
    userId: user.userId,
    positionId: position.id,
    ticker,
    side,
    size,
    leverage,
    marginPaid: marginRequired
  }, 'POST /api/markets/perps/open');

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
});

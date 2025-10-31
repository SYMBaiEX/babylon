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
import { PrismaClient } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

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

    // 5. Calculate margin required
    const marginRequired = size / leverage;

    // 6. Check balance
    const hasFunds = await WalletService.hasSufficientBalance(user.userId, marginRequired);

    if (!hasFunds) {
      const balance = await WalletService.getBalance(user.userId);
      return errorResponse(
        `Insufficient balance. Need $${marginRequired.toFixed(2)} margin, have $${balance.balance.toFixed(2)}`,
        400
      );
    }

    // 7. Debit margin from balance
    await WalletService.debit(
      user.userId,
      marginRequired,
      'perp_open',
      `Opened ${leverage}x ${side} position on ${ticker}`,
      undefined // Will set after position created
    );

    // 8. Open position via engine
    const position = perpsEngine.openPosition(user.userId, {
      ticker,
      side,
      size,
      leverage,
      orderType: 'market',
    });

    // 9. Save position to database
    await prisma.perpPosition.create({
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

    // 10. Update transaction with position ID
    await prisma.balanceTransaction.updateMany({
      where: {
        userId: user.userId,
        type: 'perp_open',
        relatedId: null,
      },
      data: {
        relatedId: position.id,
      },
    });

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
    logger.error('Error opening position:', error, 'POST /api/markets/perps/open');
    return errorResponse('Failed to open position');
  }
}


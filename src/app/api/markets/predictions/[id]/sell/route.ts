/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * API Route: /api/markets/predictions/[id]/sell
 * Methods: POST (sell YES or NO shares in prediction market)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/lib/services/wallet-service';
import { PredictionPricing } from '@/lib/prediction-pricing';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * POST /api/markets/predictions/[id]/sell
 * Sell shares from prediction market position
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await authenticate(request);
    const { id: marketId } = await params;

    if (!marketId) {
      return errorResponse('Market ID is required', 400);
    }

    // 2. Parse request body
    const body = await request.json();
    const { shares } = body; // Number of shares to sell

    // 3. Validate inputs
    if (!shares || shares <= 0) {
      return errorResponse('Invalid shares amount', 400);
    }

    // 4. Get or find market
    // First try to find Market by ID
    let market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    // If market doesn't exist, try to find Question and create Market
    // API now returns question.id, but also support questionNumber for backwards compatibility
    if (!market) {
      // Try to find by ID first (most common case after API update)
      let question = await (prisma as any).question.findUnique({
        where: { id: marketId },
      });
      
      // If not found by ID and marketId looks like a number, try questionNumber
      if (!question && !isNaN(Number(marketId))) {
        const questions = await (prisma as any).question.findMany({
          where: { questionNumber: parseInt(marketId, 10) },
          orderBy: { createdDate: 'desc' },
          take: 1,
        });
        question = questions[0] || null;
      }

      if (!question) {
        return errorResponse('Market or question not found', 404);
      }

      // Check if question is active (can't sell from resolved market anyway, but good to check)
      if (question.status !== 'active') {
        return errorResponse(`Question is ${question.status}, cannot trade`, 400);
      }

      // Create or get existing market from question
      // Use upsert to avoid unique constraint errors from race conditions
      const endDate = new Date(question.resolutionDate);
      const initialLiquidity = 1000; // Default liquidity
      
      market = await prisma.market.upsert({
        where: { id: question.id },
        create: {
          id: question.id, // Use question.id (string UUID), not questionNumber
          question: question.text,
          description: null,
          gameId: 'continuous',
          dayNumber: null,
          yesShares: new Prisma.Decimal(initialLiquidity / 2),
          noShares: new Prisma.Decimal(initialLiquidity / 2),
          liquidity: new Prisma.Decimal(initialLiquidity),
          resolved: false,
          resolution: null,
          endDate: endDate,
        },
        update: {
          // If market exists, just return it without updating
        },
      });
    }

    // 5. Check if market is still active
    if (market.resolved) {
      return errorResponse('Cannot sell from resolved market', 400);
    }

    // 6. Get user's position
    const position = await prisma.position.findFirst({
      where: {
        userId: user.userId,
        marketId,
      },
    });

    if (!position) {
      return errorResponse('No position found in this market', 404);
    }

    // 7. Validate sufficient shares
    if (Number(position.shares) < shares) {
      return errorResponse(
        `Insufficient shares. Have ${Number(position.shares)}, trying to sell ${shares}`,
        400
      );
    }

    const side = position.side ? 'yes' : 'no';

    // 8. Calculate proceeds using AMM
    const calculation = PredictionPricing.calculateSell(
      Number(market.yesShares),
      Number(market.noShares),
      side,
      shares
    );

    const proceeds = calculation.totalCost;

    // 9. Credit proceeds to balance
    await WalletService.credit(
      user.userId,
      proceeds,
      'pred_sell',
      `Sold ${shares} ${side.toUpperCase()} shares in: ${market.question}`,
      marketId
    );

    // 10. Update market shares
    await prisma.market.update({
      where: { id: marketId },
      data: {
        yesShares: new Prisma.Decimal(calculation.newYesPrice * (Number(market.yesShares) + Number(market.noShares))),
        noShares: new Prisma.Decimal(calculation.newNoPrice * (Number(market.yesShares) + Number(market.noShares))),
        liquidity: {
          decrement: new Prisma.Decimal(proceeds),
        },
      },
    });

    // 11. Update or close position
    const remainingShares = Number(position.shares) - shares;

    if (remainingShares <= 0.01) {
      // Close position completely
      await prisma.position.delete({
        where: { id: position.id },
      });
    } else {
      // Reduce shares
      await prisma.position.update({
        where: { id: position.id },
        data: {
          shares: new Prisma.Decimal(remainingShares),
        },
      });
    }

    // 12. Calculate PnL
    const costBasis = Number(position.avgPrice) * shares;
    const pnl = proceeds - costBasis;
    await WalletService.recordPnL(user.userId, pnl);

    const newBalance = await WalletService.getBalance(user.userId);

    return successResponse({
      sharesSold: shares,
      proceeds,
      pnl,
      market: {
        yesPrice: calculation.newYesPrice,
        noPrice: calculation.newNoPrice,
        priceImpact: calculation.priceImpact,
      },
      remainingShares,
      positionClosed: remainingShares <= 0.01,
      newBalance: newBalance.balance,
      newLifetimePnL: newBalance.lifetimePnL,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    logger.error('Error selling shares:', error, 'POST /api/markets/predictions/[id]/sell');
    return errorResponse('Failed to sell shares');
  }
}


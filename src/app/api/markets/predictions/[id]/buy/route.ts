/**
 * API Route: /api/markets/predictions/[id]/buy
 * Methods: POST (buy YES or NO shares in prediction market)
 */

import { NextRequest } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/services/WalletService';
import { PredictionPricing } from '@/lib/prediction-pricing';

const prisma = new PrismaClient();

/**
 * POST /api/markets/predictions/[id]/buy
 * Buy YES or NO shares in a prediction market
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
    const { side, amount } = body; // side: 'yes' | 'no', amount: USD

    // 3. Validate inputs
    if (!side || !amount) {
      return errorResponse('Missing required fields: side, amount', 400);
    }

    if (side !== 'yes' && side !== 'no') {
      return errorResponse('Invalid side. Must be "yes" or "no"', 400);
    }

    if (amount <= 0) {
      return errorResponse('Amount must be positive', 400);
    }

    if (amount < 1) {
      return errorResponse('Minimum order size is $1', 400);
    }

    // 4. Get market
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      return errorResponse('Market not found', 404);
    }

    // 5. Check if market is still active
    if (market.resolved) {
      return errorResponse('Market has already resolved', 400);
    }

    if (new Date() > market.endDate) {
      return errorResponse('Market has expired', 400);
    }

    // 6. Check balance
    const hasFunds = await WalletService.hasSufficientBalance(user.userId, amount);

    if (!hasFunds) {
      const balance = await WalletService.getBalance(user.userId);
      return errorResponse(
        `Insufficient balance. Need $${amount.toFixed(2)}, have $${balance.balance.toFixed(2)}`,
        400
      );
    }

    // 7. Calculate shares using AMM
    const calculation = PredictionPricing.calculateBuy(
      Number(market.yesShares),
      Number(market.noShares),
      side,
      amount
    );

    // 8. Debit cost from balance
    await WalletService.debit(
      user.userId,
      amount,
      'pred_buy',
      `Bought ${side.toUpperCase()} shares in: ${market.question}`,
      marketId
    );

    // 9. Update market shares
    await prisma.market.update({
      where: { id: marketId },
      data: {
        yesShares: new Prisma.Decimal(calculation.newYesPrice * (Number(market.yesShares) + Number(market.noShares))),
        noShares: new Prisma.Decimal(calculation.newNoPrice * (Number(market.yesShares) + Number(market.noShares))),
        liquidity: {
          increment: new Prisma.Decimal(amount),
        },
      },
    });

    // 10. Create or update position
    const existingPosition = await prisma.position.findFirst({
      where: {
        userId: user.userId,
        marketId,
      },
    });

    let position;
    if (existingPosition) {
      // Update existing position (average in new shares)
      const newTotalShares = Number(existingPosition.shares) + calculation.sharesBought;
      const newAvgPrice =
        (Number(existingPosition.avgPrice) * Number(existingPosition.shares) +
          calculation.avgPrice * calculation.sharesBought) /
        newTotalShares;

      position = await prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          shares: new Prisma.Decimal(newTotalShares),
          avgPrice: new Prisma.Decimal(newAvgPrice),
        },
      });
    } else {
      // Create new position
      position = await prisma.position.create({
        data: {
          userId: user.userId,
          marketId,
          side: side === 'yes',
          shares: new Prisma.Decimal(calculation.sharesBought),
          avgPrice: new Prisma.Decimal(calculation.avgPrice),
        },
      });
    }

    // 11. Log agent activity (if agent)
    if (user.isAgent) {
      console.log(`🤖 Agent ${user.userId} placed trade: ${side.toUpperCase()} $${amount} on market ${marketId}`)
      // Could also store in agent_activity table if we create one
    }

    const newBalance = await WalletService.getBalance(user.userId);

    return successResponse(
      {
        position: {
          id: position.id,
          marketId: position.marketId,
          side: side,
          shares: Number(position.shares),
          avgPrice: Number(position.avgPrice),
          totalCost: amount,
        },
        market: {
          yesPrice: calculation.newYesPrice,
          noPrice: calculation.newNoPrice,
          priceImpact: calculation.priceImpact,
        },
        newBalance: newBalance.balance,
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
    console.error('Error buying shares:', error);
    return errorResponse('Failed to buy shares');
  }
}


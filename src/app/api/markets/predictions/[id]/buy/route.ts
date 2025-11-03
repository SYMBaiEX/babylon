/**
 * API Route: /api/markets/predictions/[id]/buy
 * Methods: POST (buy YES or NO shares in prediction market)
 */

import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/lib/services/wallet-service';
import { PredictionPricing } from '@/lib/prediction-pricing';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';


/**
 * POST /api/markets/predictions/[id]/buy
 * Buy YES or NO shares in a prediction market
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: marketId } = await params;
  
  let user;
  try {
    user = await authenticate(request);
  } catch (authError) {
    const authErrorMessage = authError instanceof Error ? authError.message : 'Authentication failed';
    logger.error('Authentication error in buy prediction:', { message: authErrorMessage, marketId }, 'POST /api/markets/predictions/[id]/buy');
    return authErrorResponse('Unauthorized');
  }

  try {

    if (!marketId) {
      logger.error('Missing market ID in request', { params: await params }, 'POST /api/markets/predictions/[id]/buy');
      return errorResponse('Market ID is required', 400);
    }

    logger.info('Buy request START', { 
      marketId, 
      userId: user.userId,
      marketIdType: typeof marketId,
      isNumber: !isNaN(Number(marketId))
    }, 'POST /api/markets/predictions/[id]/buy');

    // 2. Parse request body
    const body = await request.json();
    const { side, amount } = body; // side: 'yes' | 'no', amount: USD
    
    logger.info('Buy request params', { 
      marketId, 
      side, 
      amount,
      userId: user.userId 
    }, 'POST /api/markets/predictions/[id]/buy');

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

    // 4. Get or create market from question
    logger.info('Step 4: Looking up market/question', { marketId }, 'POST /api/markets/predictions/[id]/buy');
    
    // First try to find Market by ID
    let market = await prisma.market.findUnique({
      where: { id: marketId },
    });
    logger.info('Step 4a: Market lookup result', { found: !!market }, 'POST /api/markets/predictions/[id]/buy');

    // If market doesn't exist, try to find Question and create Market
    // API now returns question.id, but also support questionNumber for backwards compatibility
    if (!market) {
      logger.info('Step 4b: Market not found, looking for question', { marketId }, 'POST /api/markets/predictions/[id]/buy');
      
      // Try to find by ID first (most common case after API update)
      // Note: Question model may not be in Prisma Client types, but exists in schema
      const questionModel = prisma as typeof prisma & {
        question: {
          findUnique: (args: { where: { id: string } }) => Promise<{
            id: string
            questionNumber: number
            text: string
            status: string
            resolutionDate: Date
          } | null>
          findMany: (args: { where: { questionNumber: number }; orderBy: { createdDate: 'desc' }; take: number }) => Promise<Array<{
            id: string
            questionNumber: number
            text: string
            status: string
            resolutionDate: Date
          }>>
        }
      }
      
      let question = await questionModel.question.findUnique({
        where: { id: marketId },
      });
      logger.info('Step 4c: Question by ID lookup', { found: !!question }, 'POST /api/markets/predictions/[id]/buy');
      
      // If not found by ID and marketId looks like a number, try questionNumber
      if (!question && !isNaN(Number(marketId))) {
        logger.info('Step 4d: Trying question by number', { questionNumber: parseInt(marketId, 10) }, 'POST /api/markets/predictions/[id]/buy');
        const questions = await questionModel.question.findMany({
          where: { questionNumber: parseInt(marketId, 10) },
          orderBy: { createdDate: 'desc' },
          take: 1,
        });
        question = questions[0] || null;
        logger.info('Step 4e: Question by number result', { found: !!question, questionId: question?.id }, 'POST /api/markets/predictions/[id]/buy');
      }

      if (!question) {
        logger.error('Neither market nor question found', { marketId }, 'POST /api/markets/predictions/[id]/buy');
        return errorResponse('Market or question not found', 404);
      }

      // Check if question is active
      if (question.status !== 'active') {
        return errorResponse(`Question is ${question.status}, cannot trade`, 400);
      }

      // Check if question has expired
      if (new Date(question.resolutionDate) < new Date()) {
        return errorResponse('Question has expired', 400);
      }

      logger.info('Step 4f: Creating market from question', { 
        questionId: question.id,
        questionNumber: question.questionNumber 
      }, 'POST /api/markets/predictions/[id]/buy');
      
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

      logger.info(`Auto-created market from question`, { 
        marketId: market.id,
        questionId: question.id, 
        questionNumber: question.questionNumber 
      }, 'POST /api/markets/predictions/[id]/buy');
    }
    
    logger.info('Step 5: Market ready', { marketId: market.id }, 'POST /api/markets/predictions/[id]/buy');

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
      logger.info(`Agent ${user.userId} placed trade: ${side.toUpperCase()} $${amount} on market ${marketId}`, undefined, 'POST /api/markets/predictions/[id]/buy')
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
    if (error instanceof Error && error.message.includes('Insufficient balance')) {
      return errorResponse(error.message, 400);
    }
    
    // Better error logging - extract error details properly
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = {
      message: errorMessage,
      stack: errorStack,
      marketId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : error,
    };
    logger.error('Error buying shares:', errorDetails, 'POST /api/markets/predictions/[id]/buy');
    
    // Return more detailed error for debugging
    return errorResponse(
      `Failed to buy shares: ${errorMessage}`,
      500
    );
  }
}


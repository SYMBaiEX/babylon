/**
 * API Route: /api/markets/perps/[positionId]/close
 * Methods: POST (close a perpetual futures position)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { NotFoundError, BusinessLogicError, AuthorizationError } from '@/lib/errors';
import { PositionIdParamSchema, ClosePerpPositionSchema } from '@/lib/validation/schemas';
import { getPerpsEngine } from '@/lib/perps-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { WalletService } from '@/lib/services/wallet-service';
import { logger } from '@/lib/logger';

/**
 * POST /api/markets/perps/[positionId]/close
 * Close an existing perpetual futures position
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ positionId: string }> }
) => {
  const user = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { positionId } = PositionIdParamSchema.parse(params);
  
  // Parse and validate request body (optional for partial close)
  const body = await request.json().catch(() => ({}));
  if (Object.keys(body).length > 0) {
    ClosePerpPositionSchema.parse(body);
  }

  // Get position from database
  const dbPosition = await prisma.perpPosition.findUnique({
    where: { id: positionId },
  });

  if (!dbPosition) {
    throw new NotFoundError('Position', positionId);
  }

  // Verify ownership
  if (dbPosition.userId !== user.userId) {
    throw new AuthorizationError('Not your position', 'position', 'close');
  }

  // Check if already closed
  if (dbPosition.closedAt) {
    throw new BusinessLogicError('Position already closed', 'POSITION_CLOSED', { positionId, closedAt: dbPosition.closedAt });
  }

  // Close position via engine
  const perpsEngine = getPerpsEngine();
  const { position, realizedPnL } = perpsEngine.closePosition(positionId);

  // Calculate final settlement
  const marginPaid = position.size / position.leverage;
  const settlement = marginPaid + realizedPnL; // Margin + PnL

  // If loss exceeds margin (liquidation scenario), settlement is 0
  const finalSettlement = Math.max(0, settlement);

  // Credit settlement to balance
  if (finalSettlement > 0) {
    await WalletService.credit(
      user.userId,
      finalSettlement,
      'perp_close',
      `Closed ${position.leverage}x ${position.side} ${position.ticker} - PnL: ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`,
      position.id
    );
  } else {
    // Margin was completely lost (liquidation)
    logger.info('Position closed with total loss', {
      positionId,
      marginPaid,
      realizedPnL,
      userId: user.userId
    }, 'POST /api/markets/perps/[positionId]/close');
  }

  // Record PnL
  await WalletService.recordPnL(user.userId, realizedPnL);

  // Update position in database
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

  logger.info('Position closed successfully', {
    userId: user.userId,
    positionId,
    realizedPnL,
    finalSettlement,
    wasLiquidated: finalSettlement === 0
  }, 'POST /api/markets/perps/[positionId]/close');

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
    settlement: finalSettlement,
    marginReturned: marginPaid,
    pnl: realizedPnL,
    wasLiquidated: finalSettlement === 0,
    newBalance: newBalance.balance,
    newLifetimePnL: newBalance.lifetimePnL,
  });
});

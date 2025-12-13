import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { FEE_CONFIG, FeeService, WalletService } from '@babylon/engine';
import { PerpOpenPositionSchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { trackServerEvent } from '@/lib/posthog/server';

/**
 * POST /api/markets/perps/open
 * Thin handler: validate → PerpMarketService.openPosition → response
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  const body = await request.json();
  const { ticker, side, size, leverage } = PerpOpenPositionSchema.parse(body);

  const normalizedSide = side.toLowerCase() as 'long' | 'short';
  const numericSize = typeof size === 'string' ? Number(size) : size;

  const service = new PerpMarketService({
    db: new PerpDbAdapter(),
    wallet: {
      debit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.debit(
          userId,
          amount,
          reason,
          description ?? '',
          relatedId
        ),
      credit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.credit(
          userId,
          amount,
          reason,
          description ?? '',
          relatedId
        ),
      recordPnL: async ({ userId, pnl, reason, relatedId }) => {
        await WalletService.recordPnL(userId, pnl, reason, relatedId);
      },
      getBalance: (userId: string) => WalletService.getBalance(userId),
    },
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
    },
    feeProcessor: {
      processTradingFee: ({ userId, amount, type, relatedId, positionId }) =>
        FeeService.processTradingFee(
          userId,
          type as (typeof FEE_CONFIG.FEE_TYPES)[keyof typeof FEE_CONFIG.FEE_TYPES],
          amount,
          positionId,
          relatedId
        ),
    },
  });

  const result = await service.openPosition({
    userId: user.userId,
    ticker,
    side: normalizedSide,
    size: numericSize,
    leverage,
  });

  trackServerEvent(user.userId, 'trade_opened', {
    type: 'perp',
    ticker,
    side: normalizedSide,
    size: numericSize,
    leverage,
    entryPrice: result.entryPrice ?? 0,
    marginPaid: result.marginPaid ?? 0,
    feeCharged: result.feePaid,
    positionId: result.positionId,
  }).catch((error) => {
    console.warn('Failed to track trade_opened event', { error });
  });

  return successResponse(
    {
      position: result,
      marginPaid: result.marginPaid,
      fee: {
        amount: result.feePaid,
        referrerPaid: 0,
      },
      newBalance: result.balance,
    },
    201
  );
});

import type { NextRequest } from 'next/server';

import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { trackServerEvent } from '@/lib/posthog/server';
import { FEE_CONFIG } from '@babylon/engine';
import { PerpOpenPositionSchema } from '@babylon/shared';
import { PerpMarketService, PerpDbAdapter } from '@babylon/core/markets/perps';
import { WalletPortAdapter } from '@babylon/core/markets/shared';

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
    wallet: WalletPortAdapter,
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
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
    entryPrice: result.entryPrice,
    marginPaid: result.marginPaid,
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

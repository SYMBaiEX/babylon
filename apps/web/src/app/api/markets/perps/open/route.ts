import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { PerpOpenPositionSchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { trackServerEvent } from '@/lib/posthog/server';
import {
  applyUserTradePriceImpact,
  createPerpMarketService,
} from '../_adapters';

/**
 * POST /api/markets/perps/open
 * Open a new perpetual futures position.
 *
 * Uses PerpMarketService with SSE broadcast enabled for real-time UI updates.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  const body = await request.json();
  const { ticker, side, size, leverage } = PerpOpenPositionSchema.parse(body);

  const normalizedSide = side.toLowerCase() as 'long' | 'short';
  const numericSize = typeof size === 'string' ? Number(size) : size;

  // Create service with fee processor and broadcast for real-time updates
  const service = createPerpMarketService({
    withFeeProcessor: true,
    withBroadcast: true,
  });

  const result = await service.openPosition({
    userId: user.userId,
    ticker,
    side: normalizedSide,
    size: numericSize,
    leverage,
  });

  // Apply price impact from the trade
  // Wait for it to complete to ensure price is updated before response
  try {
    await applyUserTradePriceImpact(ticker);
  } catch (error) {
    // Log but don't fail the trade - price impact is enhancement
    console.error('[PerpOpen] Price impact failed:', error);
  }

  // Track analytics event (fire and forget)
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

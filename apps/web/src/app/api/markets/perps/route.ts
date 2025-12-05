import type { NextRequest } from 'next/server';
import { successResponse, withErrorHandling } from '@babylon/api';
import { PerpMarketService, PerpDbAdapter } from '@babylon/core/markets/perps';
import { FEE_CONFIG } from '@babylon/engine';
import { logger } from '@babylon/shared';
import { WalletPortAdapter } from '@babylon/core/markets/shared';

/**
 * GET /api/markets/perps
 * Returns perpetual markets snapshot (single source from PerpMarketService)
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const dbAdapter = new PerpDbAdapter();
  const service = new PerpMarketService({
    db: dbAdapter,
    wallet: WalletPortAdapter,
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
    },
  });

  const markets = await service.getMarketsSnapshot();

  logger.info(
    'Perpetual markets fetched successfully (core service)',
    { count: markets.length },
    'GET /api/markets/perps'
  );

  return successResponse({
    success: true,
    markets,
    count: markets.length,
  });
});

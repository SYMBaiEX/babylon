/**
 * Perpetual Futures Markets API
 *
 * @route GET /api/markets/perps
 * @access Public (optional authentication for user positions)
 *
 * Returns all available perpetual futures markets with real-time pricing,
 * 24-hour statistics, open interest, funding rates, and user positions.
 */

import { successResponse, withErrorHandling } from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { createWalletAdapter, perpFeeConfig } from './_adapters';

/**
 * GET /api/markets/perps
 * Returns perpetual markets snapshot (single source from PerpMarketService)
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const service = new PerpMarketService({
    db: new PerpDbAdapter(),
    wallet: createWalletAdapter(),
    fees: perpFeeConfig,
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

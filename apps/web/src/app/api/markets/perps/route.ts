import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { createPerpMarketService } from './_adapters';

/**
 * GET /api/markets/perps
 * Returns perpetual markets snapshot (single source from PerpMarketService)
 */
export const GET = withErrorHandling(async (_request: NextRequest) => {
  const service = createPerpMarketService();
  const markets = await service.getMarketsSnapshot();

  logger.info(
    'Perpetual markets fetched successfully',
    { count: markets.length },
    'GET /api/markets/perps'
  );

  return successResponse({
    success: true,
    markets,
    count: markets.length,
  });
});

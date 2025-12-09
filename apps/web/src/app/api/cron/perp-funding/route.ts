import {
  AuthorizationError,
  relayCronToStaging,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
import { db, isNotNull, organizations } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import {
  createWalletAdapter,
  perpFeeConfig,
} from '../../markets/perps/_adapters';

export const maxDuration = 300;

function verifyCron(request: NextRequest): void {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === 'development') {
    if (!cronSecret) return;
    if (
      authHeader === 'Bearer development' ||
      authHeader === `Bearer ${cronSecret}`
    ) {
      return;
    }
  }

  if (!cronSecret) return;

  if (authHeader !== `Bearer ${cronSecret}`) {
    throw new AuthorizationError('Invalid cron secret', 'cron', 'execute');
  }
}

/**
 * Fetch latest prices from organizations table to ensure liquidations use current data.
 */
async function fetchLatestPrices(): Promise<Map<string, number>> {
  const orgs = await db
    .select({ id: organizations.id, currentPrice: organizations.currentPrice })
    .from(organizations)
    .where(isNotNull(organizations.currentPrice));

  const priceMap = new Map<string, number>();
  for (const org of orgs) {
    if (org.currentPrice !== null && org.currentPrice > 0) {
      priceMap.set(org.id, org.currentPrice);
    }
  }
  return priceMap;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  verifyCron(request);

  // Relay to staging if configured (Vercel cron runs only on production)
  // but still execute locally (fan-out).
  const relay = await relayCronToStaging(request, 'perp-funding');
  if (relay.forwarded) {
    logger.info(
      'Perp funding cron relayed to staging (fan-out: also executing locally)',
      { status: relay.status, error: relay.error },
      'Cron:perp-funding'
    );
  }

  // Fetch latest prices from organizations table
  const latestPrices = await fetchLatestPrices();

  const service = new PerpMarketService({
    db: new PerpDbAdapter(),
    wallet: createWalletAdapter(),
    fees: perpFeeConfig,
  });

  // Process with latest prices to ensure accurate liquidations
  const summary = await service.processFundingAndLiquidations(latestPrices);

  logger.info(
    'Perp funding step executed via cron',
    {
      pricesUpdated: latestPrices.size,
      marketsUpdated: summary?.marketsUpdated,
      positionsUpdated: summary?.positionsUpdated,
      liquidations: summary?.liquidations,
      errors: summary?.errors?.length,
    },
    'Cron:perp-funding'
  );

  return successResponse({
    success: true,
    pricesUpdated: latestPrices.size,
    marketsUpdated: summary?.marketsUpdated ?? 0,
    positionsUpdated: summary?.positionsUpdated ?? 0,
    liquidations: summary?.liquidations ?? 0,
  });
});

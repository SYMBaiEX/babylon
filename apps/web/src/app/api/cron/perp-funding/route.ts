import {
  AuthorizationError,
  relayCronToStaging,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { PerpDbAdapter, PerpMarketService } from '@babylon/core/markets/perps';
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

  const service = new PerpMarketService({
    db: new PerpDbAdapter(),
    wallet: createWalletAdapter(),
    fees: perpFeeConfig,
  });

  await service.processFundingAndLiquidations();

  logger.info(
    'Perp funding step executed via cron',
    undefined,
    'Cron:perp-funding'
  );

  return successResponse({ success: true });
});

import type { NextRequest } from 'next/server';

import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { drainOutboxBatch } from '@babylon/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_request: NextRequest) => {
  const result = await drainOutboxBatch();
  logger.info('Realtime outbox drain completed', result, 'Realtime');
  return successResponse({
    success: true,
    ...result,
    timestamp: Date.now(),
  });
});

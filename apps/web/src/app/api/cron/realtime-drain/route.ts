import type { NextRequest } from 'next/server';

import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { drainOutboxBatch } from '@/lib/realtime/outbox';

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

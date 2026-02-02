/**
 * Daily Login Rewards API
 *
 * GET  - Returns current streak info
 * POST - Claims daily reward (idempotent)
 */

import {
  authenticate,
  DailyLoginService,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { userId } = await authenticate(request);
  const info = await DailyLoginService.getStreakInfo(userId);

  return successResponse({
    ...info,
    lastClaim: info.lastClaim?.toISOString() ?? null,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { userId } = await authenticate(request);
  const result = await DailyLoginService.claimDailyReward(userId);
  return successResponse(result);
});

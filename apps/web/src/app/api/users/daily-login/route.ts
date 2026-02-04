/**
 * Daily Login Rewards API
 *
 * GET  - Returns current streak info
 * POST - Claims daily reward (idempotent)
 */

import {
  authenticateWithDbUser,
  DailyLoginService,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { dbUserId } = await authenticateWithDbUser(request);
  const info = await DailyLoginService.getStreakInfo(dbUserId);
  return successResponse({
    ...info,
    lastClaim: info.lastClaim?.toISOString() ?? null,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { dbUserId } = await authenticateWithDbUser(request);
  const result = await DailyLoginService.claimDailyReward(dbUserId);
  return successResponse(result);
});

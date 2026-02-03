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
  UserNotFoundError,
  withErrorHandling,
} from '@babylon/api';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { userId } = await authenticate(request);

  try {
    const info = await DailyLoginService.getStreakInfo(userId);
    return successResponse({
      ...info,
      lastClaim: info.lastClaim?.toISOString() ?? null,
    });
  } catch (error) {
    // If service throws UserNotFoundError, return 404
    if (error instanceof UserNotFoundError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Re-throw to be handled by withErrorHandling
    throw error;
  }
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { userId } = await authenticate(request);
  const result = await DailyLoginService.claimDailyReward(userId);
  return successResponse(result);
});

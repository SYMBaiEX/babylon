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

  try {
    const info = await DailyLoginService.getStreakInfo(userId);
    return successResponse({
      ...info,
      lastClaim: info.lastClaim?.toISOString() ?? null,
    });
  } catch (error) {
    // If service throws (e.g., user not found), return 404
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not found')) {
      return new Response(JSON.stringify({ error: errorMessage }), {
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

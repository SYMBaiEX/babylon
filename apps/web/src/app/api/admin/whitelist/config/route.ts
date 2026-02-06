/**
 * Admin Whitelist Config API
 *
 * @route GET /api/admin/whitelist/config - Get current whitelist configuration
 * @route PUT /api/admin/whitelist/config - Update whitelist configuration
 * @access Admin
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import {
  getWhitelistConfig,
  updateWhitelistConfig,
} from '@babylon/api/services/whitelist-service';
import { type NextRequest, NextResponse } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const config = await getWhitelistConfig();

  return successResponse({
    config: config ?? {
      leaderboardRankThreshold: null,
      leaderboardCategory: 'all',
      updatedAt: null,
      updatedBy: null,
    },
  });
});

export const PUT = withErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin(request);

  const body = await request.json();
  const { leaderboardRankThreshold, leaderboardCategory } = body as {
    leaderboardRankThreshold: number | null;
    leaderboardCategory?: string;
  };

  if (
    leaderboardRankThreshold !== null &&
    (typeof leaderboardRankThreshold !== 'number' ||
      leaderboardRankThreshold < 0 ||
      !Number.isInteger(leaderboardRankThreshold))
  ) {
    return NextResponse.json(
      {
        error:
          'leaderboardRankThreshold must be a non-negative integer or null',
      },
      { status: 400 }
    );
  }

  await updateWhitelistConfig({
    leaderboardRankThreshold,
    leaderboardCategory,
    updatedBy: admin.dbUserId ?? undefined,
  });

  const config = await getWhitelistConfig();

  return successResponse({ success: true, config });
});

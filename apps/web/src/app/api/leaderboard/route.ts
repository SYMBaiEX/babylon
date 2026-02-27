/**
 * Leaderboard API
 *
 * Two leaderboard modes:
 * - **wallet**: Per-wallet ranking (users AND agents as individuals)
 * - **team**: User + their agents combined
 *
 * Supports optional `userId` param to return the requesting user's
 * rank/position alongside the page data. Leaderboard pages are cached
 * in Redis (shared); user positions are always computed fresh.
 *
 * @openapi
 * /api/leaderboard:
 *   get:
 *     tags:
 *       - Leaderboard
 *     summary: Get leaderboard (wallet or team)
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [wallet, team]
 *           default: wallet
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 100
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID to include their rank in the response
 */

import {
  getCache,
  PointsService,
  setCache,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { LeaderboardQuerySchema, logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

const CACHE_KEY_NAMESPACE = 'leaderboard';
const CACHE_TTL_MS = Number(process.env.LEADERBOARD_CACHE_MS) || 120_000;
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const STALE_SECONDS = CACHE_TTL_SECONDS * 3;

interface CachedLeaderboardData {
  users: Awaited<
    ReturnType<typeof PointsService.getWalletLeaderboard>
  >['users'];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  leaderboardType: 'wallet' | 'team';
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const queryParams = Object.fromEntries(searchParams.entries());
  const validationResult = LeaderboardQuerySchema.safeParse(queryParams);

  if (!validationResult.success) {
    throw validationResult.error;
  }

  const { page, pageSize, type, userId } = validationResult.data;
  const leaderboardType = type ?? 'wallet';

  const cacheKey = `${leaderboardType}-${page}-${pageSize}`;

  let leaderboardData: CachedLeaderboardData | null = null;
  let cacheHit = false;

  if (CACHE_TTL_MS > 0) {
    leaderboardData = await getCache<CachedLeaderboardData>(cacheKey, {
      namespace: CACHE_KEY_NAMESPACE,
    });
    if (leaderboardData) {
      cacheHit = true;
    }
  }

  if (!leaderboardData) {
    leaderboardData =
      leaderboardType === 'team'
        ? await PointsService.getTeamLeaderboard(page, pageSize)
        : await PointsService.getWalletLeaderboard(page, pageSize);

    if (CACHE_TTL_MS > 0) {
      await setCache(cacheKey, leaderboardData, {
        namespace: CACHE_KEY_NAMESPACE,
        ttl: CACHE_TTL_SECONDS,
      });
    }
  }

  let currentUser: Awaited<ReturnType<typeof PointsService.getUserPosition>> =
    null;
  if (userId) {
    currentUser = await PointsService.getUserPosition(
      userId,
      leaderboardType,
      pageSize
    );
  }

  logger.info(
    'Leaderboard fetched successfully',
    {
      page,
      pageSize,
      leaderboardType,
      totalCount: leaderboardData.totalCount,
      cacheHit,
      hasUserId: !!userId,
    },
    'GET /api/leaderboard'
  );

  return successResponse(
    {
      leaderboard: leaderboardData.users,
      pagination: {
        page: leaderboardData.page,
        pageSize: leaderboardData.pageSize,
        totalCount: leaderboardData.totalCount,
        totalPages: leaderboardData.totalPages,
      },
      leaderboardType,
      currentUser,
    },
    200,
    {
      'x-cache': cacheHit ? 'leaderboard-hit' : 'leaderboard-miss',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      Vary: 'Accept-Encoding',
    }
  );
});

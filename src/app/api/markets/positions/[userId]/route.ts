/**
 * API Route: /api/markets/positions/[userId]
 * Methods: GET (get user's positions in both perps and prediction markets)
 */

import type { NextRequest } from 'next/server';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { UserIdParamSchema, UserPositionsQuerySchema } from '@/lib/validation/schemas';
import { optionalAuth } from '@/lib/api/auth-middleware';
import { asUser, asPublic } from '@/lib/db/context';
import { getPerpsEngine } from '@/lib/perps-service';
import { logger } from '@/lib/logger';
/**
 * GET /api/markets/positions/[userId]
 * Get user's positions in perpetuals and prediction markets
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);
  
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    userId,
    type: searchParams.get('type') || 'all',
    status: searchParams.get('status') || 'open',
    page: searchParams.get('page'),
    limit: searchParams.get('limit')
  };
  UserPositionsQuerySchema.parse(queryParams);

  // Optional auth - positions are public for leaderboard but RLS still applies
  const authUser = await optionalAuth(request).catch(() => null);

  // Get perpetual positions (from engine - no RLS needed)
  const perpsEngine = getPerpsEngine();
  const perpPositions = perpsEngine.getUserPositions(userId);

  // Get prediction market positions with RLS
  const predictionPositions = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
        return await db.position.findMany({
          where: {
            userId,
          },
          include: {
            market: {
              select: {
                id: true,
                question: true,
                endDate: true,
                resolved: true,
                resolution: true,
                yesShares: true,
                noShares: true,
              },
            },
          },
        });
      })
    : await asPublic(async (db) => {
        return await db.position.findMany({
          where: {
            userId,
          },
          include: {
            market: {
              select: {
                id: true,
                question: true,
                endDate: true,
                resolved: true,
                resolution: true,
                yesShares: true,
                noShares: true,
              },
            },
          },
        });
      });

  // Calculate stats
  const perpStats = {
    totalPositions: perpPositions.length,
    totalPnL: perpPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
    totalFunding: perpPositions.reduce((sum, p) => sum + p.fundingPaid, 0),
  };

  logger.info('User positions fetched successfully', {
    userId,
    perpPositions: perpStats.totalPositions,
    predictionPositions: predictionPositions.length
  }, 'GET /api/markets/positions/[userId]');

  return successResponse({
    perpetuals: {
      positions: perpPositions.map((p) => ({
        id: p.id,
        ticker: p.ticker,
        side: p.side,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        size: p.size,
        leverage: p.leverage,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPercent: p.unrealizedPnLPercent,
        liquidationPrice: p.liquidationPrice,
        fundingPaid: p.fundingPaid,
        openedAt: p.openedAt,
      })),
      stats: perpStats,
    },
    predictions: {
      positions: predictionPositions.map((p) => ({
        id: p.id,
        marketId: p.marketId,
        question: p.market.question,
        side: p.side ? 'YES' : 'NO',
        shares: Number(p.shares),
        avgPrice: Number(p.avgPrice),
        currentPrice: p.side
          ? Number(p.market.yesShares) /
            (Number(p.market.yesShares) + Number(p.market.noShares))
          : Number(p.market.noShares) /
            (Number(p.market.yesShares) + Number(p.market.noShares)),
        resolved: p.market.resolved,
        resolution: p.market.resolution,
      })),
      stats: {
        totalPositions: predictionPositions.length,
      },
    },
    timestamp: new Date().toISOString(),
  });
});



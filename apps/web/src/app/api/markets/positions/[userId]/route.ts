/**
 * User Positions API
 *
 * @route GET /api/markets/positions/[userId] - Get user positions
 * @access Public (RLS applies)
 *
 * @description
 * Returns user's positions in both perpetual markets and prediction markets.
 * Supports filtering by type and status. Includes position details, P&L, and
 * market information.
 *
 * @openapi
 * /api/markets/positions/{userId}:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get user positions
 *     description: Returns user's positions in perpetuals and prediction markets
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, perps, predictions]
 *           default: all
 *         description: Position type filter
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed, all]
 *           default: open
 *         description: Position status filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Positions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 positions:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       404:
 *         description: User not found
 *
 * @example
 * ```typescript
 * const response = await fetch(`/api/markets/positions/${userId}?type=all&status=open`);
 * const { positions, total } = await response.json();
 * ```
 *
 * @see {@link /lib/db/context} RLS context
 */

import { optionalAuth, successResponse, withErrorHandling } from '@babylon/api';
import { PredictionPricing } from '@babylon/core/markets/prediction';
import { asPublic, asUser } from '@babylon/db';
import {
  logger,
  UserIdParamSchema,
  UserPositionsQuerySchema,
} from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * GET /api/markets/positions/[userId]
 * Get user's positions in perpetuals and prediction markets
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    const { userId } = UserIdParamSchema.parse(await context.params);

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      userId,
      type: searchParams.get('type') || 'all',
      status: searchParams.get('status') || 'open',
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
    };
    UserPositionsQuerySchema.parse(queryParams);

    // Optional auth - positions are public for leaderboard but RLS still applies
    const authUser = await optionalAuth(request).catch(() => null);

    // Get perpetual positions from database (respecting RLS if viewer is the same user)
    const perpPositions =
      authUser && authUser.userId
        ? await asUser(authUser, async (db) => {
            return await db.perpPosition.findMany({
              where: {
                userId,
                closedAt: null,
              },
            });
          })
        : await asPublic(async (db) => {
            return await db.perpPosition.findMany({
              where: {
                userId,
                closedAt: null,
              },
            });
          });

    // Get prediction market positions with RLS
    const predictionPositionsRaw =
      authUser && authUser.userId
        ? await asUser(authUser, async (db) => {
            return await db.position.findMany({
              where: {
                userId,
              },
            });
          })
        : await asPublic(async (db) => {
            return await db.position.findMany({
              where: {
                userId,
              },
            });
          });

    // Get markets for positions
    const marketIds = [
      ...new Set(predictionPositionsRaw.map((p) => p.marketId)),
    ];
    const markets =
      marketIds.length > 0
        ? authUser && authUser.userId
          ? await asUser(authUser, async (db) => {
              return await db.market.findMany({
                where: {
                  id: { in: marketIds },
                },
                select: {
                  id: true,
                  question: true,
                  endDate: true,
                  resolved: true,
                  resolution: true,
                  yesShares: true,
                  noShares: true,
                },
              });
            })
          : await asPublic(async (db) => {
              return await db.market.findMany({
                where: {
                  id: { in: marketIds },
                },
                select: {
                  id: true,
                  question: true,
                  endDate: true,
                  resolved: true,
                  resolution: true,
                  yesShares: true,
                  noShares: true,
                },
              });
            })
        : [];

    const marketMap = new Map(markets.map((m) => [m.id, m]));

    // Join positions with markets
    const predictionPositions = predictionPositionsRaw.map((p) => ({
      ...p,
      Market: marketMap.get(p.marketId),
    }));

    // Calculate stats
    const perpStats = {
      totalPositions: perpPositions.length,
      totalPnL: perpPositions.reduce(
        (sum: number, p: (typeof perpPositions)[number]) =>
          sum + Number(p.unrealizedPnL),
        0
      ),
      totalFunding: perpPositions.reduce(
        (sum: number, p: (typeof perpPositions)[number]) =>
          sum + Number(p.fundingPaid),
        0
      ),
    };

    logger.info(
      'User positions fetched successfully',
      {
        userId,
        perpPositions: perpStats.totalPositions,
        predictionPositions: predictionPositions.length,
      },
      'GET /api/markets/positions/[userId]'
    );

    return successResponse({
      perpetuals: {
        positions: perpPositions.map((p: (typeof perpPositions)[number]) => ({
          id: p.id,
          ticker: p.ticker,
          side: (p.side as string).toUpperCase() as 'LONG' | 'SHORT',
          entryPrice: Number(p.entryPrice),
          currentPrice: Number(p.currentPrice),
          size: Number(p.size),
          leverage: Number(p.leverage),
          unrealizedPnL: Number(p.unrealizedPnL),
          unrealizedPnLPercent: Number(p.unrealizedPnLPercent),
          liquidationPrice: Number(p.liquidationPrice),
          fundingPaid: Number(p.fundingPaid),
          openedAt: p.openedAt.toISOString(),
        })),
        stats: perpStats,
      },
      predictions: {
        positions: predictionPositions
          .map((p: (typeof predictionPositions)[number]) => {
            const market = p.Market;
            if (!market) {
              // Skip positions without market data
              return null;
            }
            const yesShares = Number(market.yesShares);
            const noShares = Number(market.noShares);
            const totalShares = yesShares + noShares;
            const shares = Number(p.shares);
            const avgPrice = Number(p.avgPrice);
            const sideKey = p.side ? 'yes' : 'no';
            const costBasis = shares * avgPrice;

            let currentValue = costBasis;
            let currentUnitPrice = shares > 0 ? avgPrice : 0;

            if (shares > 0 && yesShares > 0 && noShares > 0) {
              const sellPreview = PredictionPricing.calculateSell(
                yesShares,
                noShares,
                sideKey,
                shares
              );
              currentValue = sellPreview.totalCost;
              currentUnitPrice = sellPreview.totalCost / shares;
            }

            const currentProbability =
              totalShares > 0
                ? PredictionPricing.getCurrentPrice(
                    yesShares,
                    noShares,
                    sideKey
                  )
                : 0.5;

            const unrealizedPnL = currentValue - costBasis;

            return {
              id: p.id,
              marketId: p.marketId,
              question: market.question,
              side: p.side ? 'YES' : 'NO',
              shares,
              avgPrice,
              currentPrice: currentUnitPrice,
              currentProbability,
              currentValue,
              costBasis,
              unrealizedPnL,
              resolved: market.resolved,
              resolution: market.resolution,
            };
          })
          // Filter out null positions and positions with effectively zero shares
          .filter(
            (p): p is NonNullable<typeof p> => p !== null && p.shares >= 0.01
          ),
        stats: {
          totalPositions: predictionPositions.length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
);

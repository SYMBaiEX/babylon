/**
 * Prediction Markets API
 *
 * @route GET /api/markets/predictions
 * @access Public (enhanced with authentication)
 *
 * @description
 * Retrieves active prediction markets with real-time pricing, share counts,
 * and optional user position data. Implements automated market maker (AMM)
 * pricing model with yes/no binary outcomes. Supports both anonymous and
 * authenticated access with position tracking.
 *
 * @openapi
 * /api/markets/predictions:
 *   get:
 *     tags:
 *       - Markets
 *     summary: Get prediction markets
 *     description: Returns active prediction markets with real-time pricing, share counts, and optional user positions
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: User ID to include position data
 *     responses:
 *       200:
 *         description: Prediction markets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       questionNumber:
 *                         type: integer
 *                       text:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [active, resolved, cancelled]
 *                       createdDate:
 *                         type: string
 *                         format: date-time
 *                       resolutionDate:
 *                         type: string
 *                         format: date-time
 *                       resolvedOutcome:
 *                         type: string
 *                         nullable: true
 *                       scenario:
 *                         type: string
 *                       yesShares:
 *                         type: number
 *                       noShares:
 *                         type: number
 *                       userPosition:
 *                         type: object
 *                         nullable: true
 *                 count:
 *                   type: integer
 *       400:
 *         description: Invalid query parameters
 *
 * **Market Data Includes:**
 * - **Question Details:** text, status, creation/resolution dates, outcomes
 * - **Market Pricing:** yes/no share counts, implied probabilities
 * - **User Positions:** shares owned, entry price, current value, unrealized P&L
 * - **Scenario Context:** associated scenario/event ID
 *
 * **Pricing Model:**
 * Markets use an Automated Market Maker (AMM) where:
 * - Price = shares / totalShares
 * - Yes Price = yesShares / (yesShares + noShares)
 * - No Price = noShares / (yesShares + noShares)
 * - Prices represent implied probability (0.0 to 1.0)
 *
 * **Market States:**
 * - `active` - Open for trading
 * - `resolved` - Outcome determined
 * - `cancelled` - Market cancelled/invalid
 *
 * **User Position Metrics:**
 * When `userId` provided and user has positions:
 * - `shares` - Number of shares owned
 * - `avgPrice` - Average entry price
 * - `currentPrice` - Current market price
 * - `currentValue` - Current position value
 * - `costBasis` - Total cost of position
 * - `unrealizedPnL` - Unrealized profit/loss
 *
 * **Row Level Security (RLS):**
 * Uses context-aware database access:
 * - Authenticated users: `asUser()` with user context
 * - Unauthenticated: `asPublic()` with read-only access
 *
 * @example
 * ```typescript
 * // Get all active markets (public)
 * const markets = await fetch('/api/markets/predictions')
 *   .then(r => r.json());
 *
 * markets.questions.forEach(q => {
 *   const yesPrice = q.yesShares / (q.yesShares + q.noShares);
 *   const noPrice = q.noShares / (q.yesShares + q.noShares);
 *   console.log(`${q.text}: YES ${(yesPrice * 100).toFixed(1)}%`);
 * });
 *
 * // Get markets with user positions
 * const userMarkets = await fetch(`/api/markets/predictions?userId=${userId}`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 *
 * @see {@link /lib/database-service} Database query layer
 * @see {@link /lib/db/context} RLS context management
 * @see {@link /api/markets/predictions/[id]/buy} Buy shares endpoint
 * @see {@link /api/markets/predictions/[id]/sell} Sell shares endpoint
 * @see {@link /src/app/markets/page.tsx} Markets UI
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDbInstance, type Market, type Position } from '@babylon/db';
import { optionalAuth } from '@babylon/api';
import { asPublic, asUser } from '@babylon/db';
import { successResponse, withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { PredictionPricing } from '@babylon/engine';
import { MarketQuerySchema } from '@babylon/shared';

const FALLBACK_PROBABILITY = 0.5;

type PositionWithMarket = Position & { Market?: Market | null };

function buildPositionSnapshot(p: PositionWithMarket, market?: Market | null) {
  const yesShares = market ? Number(market.yesShares) : 0;
  const noShares = market ? Number(market.noShares) : 0;
  const totalShares = yesShares + noShares;
  const shares = Number(p.shares);
  const avgPrice = Number(p.avgPrice);
  const costBasis = shares * avgPrice;
  const sideKey = p.side ? 'yes' : 'no';

  let currentValue = costBasis;
  let currentUnitPrice = shares > 0 ? avgPrice : 0;

  if (shares > 0 && yesShares > 0 && noShares > 0) {
    try {
      const sellPreview = PredictionPricing.calculateSell(
        yesShares,
        noShares,
        sideKey,
        shares
      );
      currentValue = sellPreview.totalCost;
      currentUnitPrice = sellPreview.totalCost / shares;
    } catch (error) {
      logger.warn('Failed to compute prediction MTM value', {
        error,
        marketId: p.marketId,
      });
    }
  }

  const currentProbability =
    totalShares > 0
      ? PredictionPricing.getCurrentPrice(yesShares, noShares, sideKey)
      : FALLBACK_PROBABILITY;

  const unrealizedPnL = currentValue - costBasis;
  const payoutMultiplier = 1 + avgPrice;
  const maxPayout = shares * payoutMultiplier;

  return {
    id: p.id,
    marketId: p.marketId,
    question: market?.question ?? '',
    side: p.side ? 'YES' : 'NO',
    shares,
    avgPrice,
    currentPrice: currentUnitPrice,
    currentProbability,
    currentValue,
    costBasis,
    unrealizedPnL,
    maxPayout,
    resolved: market?.resolved ?? false,
    resolution: market?.resolution ?? null,
  };
}

/**
 * GET /api/markets/predictions
 * Get active prediction questions with optional user positions
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const questions = await getDbInstance().getActiveQuestions();
  const { searchParams } = new URL(request.url);

  const queryParse = MarketQuerySchema.merge(
    z.object({ userId: z.string().optional() })
  )
    .partial()
    .safeParse(Object.fromEntries(searchParams));

  if (!queryParse.success) {
    return successResponse(
      {
        error: 'Invalid query parameters',
        details: queryParse.error.flatten(),
      },
      400
    );
  }

  const { userId } = queryParse.data;

  // Optional auth
  const authUser = await optionalAuth(request).catch(() => null);

  // Get markets and user positions with RLS
  const { markets, userPositionsMap } =
    authUser && authUser.userId
      ? await asUser(authUser, async (database) => {
          // Get all markets to check if they exist and get share counts
          const marketIds = questions.map((q) => String(q.id));
          const marketsList = await database.market.findMany({
            where: {
              id: { in: marketIds },
            },
          });
          const marketMap = new Map(marketsList.map((m) => [m.id, m]));

          // Get user positions if userId provided
          const positionsMap = new Map();
          if (userId) {
            const positions = await database.position.findMany({
              where: {
                userId: userId,
                marketId: { in: marketIds },
              },
            });

            // Get markets for positions
            const positionMarketIds = [
              ...new Set(positions.map((p) => p.marketId)),
            ];
            const positionMarkets =
              positionMarketIds.length > 0
                ? await database.market.findMany({
                    where: { id: { in: positionMarketIds } },
                  })
                : [];
            const positionMarketMap = new Map(
              positionMarkets.map((m) => [m.id, m])
            );

            // Create map of marketId -> position data
            positions.forEach((p) => {
              const positionWithMarket = p as typeof p & {
                Market?: Market | null;
              };
              const market =
                positionMarketMap.get(p.marketId) ||
                positionWithMarket.Market ||
                null;
              const snapshot = buildPositionSnapshot(p, market);
              const existingPositions = positionsMap.get(p.marketId) ?? [];
              positionsMap.set(p.marketId, [...existingPositions, snapshot]);
            });
          }

          return { markets: marketMap, userPositionsMap: positionsMap };
        })
      : await asPublic(async (database) => {
          // Get all markets to check if they exist and get share counts
          const marketIds = questions.map((q) => String(q.id));
          const marketsList = await database.market.findMany({
            where: {
              id: { in: marketIds },
            },
          });
          const marketMap = new Map(marketsList.map((m) => [m.id, m]));

          // Get user positions if userId provided
          const positionsMap = new Map();
          if (userId) {
            const positions = await database.position.findMany({
              where: {
                userId: userId,
                marketId: { in: marketIds },
              },
            });

            // Get markets for positions
            const positionMarketIds = [
              ...new Set(positions.map((p) => p.marketId)),
            ];
            const positionMarkets =
              positionMarketIds.length > 0
                ? await database.market.findMany({
                    where: { id: { in: positionMarketIds } },
                  })
                : [];
            const positionMarketMap = new Map(
              positionMarkets.map((m) => [m.id, m])
            );

            // Create map of marketId -> position data
            positions.forEach((p) => {
              const positionWithMarket = p as typeof p & {
                Market?: Market | null;
              };
              const market =
                positionMarketMap.get(p.marketId) ||
                positionWithMarket.Market ||
                null;
              const snapshot = buildPositionSnapshot(p, market);
              const existingPositions = positionsMap.get(p.marketId) ?? [];
              positionsMap.set(p.marketId, [...existingPositions, snapshot]);
            });
          }

          return { markets: marketMap, userPositionsMap: positionsMap };
        });

  const questionsData = questions.map((q) => {
    const marketId = String(q.id);
    const market = markets.get(marketId);
    const userPositions = userPositionsMap.get(marketId) ?? [];
    const primaryPosition = userPositions[0] ?? null;

    return {
      id: q.id, // Use actual question ID (string), not questionNumber
      questionNumber: q.questionNumber, // Also include questionNumber for reference
      text: q.text,
      status: q.status,
      createdDate: q.createdDate,
      resolutionDate: q.resolutionDate,
      resolvedOutcome: q.resolvedOutcome,
      scenario: q.scenarioId,
      yesShares: market ? Number(market.yesShares) : 0,
      noShares: market ? Number(market.noShares) : 0,
      // Include oracle status for on-chain verification
      oracleCommitTxHash:
        (q as { oracleCommitTxHash?: string | null }).oracleCommitTxHash ??
        null,
      oracleRevealTxHash:
        (q as { oracleRevealTxHash?: string | null }).oracleRevealTxHash ??
        null,
      oraclePublishedAt:
        (q as { oraclePublishedAt?: Date | null }).oraclePublishedAt ?? null,
      // Include user position if exists
      userPosition: primaryPosition,
      userPositions,
    };
  });

  logger.info(
    'Prediction markets fetched successfully',
    { count: questionsData.length, hasUserId: !!userId },
    'GET /api/markets/predictions'
  );

  return successResponse({
    success: true,
    questions: questionsData,
    count: questionsData.length,
  });
});

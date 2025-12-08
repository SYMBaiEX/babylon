// GET /api/markets/predictions – list markets (optionally with user positions)
import { optionalAuth, successResponse, withErrorHandling } from '@babylon/api';
import { PredictionPricing } from '@babylon/core/markets/prediction';
import {
  asPublic,
  asUser,
  getDbInstance,
  type Market,
  type Position,
} from '@babylon/db';
import { logger, MarketQuerySchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

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

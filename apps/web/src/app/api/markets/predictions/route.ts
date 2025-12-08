import { optionalAuth, successResponse, withErrorHandling } from '@babylon/api';
import {
  PredictionDbAdapter,
  PredictionMarketService,
  PredictionPricing,
} from '@babylon/core/markets/prediction';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
import { logger, MarketQuerySchema } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

type UserPositionSnapshot = {
  id: string;
  marketId: string;
  side: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currentProbability: number;
  currentValue: number;
  costBasis: number;
  unrealizedPnL: number;
  maxPayout: number;
  resolved: boolean;
  resolution: boolean | null;
};

// GET /api/markets/predictions – list markets (optionally with user positions)
export const GET = withErrorHandling(async (request: NextRequest) => {
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
  const authUser = await optionalAuth(request).catch(() => null);

  const dbAdapter = new PredictionDbAdapter();
  const service = new PredictionMarketService({
    db: dbAdapter,
    wallet: {
      debit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.debit(
          userId,
          amount,
          reason,
          description ?? '',
          relatedId
        ),
      credit: ({ userId, amount, reason, description, relatedId }) =>
        WalletService.credit(
          userId,
          amount,
          reason,
          description ?? '',
          relatedId
        ),
      recordPnL: ({ userId, pnl, reason, relatedId }) =>
        WalletService.recordPnL(userId, pnl, reason, relatedId),
      getBalance: (uid: string) => WalletService.getBalance(uid),
    },
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
    },
  });

  // Markets snapshot
  const markets = await service.listMarkets();
  const marketMap = new Map(markets.map((m) => [m.id, m]));

  // User positions if requested
  const userPositionsMap = new Map<string, UserPositionSnapshot[]>();
  if (userId && authUser?.userId === userId) {
    const positions = await service.listUserPositions(userId);
    for (const p of positions) {
      const market = marketMap.get(p.marketId);
      const yesShares = market ? market.yesShares : 0;
      const noShares = market ? market.noShares : 0;
      const shares = p.shares;
      const sideKey = p.side;
      const pricePreview = PredictionPricing.calculateSell(
        yesShares,
        noShares,
        sideKey,
        shares
      );
      const currentProbability = PredictionPricing.getCurrentPrice(
        yesShares,
        noShares,
        sideKey
      );
      const costBasis = shares * p.avgPrice;
      const currentValue = pricePreview.totalCost;
      const positionSnapshot = {
        id: p.id,
        marketId: p.marketId,
        side: p.side === 'yes' ? 'YES' : 'NO',
        shares,
        avgPrice: p.avgPrice,
        currentPrice: shares > 0 ? currentValue / shares : 0,
        currentProbability,
        currentValue,
        costBasis,
        unrealizedPnL: currentValue - costBasis,
        maxPayout: shares * (1 + p.avgPrice),
        resolved: market?.resolved ?? false,
        resolution: market?.resolution ?? null,
      };
      const existing = userPositionsMap.get(p.marketId) ?? [];
      userPositionsMap.set(p.marketId, [...existing, positionSnapshot]);
    }
  }

  const questionsData = markets.map((m) => {
    const yesShares = m.yesShares;
    const noShares = m.noShares;
    const total = yesShares + noShares;
    const yesProb = total > 0 ? yesShares / total : 0.5;
    const noProb = total > 0 ? noShares / total : 0.5;
    const userPositions = userPositionsMap.get(m.id) ?? [];
    const primaryPosition = userPositions[0] ?? null;

    return {
      id: m.id,
      question: m.question,
      status: m.status ?? (m.resolved ? 'resolved' : 'active'),
      resolution: m.resolution,
      endDate: m.endDate,
      yesShares,
      noShares,
      yesProbability: yesProb,
      noProbability: noProb,
      userPosition: primaryPosition,
      userPositions,
      oracleCommitTxHash: m.oracleCommitTxHash ?? null,
      oracleRevealTxHash: m.oracleRevealTxHash ?? null,
      resolutionProofUrl: m.resolutionProofUrl ?? null,
      resolutionDescription: m.resolutionDescription ?? null,
    };
  });

  logger.info(
    'Prediction markets fetched via core service',
    { count: questionsData.length, hasUserId: !!userId },
    'GET /api/markets/predictions'
  );

  return successResponse({
    success: true,
    questions: questionsData,
    count: questionsData.length,
  });
});

import { optionalAuth, successResponse, withErrorHandling } from '@babylon/api';
import {
  PredictionDbAdapter,
  PredictionMarketService,
  PredictionPricing,
} from '@babylon/core/markets/prediction';
import {
  and,
  balanceTransactions,
  count,
  db,
  eq,
  inArray,
  npcTrades,
} from '@babylon/db';
import { FEE_CONFIG, WalletService } from '@babylon/engine';
import {
  logger,
  MarketQuerySchema,
  PredictionMarketIdSchema,
} from '@babylon/shared';
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

/**
 * GET /api/markets/predictions/[id]
 * Returns a single market (optionally with authenticated user's positions)
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const { id: marketId } = PredictionMarketIdSchema.parse(
      await context.params
    );
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

    const service = new PredictionMarketService({
      db: new PredictionDbAdapter(),
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
        recordPnL: async ({ userId, pnl, reason, relatedId }) => {
          await WalletService.recordPnL(userId, pnl, reason, relatedId);
        },
        getBalance: (uid: string) => WalletService.getBalance(uid),
      },
      fees: {
        tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
        platformShare: FEE_CONFIG.PLATFORM_SHARE,
        referrerShare: FEE_CONFIG.REFERRER_SHARE,
        minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
      },
    });

    const market =
      (await service.getMarket(marketId)) ??
      (await service.ensureMarketExists({ marketId }).catch(() => null));

    if (!market) {
      return successResponse({ error: 'Market not found' }, 404);
    }

    const yesShares = market.yesShares;
    const noShares = market.noShares;
    // Probability should reflect the CPMM price, not the raw share ratio.
    const yesProb = PredictionPricing.getCurrentPrice(
      yesShares,
      noShares,
      'yes'
    );
    const noProb = PredictionPricing.getCurrentPrice(yesShares, noShares, 'no');

    let userPositions: UserPositionSnapshot[] = [];
    let primaryPosition: UserPositionSnapshot | null = null;

    if (userId && authUser?.userId === userId) {
      const positions = await service.listUserPositions(userId);
      userPositions = positions
        .filter((p) => p.marketId === marketId && p.shares >= 0.01)
        .map((p) => {
          let currentValue = 0;
          let currentProbability = 0.5;
          try {
            const preview = PredictionPricing.calculateSellWithFees(
              yesShares,
              noShares,
              p.side,
              p.shares,
              FEE_CONFIG.TRADING_FEE_RATE
            );
            currentValue = preview.netProceeds ?? preview.totalCost;
            currentProbability = PredictionPricing.getCurrentPrice(
              yesShares,
              noShares,
              p.side
            );
          } catch {
            currentProbability = PredictionPricing.getCurrentPrice(
              yesShares,
              noShares,
              p.side
            );
            currentValue =
              p.shares * currentProbability * (1 - FEE_CONFIG.TRADING_FEE_RATE);
          }

          const costBasisNet = p.shares * p.avgPrice;
          const costBasis =
            FEE_CONFIG.TRADING_FEE_RATE > 0 && FEE_CONFIG.TRADING_FEE_RATE < 1
              ? costBasisNet / (1 - FEE_CONFIG.TRADING_FEE_RATE)
              : costBasisNet;
          return {
            id: p.id,
            marketId: p.marketId,
            side: p.side === 'yes' ? 'YES' : 'NO',
            shares: p.shares,
            avgPrice: p.avgPrice,
            currentPrice: p.shares > 0 ? currentValue / p.shares : 0,
            currentProbability,
            currentValue,
            costBasis,
            unrealizedPnL: currentValue - costBasis,
            maxPayout: p.shares * (1 + p.avgPrice),
            resolved: market.resolved,
            resolution: market.resolution ?? null,
          };
        });
      primaryPosition = userPositions[0] ?? null;
    }

    const [balanceTradeCountRows, npcTradeCountRows] = await Promise.all([
      db
        .select({ count: count() })
        .from(balanceTransactions)
        .where(
          and(
            eq(balanceTransactions.relatedId, marketId),
            inArray(balanceTransactions.type, ['pred_buy', 'pred_sell'])
          )
        ),
      db
        .select({ count: count() })
        .from(npcTrades)
        .where(
          and(
            eq(npcTrades.marketType, 'prediction'),
            eq(npcTrades.marketId, marketId)
          )
        ),
    ]);

    const tradeCount =
      Number(balanceTradeCountRows[0]?.count ?? 0) +
      Number(npcTradeCountRows[0]?.count ?? 0);

    const payload = {
      id: market.id,
      text: market.question,
      question: market.question,
      status: market.resolved ? 'resolved' : 'active',
      resolution: market.resolution ?? null,
      resolved: market.resolved,
      resolutionDate: market.endDate?.toISOString() ?? null,
      endDate: market.endDate?.toISOString() ?? null,
      createdDate: market.createdAt?.toISOString() ?? null,
      yesShares,
      noShares,
      liquidity: market.liquidity,
      tradeCount,
      yesProbability: yesProb,
      noProbability: noProb,
      userPosition: primaryPosition,
      userPositions,
      oracleCommitTxHash: market.oracleCommitTxHash ?? null,
      oracleRevealTxHash: market.oracleRevealTxHash ?? null,
      resolutionProofUrl: market.resolutionProofUrl ?? null,
      resolutionDescription: market.resolutionDescription ?? null,
    };

    logger.info(
      'Prediction market fetched via core service',
      { marketId, hasUserId: !!userId },
      'GET /api/markets/predictions/[id]'
    );

    return successResponse({ success: true, market: payload });
  }
);

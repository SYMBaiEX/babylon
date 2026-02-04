/**
 * Admin Market Action API
 *
 * @route POST /api/admin/markets/[marketId] - Perform market actions
 * @route GET /api/admin/markets/[marketId] - Get market details
 * @access Admin
 *
 * @description
 * Allows admins to resolve markets, extend end dates, or cancel markets.
 */

import type { JsonValue } from '@babylon/api';
import {
  broadcastToChannel,
  checkRateLimitAndDuplicates,
  logAdminModify,
  RATE_LIMIT_CONFIGS,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  PredictionDbAdapter,
  PredictionMarketService,
} from '@babylon/core/markets/prediction';
import { db, desc, eq, markets, positions, withTransaction } from '@babylon/db';
import {
  FEE_CONFIG,
  invalidateAfterPredictionTrade,
  WalletService,
} from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Build PredictionMarketService for admin operations
 */
const buildCancelService = (marketId: string) =>
  new PredictionMarketService({
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
      recordPnL: ({ userId, pnl, reason, relatedId }) =>
        WalletService.recordPnL(userId, pnl, reason, relatedId).then(
          () => undefined
        ),
      getBalance: (userId: string) => WalletService.getBalance(userId),
    },
    broadcast: {
      emit: (channel, payload) =>
        broadcastToChannel(channel, payload as Record<string, JsonValue>),
    },
    cache: { invalidate: () => invalidateAfterPredictionTrade(marketId) },
    clock: { now: () => new Date() },
    fees: {
      tradingFeeRate: FEE_CONFIG.TRADING_FEE_RATE,
      platformShare: FEE_CONFIG.PLATFORM_SHARE,
      referrerShare: FEE_CONFIG.REFERRER_SHARE,
      minFeeAmount: FEE_CONFIG.MIN_FEE_AMOUNT,
    },
  });

const MarketActionSchema = z.object({
  action: z.enum(['resolve', 'extend', 'void']),
  resolution: z.boolean().optional(), // true for YES, false for NO
  newEndDate: z.string().optional(),
  reason: z.string().optional(),
});

export const GET = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ marketId: string }> }
  ) => {
    await requireAdmin(request);
    const { marketId } = await params;

    logger.info(
      'Admin market details requested',
      { marketId },
      'GET /api/admin/markets/[marketId]'
    );

    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.id, marketId))
      .limit(1);

    if (!market) {
      return successResponse({ error: 'Market not found' }, 404);
    }

    // Get positions for this market
    const marketPositions = await db
      .select({
        id: positions.id,
        userId: positions.userId,
        side: positions.side,
        shares: positions.shares,
        avgPrice: positions.avgPrice,
        amount: positions.amount,
        status: positions.status,
        createdAt: positions.createdAt,
      })
      .from(positions)
      .where(eq(positions.marketId, marketId))
      .orderBy(desc(positions.createdAt))
      .limit(100);

    // Calculate stats
    const yesShares = parseFloat(String(market.yesShares));
    const noShares = parseFloat(String(market.noShares));
    const totalShares = yesShares + noShares;
    const yesPrice = totalShares > 0 ? noShares / totalShares : 0.5;

    return successResponse({
      market: {
        ...market,
        yesPrice: Math.round(yesPrice * 100),
        noPrice: Math.round((1 - yesPrice) * 100),
        status: market.resolved
          ? 'resolved'
          : new Date(market.endDate) <= new Date()
            ? 'expired'
            : 'active',
      },
      positions: marketPositions,
      trades: [],
      stats: {
        totalPositions: marketPositions.length,
        totalTrades: 0,
        yesPositionCount: marketPositions.filter((p) => p.side === true).length,
        noPositionCount: marketPositions.filter((p) => p.side === false).length,
      },
    });
  }
);

export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ marketId: string }> }
  ) => {
    const admin = await requireAdmin(request);

    // Rate limit admin actions to prevent abuse
    const rateLimitResponse = checkRateLimitAndDuplicates(
      admin.userId,
      null,
      RATE_LIMIT_CONFIGS.ADMIN_ACTION
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { marketId } = await params;

    // Validate request body with Zod schema
    const parseResult = MarketActionSchema.safeParse(await request.json());
    if (!parseResult.success) {
      return successResponse(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        400
      );
    }
    const { action, resolution, newEndDate, reason } = parseResult.data;

    logger.info(
      'Admin market action',
      { marketId, action, resolution, adminId: admin.userId },
      'POST /api/admin/markets/[marketId]'
    );

    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.id, marketId))
      .limit(1);

    if (!market) {
      return successResponse({ error: 'Market not found' }, 404);
    }

    if (action === 'resolve') {
      if (resolution === undefined) {
        return successResponse({ error: 'Resolution required' }, 400);
      }

      if (market.resolved) {
        return successResponse({ error: 'Market already resolved' }, 400);
      }

      // Use transaction to ensure atomic updates of market and positions
      await withTransaction(async (tx) => {
        await tx
          .update(markets)
          .set({
            resolved: true,
            resolution,
            resolutionDescription:
              reason || `Resolved by admin as ${resolution ? 'YES' : 'NO'}`,
            updatedAt: new Date(),
          })
          .where(eq(markets.id, marketId));

        // Update positions
        await tx
          .update(positions)
          .set({
            status: 'resolved',
            outcome: resolution,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(positions.marketId, marketId));
      });

      await logAdminModify({
        adminId: admin.userId,
        resourceType: 'market',
        resourceId: marketId,
        previousValue: { resolved: false },
        newValue: { resolved: true, resolution, reason: reason ?? null },
        ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        metadata: { action: 'resolve', question: market.question },
      });

      return successResponse({
        success: true,
        action: 'resolve',
        resolution,
        marketId,
      });
    }

    if (action === 'extend') {
      if (!newEndDate) {
        return successResponse({ error: 'New end date required' }, 400);
      }

      const newEnd = new Date(newEndDate);
      if (newEnd <= new Date()) {
        return successResponse(
          { error: 'New end date must be in the future' },
          400
        );
      }

      // Use transaction to ensure atomic update
      await withTransaction(async (tx) => {
        await tx
          .update(markets)
          .set({
            endDate: newEnd,
            updatedAt: new Date(),
          })
          .where(eq(markets.id, marketId));
      });

      await logAdminModify({
        adminId: admin.userId,
        resourceType: 'market',
        resourceId: marketId,
        previousValue: { endDate: market.endDate.toISOString() },
        newValue: { endDate: newEnd.toISOString(), reason: reason ?? null },
        ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        metadata: { action: 'extend', question: market.question },
      });

      return successResponse({
        success: true,
        action: 'extend',
        newEndDate: newEnd.toISOString(),
        marketId,
      });
    }

    if (action === 'void') {
      // Use PredictionMarketService.cancel() to properly refund all positions
      const service = buildCancelService(marketId);
      const result = await service.cancel({
        marketId,
        reason: reason || 'Market voided by admin',
      });

      logger.info(
        'Market voided via cancel()',
        {
          marketId,
          positionsRefunded: result.positionsRefunded,
          totalRefunded: result.totalRefunded,
          adminId: admin.userId,
        },
        'POST /api/admin/markets/[marketId]'
      );

      await logAdminModify({
        adminId: admin.userId,
        resourceType: 'market',
        resourceId: marketId,
        previousValue: { status: 'active' },
        newValue: {
          status: 'cancelled',
          reason: reason ?? null,
          positionsRefunded: result.positionsRefunded,
          totalRefunded: result.totalRefunded,
        },
        ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        metadata: { action: 'void', question: market.question },
      });

      return successResponse({
        success: true,
        action: 'void',
        marketId,
        positionsRefunded: result.positionsRefunded,
        totalRefunded: result.totalRefunded,
      });
    }

    return successResponse({ error: 'Invalid action' }, 400);
  }
);

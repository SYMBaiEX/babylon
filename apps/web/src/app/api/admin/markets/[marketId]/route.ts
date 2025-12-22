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

import {
  checkRateLimitAndDuplicates,
  logAdminModify,
  RATE_LIMIT_CONFIGS,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, desc, eq, markets, positions } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

interface MarketActionRequest {
  action: 'resolve' | 'extend' | 'void';
  resolution?: boolean; // true for YES, false for NO
  newEndDate?: string;
  reason?: string;
}

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

    const body = (await request.json()) as MarketActionRequest;
    const { action, resolution, newEndDate, reason } = body;

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

      await db
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
      await db
        .update(positions)
        .set({
          status: 'resolved',
          outcome: resolution,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(positions.marketId, marketId));

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

      await db
        .update(markets)
        .set({
          endDate: newEnd,
          updatedAt: new Date(),
        })
        .where(eq(markets.id, marketId));

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
      // Void the market - refund all positions
      await db
        .update(markets)
        .set({
          resolved: true,
          resolution: null,
          resolutionDescription: reason || 'Market voided by admin',
          updatedAt: new Date(),
        })
        .where(eq(markets.id, marketId));

      // Mark all positions as voided
      await db
        .update(positions)
        .set({
          status: 'voided',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(positions.marketId, marketId));

      await logAdminModify({
        adminId: admin.userId,
        resourceType: 'market',
        resourceId: marketId,
        previousValue: { status: 'active' },
        newValue: { status: 'voided', reason: reason ?? null },
        ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
        metadata: { action: 'void', question: market.question },
      });

      return successResponse({
        success: true,
        action: 'void',
        marketId,
      });
    }

    return successResponse({ error: 'Invalid action' }, 400);
  }
);

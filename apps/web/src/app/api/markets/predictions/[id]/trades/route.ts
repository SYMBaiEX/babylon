// GET /api/markets/predictions/[id]/trades – paginated trades for a market
import type { JsonValue } from '@babylon/api';
import {
  getCache,
  optionalAuth,
  setCache,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    // Optional auth - trades are public
    await optionalAuth(request).catch(() => null);

    const { id: marketId } = await context.params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = QuerySchema.parse({
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    });

    logger.info(
      'Prediction market trades requested',
      { marketId, queryParams },
      'GET /api/markets/predictions/[id]/trades'
    );

    // Check Redis cache first
    const cacheKey = `prediction-trades:${marketId}:${queryParams.limit}:${queryParams.offset}`;
    const cached = await getCache<Record<string, JsonValue>>(cacheKey);

    if (cached) {
      logger.debug(
        'Cache hit for prediction trades',
        { marketId },
        'PredictionTrades'
      );
      return successResponse(cached);
    }

    // Verify market exists
    const market = await db.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        question: true,
        resolved: true,
        resolution: true,
      },
    });

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    // Get positions for this market (user trades)
    const positionsRaw = await db.position.findMany({
      where: {
        marketId: marketId,
        shares: { gt: '0' }, // Only positions with shares (shares is string)
      },
      orderBy: { updatedAt: 'desc' },
      take: queryParams.limit,
      skip: queryParams.offset,
    });

    // Get users for positions
    const userIds = [...new Set(positionsRaw.map((p) => p.userId))];
    const users =
      userIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
              isActor: true,
            },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Join positions with users
    const positions = positionsRaw.map((pos) => ({
      ...pos,
      User: userMap.get(pos.userId),
    }));

    // Get total count for pagination
    const totalPositions = await db.position.count({
      where: {
        marketId: marketId,
        shares: { gt: '0' }, // shares is string
      },
    });

    // Get balance transactions for these positions
    const positionIds = positions.map((p) => p.id);
    const balanceTransactions =
      positionIds.length > 0
        ? await db.balanceTransaction.findMany({
            where: {
              type: { in: ['pred_buy', 'pred_sell'] },
              relatedId: { in: positionIds },
            },
            orderBy: { createdAt: 'desc' },
            take: queryParams.limit,
            select: {
              id: true,
              type: true,
              amount: true,
              userId: true,
              createdAt: true,
              relatedId: true,
              description: true,
            },
          })
        : [];

    // Fetch users for transactions
    const txUserIds = [...new Set(balanceTransactions.map((tx) => tx.userId))];
    const txUsers = await db.user.findMany({
      where: { id: { in: txUserIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        profileImageUrl: true,
        isActor: true,
      },
    });
    const txUsersMap = new Map(txUsers.map((u) => [u.id, u]));

    // Format trades
    const trades = [
      // Position trades
      ...positions.map((pos) => ({
        id: pos.id,
        type: 'position' as const,
        user: pos.User,
        side: pos.side ? 'YES' : 'NO',
        shares: Number(pos.shares),
        avgPrice: Number(pos.avgPrice),
        amount: Number(pos.shares) * Number(pos.avgPrice),
        timestamp: pos.updatedAt,
        marketId: pos.marketId,
      })),
      // Balance transaction trades
      ...balanceTransactions.map((tx) => ({
        id: tx.id,
        type: 'balance' as const,
        user: txUsersMap.get(tx.userId) || null,
        transactionType: tx.type,
        amount: Number(tx.amount),
        description: tx.description,
        relatedId: tx.relatedId,
        timestamp: tx.createdAt,
        marketId,
      })),
    ]
      // Sort by timestamp descending
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      // Apply pagination
      .slice(0, queryParams.limit);

    const total = totalPositions + balanceTransactions.length;
    const hasMore = queryParams.offset + queryParams.limit < total;

    const result = {
      trades,
      total,
      hasMore,
      marketId: market.id,
      question: market.question,
    };

    // Cache for 30 seconds
    await setCache(cacheKey, result, { ttl: 30, namespace: 'market-trades' });

    logger.info(
      `Returned ${trades.length} trades for prediction market ${marketId}`,
      { total, hasMore },
      'PredictionTrades'
    );

    return successResponse(result);
  }
);

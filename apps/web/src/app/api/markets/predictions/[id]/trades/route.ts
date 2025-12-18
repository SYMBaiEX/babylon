// GET /api/markets/predictions/[id]/trades – paginated trades for a market
import type { JsonValue } from '@babylon/api';
import {
  getCache,
  optionalAuth,
  setCache,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  and,
  balanceTransactions,
  db,
  desc,
  eq,
  inArray,
  markets,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
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
      limit: searchParams.get('limit') || '20',
      offset: searchParams.get('offset') || '0',
    });

    logger.info(
      'Prediction market trades requested',
      { marketId, queryParams },
      'GET /api/markets/predictions/[id]/trades'
    );

    // Check Redis cache first
    const cacheKey = `prediction-trades:v2:${marketId}:${queryParams.limit}:${queryParams.offset}`;
    const cached = await getCache<Record<string, JsonValue>>(cacheKey);

    if (cached) {
      return successResponse(cached);
    }

    // Verify market exists (drizzle) - used for response metadata
    const [market] = await db
      .select({
        id: markets.id,
        question: markets.question,
      })
      .from(markets)
      .where(eq(markets.id, marketId))
      .limit(1);

    if (!market) {
      return successResponse({ error: 'Market not found' }, 404);
    }

    // Prediction trades are recorded as balance transactions with relatedId = marketId.
    // This avoids expensive joins against positions for a paginated feed.
    const txRows = await db
      .select({
        id: balanceTransactions.id,
        type: balanceTransactions.type,
        amount: balanceTransactions.amount,
        userId: balanceTransactions.userId,
        createdAt: balanceTransactions.createdAt,
      })
      .from(balanceTransactions)
      .where(
        and(
          eq(balanceTransactions.relatedId, marketId),
          inArray(balanceTransactions.type, ['pred_buy', 'pred_sell'])
        )
      )
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(queryParams.limit + 1)
      .offset(queryParams.offset);

    const hasMore = txRows.length > queryParams.limit;
    const pageRows = hasMore ? txRows.slice(0, queryParams.limit) : txRows;

    const userIds = [...new Set(pageRows.map((row) => row.userId))];
    const userRows =
      userIds.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              displayName: users.displayName,
              profileImageUrl: users.profileImageUrl,
              isActor: users.isActor,
            })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const trades = pageRows.map((tx) => ({
      id: tx.id,
      type: 'balance' as const,
      user: userMap.get(tx.userId) ?? null,
      transactionType: tx.type,
      amount: Number(tx.amount),
      timestamp: tx.createdAt.toISOString(),
      marketId,
    }));

    const result = {
      trades,
      total: queryParams.offset + trades.length + (hasMore ? 1 : 0),
      hasMore,
      marketId: market.id,
      question: market.question,
    };

    // Cache briefly; feed is also updated via SSE.
    await setCache(cacheKey, result, { ttl: 10, namespace: 'market-trades' });

    return successResponse(result);
  }
);

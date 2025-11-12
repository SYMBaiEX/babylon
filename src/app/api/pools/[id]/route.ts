import { optionalAuth } from '@/lib/api/auth-middleware';
import { asPublic, asUser } from '@/lib/db/context';
import { NotFoundError } from '@/lib/errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { PoolIdParamSchema } from '@/lib/validation/schemas/pool';
import type { NextRequest } from 'next/server';

/**
 * GET /api/pools/[id]
 * Get detailed information about a specific pool
 */
export const GET = withErrorHandling(async (
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = PoolIdParamSchema.parse(await context.params);

  // Optional auth - pools are public but RLS still applies
  const authUser = await optionalAuth(_request).catch(() => null);

  // Get pool details with RLS
  const pool = (authUser && authUser.userId)
    ? await asUser(authUser, async (db) => {
    return await db.pool.findUnique({
      where: { id },
      include: {
        Actor: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            personality: true,
            domain: true,
            postStyle: true,
          },
        },
        PoolDeposit: {
          where: {
            withdrawnAt: null,
          },
          orderBy: {
            depositedAt: 'desc',
          },
        },
        PoolPosition: {
          where: {
            closedAt: null,
          },
          orderBy: {
            openedAt: 'desc',
          },
        },
        NPCTrade: {
          orderBy: {
            executedAt: 'desc',
          },
          take: 50, // Last 50 trades
        },
      },
    })
  })
    : await asPublic(async (db) => {
      return await db.pool.findUnique({
      where: { id },
      include: {
        Actor: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            personality: true,
            domain: true,
            postStyle: true,
          },
        },
        PoolDeposit: {
          where: {
            withdrawnAt: null,
          },
          orderBy: {
            depositedAt: 'desc',
          },
        },
        PoolPosition: {
          where: {
            closedAt: null,
          },
          orderBy: {
            openedAt: 'desc',
          },
        },
        NPCTrade: {
          orderBy: {
            executedAt: 'desc',
          },
          take: 50, // Last 50 trades
        },
      },
    })
  });

  if (!pool) {
    throw new NotFoundError('Pool', id);
  }

    // Calculate metrics
    const totalDeposits = parseFloat(pool.totalDeposits.toString());
    const totalValue = parseFloat(pool.totalValue.toString());
    const lifetimePnL = parseFloat(pool.lifetimePnL.toString());
    const availableBalance = parseFloat(pool.availableBalance.toString());
    
    const totalUnrealizedPnL = pool.PoolPosition.reduce(
      (sum, pos) => sum + pos.unrealizedPnL,
      0
    );

    const totalReturn = totalDeposits > 0 ? ((totalValue - totalDeposits) / totalDeposits) * 100 : 0;

    // Calculate position breakdown
    const positionsByType = {
      perp: {
        count: pool.PoolPosition.filter(p => p.marketType === 'perp').length,
        totalSize: pool.PoolPosition
          .filter(p => p.marketType === 'perp')
          .reduce((sum, p) => sum + p.size, 0),
        unrealizedPnL: pool.PoolPosition
          .filter(p => p.marketType === 'perp')
          .reduce((sum, p) => sum + p.unrealizedPnL, 0),
      },
      prediction: {
        count: pool.PoolPosition.filter(p => p.marketType === 'prediction').length,
        totalSize: pool.PoolPosition
          .filter(p => p.marketType === 'prediction')
          .reduce((sum, p) => sum + p.size, 0),
        unrealizedPnL: pool.PoolPosition
          .filter(p => p.marketType === 'prediction')
          .reduce((sum, p) => sum + p.unrealizedPnL, 0),
      },
    };

  logger.info('Pool details fetched successfully', { poolId: id, openPositions: pool.PoolPosition.length }, 'GET /api/pools/[id]');

  return successResponse({
    pool: {
      id: pool.id,
      name: pool.name,
      description: pool.description,
      npcActor: pool.Actor,
      totalValue,
      totalDeposits,
      availableBalance,
      lifetimePnL,
      totalReturn,
      performanceFeeRate: pool.performanceFeeRate,
      totalFeesCollected: parseFloat(pool.totalFeesCollected.toString()),
      activeInvestors: pool.PoolDeposit.length,
      openPositions: pool.PoolPosition.length,
      totalUnrealizedPnL,
      totalTrades: pool.NPCTrade.length,
      positionsByType,
      openedAt: pool.openedAt.toISOString(),
      updatedAt: pool.updatedAt.toISOString(),
    },
    deposits: pool.PoolDeposit.map(d => ({
      id: d.id,
      userId: d.userId,
      amount: parseFloat(d.amount.toString()),
      shares: parseFloat(d.shares.toString()),
      currentValue: parseFloat(d.currentValue.toString()),
      unrealizedPnL: parseFloat(d.unrealizedPnL.toString()),
      depositedAt: d.depositedAt.toISOString(),
    })),
    positions: pool.PoolPosition.map(p => ({
      id: p.id,
      marketType: p.marketType,
      ticker: p.ticker,
      marketId: p.marketId,
      side: p.side,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      size: p.size,
      shares: p.shares,
      leverage: p.leverage,
      liquidationPrice: p.liquidationPrice,
      unrealizedPnL: p.unrealizedPnL,
      openedAt: p.openedAt.toISOString(),
    })),
    recentTrades: pool.NPCTrade.map(t => ({
      id: t.id,
      marketType: t.marketType,
      ticker: t.ticker,
      marketId: t.marketId,
      action: t.action,
      side: t.side,
      amount: t.amount,
      price: t.price,
      sentiment: t.sentiment,
      reason: t.reason,
      executedAt: t.executedAt.toISOString(),
    })),
  });
});


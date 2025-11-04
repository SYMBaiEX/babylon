/**
 * API Route: /api/pools
 * Methods: GET (list all active pools with performance metrics)
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database-service';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { PoolQuerySchema, PaginationSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * GET /api/pools
 * List all active pools with their performance metrics
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Validate query parameters
  const { searchParams } = new URL(request.url);
  const queryParams = {
    isActive: searchParams.get('isActive'),
    npcActorId: searchParams.get('npcActorId'),
    minValue: searchParams.get('minValue'),
    maxValue: searchParams.get('maxValue'),
    sortBy: searchParams.get('sortBy'),
    search: searchParams.get('search'),
    page: searchParams.get('page'),
    limit: searchParams.get('limit')
  };
  PoolQuerySchema.merge(PaginationSchema).partial().parse(queryParams);
  const pools = await prisma.pool.findMany({
    where: {
      isActive: true,
    },
    include: {
      npcActor: {
        select: {
          id: true,
          name: true,
          description: true,
          tier: true,
          personality: true,
        },
      },
      deposits: {
        where: {
          withdrawnAt: null,
        },
        select: {
          amount: true,
          currentValue: true,
        },
      },
      positions: {
        where: {
          closedAt: null,
        },
        select: {
          marketType: true,
          ticker: true,
          marketId: true,
          side: true,
          size: true,
          unrealizedPnL: true,
        },
      },
      _count: {
        select: {
          deposits: {
            where: {
              withdrawnAt: null,
            },
          },
          trades: true,
        },
      },
    },
    orderBy: [
      { totalValue: 'desc' },
    ],
  });

  // Calculate metrics for each pool
  const poolsWithMetrics = pools.map((pool) => {
    const totalDeposits = parseFloat(pool.totalDeposits.toString());
    const totalValue = parseFloat(pool.totalValue.toString());
    const lifetimePnL = parseFloat(pool.lifetimePnL.toString());
    const availableBalance = parseFloat(pool.availableBalance.toString());

    // Calculate total unrealized P&L across all positions
    const totalUnrealizedPnL = pool.positions.reduce(
      (sum, pos) => sum + pos.unrealizedPnL,
      0
    );

    // Calculate returns
    const totalReturn = totalDeposits > 0 ? ((totalValue - totalDeposits) / totalDeposits) * 100 : 0;

    // Calculate active deposits value
    const activeDepositsValue = pool.deposits.reduce(
      (sum, dep) => sum + parseFloat(dep.currentValue.toString()),
      0
    );

    return {
      id: pool.id,
      name: pool.name,
      description: pool.description,
      npcActor: pool.npcActor,
      totalValue,
      totalDeposits,
      availableBalance,
      lifetimePnL,
      totalReturn,
      performanceFeeRate: pool.performanceFeeRate,
      totalFeesCollected: parseFloat(pool.totalFeesCollected.toString()),
      activeInvestors: pool._count.deposits,
      totalTrades: pool._count.trades,
      openPositions: pool.positions.length,
      totalUnrealizedPnL,
      activeDepositsValue,
      openedAt: pool.openedAt.toISOString(),
      updatedAt: pool.updatedAt.toISOString(),
    };
  });

  logger.info('Pools fetched successfully', { total: poolsWithMetrics.length }, 'GET /api/pools');

  return successResponse({
    pools: poolsWithMetrics,
    total: poolsWithMetrics.length,
  });
});

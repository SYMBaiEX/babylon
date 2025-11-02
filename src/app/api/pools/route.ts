import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/pools
 * List all active pools with their performance metrics
 */
export async function GET(_request: NextRequest) {
  try {
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

    return NextResponse.json({
      pools: poolsWithMetrics,
      total: poolsWithMetrics.length,
    });
  } catch (error) {
    console.error('Error fetching pools:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pools' },
      { status: 500 }
    );
  }
}


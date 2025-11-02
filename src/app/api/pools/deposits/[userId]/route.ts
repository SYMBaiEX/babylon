import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/pools/deposits/[userId]
 * Get all pool deposits for a specific user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const deposits = await prisma.poolDeposit.findMany({
      where: {
        userId,
      },
      include: {
        pool: {
          include: {
            npcActor: {
              select: {
                id: true,
                name: true,
                tier: true,
                personality: true,
              },
            },
          },
        },
      },
      orderBy: {
        depositedAt: 'desc',
      },
    });

    // Format deposits with calculated metrics
    const formattedDeposits = deposits.map(d => {
      const amount = parseFloat(d.amount.toString());
      const currentValue = parseFloat(d.currentValue.toString());
      const unrealizedPnL = parseFloat(d.unrealizedPnL.toString());
      const shares = parseFloat(d.shares.toString());

      const returnPercent = amount > 0 ? ((currentValue - amount) / amount) * 100 : 0;

      return {
        id: d.id,
        poolId: d.poolId,
        poolName: d.pool.name,
        npcActor: d.pool.npcActor,
        amount,
        shares,
        currentValue,
        unrealizedPnL,
        returnPercent,
        depositedAt: d.depositedAt.toISOString(),
        withdrawnAt: d.withdrawnAt?.toISOString() || null,
        withdrawnAmount: d.withdrawnAmount ? parseFloat(d.withdrawnAmount.toString()) : null,
        isActive: !d.withdrawnAt,
      };
    });

    // Separate active and historical
    const activeDeposits = formattedDeposits.filter(d => d.isActive);
    const historicalDeposits = formattedDeposits.filter(d => !d.isActive);

    // Calculate totals
    const totalInvested = activeDeposits.reduce((sum, d) => sum + d.amount, 0);
    const totalCurrentValue = activeDeposits.reduce((sum, d) => sum + d.currentValue, 0);
    const totalUnrealizedPnL = activeDeposits.reduce((sum, d) => sum + d.unrealizedPnL, 0);
    const totalReturnPercent = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;

    return NextResponse.json({
      activeDeposits,
      historicalDeposits,
      summary: {
        totalInvested,
        totalCurrentValue,
        totalUnrealizedPnL,
        totalReturnPercent,
        activePools: activeDeposits.length,
        historicalCount: historicalDeposits.length,
      },
    });
  } catch (error) {
    console.error('Error fetching user pool deposits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deposits' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}


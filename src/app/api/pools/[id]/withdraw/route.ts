import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/pools/[id]/withdraw
 * Withdraw funds from a pool
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poolId } = await params;
    const body = await request.json();
    const { userId, depositId } = body;

    if (!userId || !depositId) {
      return NextResponse.json(
        { error: 'Invalid request. userId and depositId required.' },
        { status: 400 }
      );
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get deposit
      const deposit = await tx.poolDeposit.findUnique({
        where: { id: depositId },
        include: {
          pool: true,
        },
      });

      if (!deposit) {
        throw new Error('Deposit not found');
      }

      if (deposit.userId !== userId) {
        throw new Error('Unauthorized');
      }

      if (deposit.withdrawnAt) {
        throw new Error('Already withdrawn');
      }

      if (deposit.poolId !== poolId) {
        throw new Error('Deposit does not belong to this pool');
      }

      const pool = deposit.pool;

      // 2. Calculate withdrawal amount based on current value
      const currentValue = parseFloat(deposit.currentValue.toString());
      const originalAmount = parseFloat(deposit.amount.toString());
      const pnl = currentValue - originalAmount;

      // 3. Calculate performance fee if there's profit
      let performanceFee = 0;
      let withdrawalAmount = currentValue;
      
      if (pnl > 0) {
        performanceFee = pnl * pool.performanceFeeRate;
        withdrawalAmount = currentValue - performanceFee;
      }

      // 4. Check if pool has enough available balance
      const poolAvailableBalance = parseFloat(pool.availableBalance.toString());
      if (poolAvailableBalance < withdrawalAmount) {
        throw new Error('Pool has insufficient available balance. Try again after positions are closed.');
      }

      // 5. Mark deposit as withdrawn
      await tx.poolDeposit.update({
        where: { id: depositId },
        data: {
          withdrawnAt: new Date(),
          withdrawnAmount: new Prisma.Decimal(withdrawalAmount),
        },
      });

      // 6. Update pool totals
      const newTotalValue = parseFloat(pool.totalValue.toString()) - currentValue;
      const newAvailableBalance = poolAvailableBalance - withdrawalAmount;
      const newTotalFeesCollected = parseFloat(pool.totalFeesCollected.toString()) + performanceFee;

      await tx.pool.update({
        where: { id: poolId },
        data: {
          totalValue: new Prisma.Decimal(Math.max(0, newTotalValue)),
          availableBalance: new Prisma.Decimal(Math.max(0, newAvailableBalance)),
          totalFeesCollected: new Prisma.Decimal(newTotalFeesCollected),
        },
      });

      // 7. Credit user balance
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const userBalance = parseFloat(user.virtualBalance.toString());
      const newUserBalance = userBalance + withdrawalAmount;
      const netPnL = withdrawalAmount - originalAmount;

      // Calculate reputation points to award/deduct based on P&L
      // Award 1 point per $10 profit, deduct 1 point per $10 loss (minimum 0)
      const reputationChange = Math.floor(netPnL / 10);
      const currentReputation = user.reputationPoints;
      const newReputation = Math.max(0, currentReputation + reputationChange);

      await tx.user.update({
        where: { id: userId },
        data: {
          virtualBalance: new Prisma.Decimal(newUserBalance),
          lifetimePnL: new Prisma.Decimal(
            parseFloat(user.lifetimePnL.toString()) + netPnL
          ),
          reputationPoints: newReputation,
        },
      });

      // 8. Create balance transaction
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'pool_withdraw',
          amount: new Prisma.Decimal(withdrawalAmount),
          balanceBefore: new Prisma.Decimal(userBalance),
          balanceAfter: new Prisma.Decimal(newUserBalance),
          relatedId: depositId,
          description: `Withdrew from ${pool.name}`,
        },
      });

      // 9. Create reputation points transaction if there was a change
      if (reputationChange !== 0) {
        await tx.pointsTransaction.create({
          data: {
            userId,
            amount: reputationChange,
            pointsBefore: currentReputation,
            pointsAfter: newReputation,
            reason: netPnL > 0 ? 'pool_profit' : 'pool_loss',
            metadata: JSON.stringify({
              poolId,
              poolName: pool.name,
              netPnL,
              originalAmount,
              withdrawalAmount,
            }),
          },
        });
      }

      return {
        withdrawalAmount,
        performanceFee,
        pnl: netPnL,
        originalAmount,
        newBalance: newUserBalance,
        reputationChange,
        newReputation,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Error withdrawing from pool:', error, 'POST /api/pools/[id]/withdraw')
    const errorMessage = error instanceof Error ? error.message : 'Failed to withdraw from pool';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}


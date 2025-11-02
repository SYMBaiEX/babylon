import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/pools/[id]/deposit
 * Deposit funds into a pool
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poolId } = await params;
    const body = await request.json();
    const { userId, amount } = body;

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid request. userId and positive amount required.' },
        { status: 400 }
      );
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get pool
      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        include: {
          deposits: {
            where: { withdrawnAt: null },
          },
        },
      });

      if (!pool) {
        throw new Error('Pool not found');
      }

      if (!pool.isActive) {
        throw new Error('Pool is not active');
      }

      // 2. Check user balance
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const userBalance = parseFloat(user.virtualBalance.toString());
      if (userBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // 3. Calculate shares
      // shares = (amount / totalValue) * totalShares
      // If first deposit, shares = amount
      const currentTotalValue = parseFloat(pool.totalValue.toString());
      const currentTotalDeposits = parseFloat(pool.totalDeposits.toString());
      
      let shares: number;
      if (currentTotalValue === 0 || pool.deposits.length === 0) {
        // First deposit
        shares = amount;
      } else {
        // Calculate proportional shares based on current pool value
        const totalShares = pool.deposits.reduce(
          (sum, d) => sum + parseFloat(d.shares.toString()),
          0
        );
        shares = (amount / currentTotalValue) * totalShares;
      }

      // 4. Create deposit record
      const deposit = await tx.poolDeposit.create({
        data: {
          poolId,
          userId,
          amount: new Prisma.Decimal(amount),
          shares: new Prisma.Decimal(shares),
          currentValue: new Prisma.Decimal(amount), // Initially equal to deposit
          unrealizedPnL: new Prisma.Decimal(0),
        },
      });

      // 5. Update pool totals
      const newTotalValue = currentTotalValue + amount;
      const newTotalDeposits = currentTotalDeposits + amount;
      const newAvailableBalance = parseFloat(pool.availableBalance.toString()) + amount;

      await tx.pool.update({
        where: { id: poolId },
        data: {
          totalValue: new Prisma.Decimal(newTotalValue),
          totalDeposits: new Prisma.Decimal(newTotalDeposits),
          availableBalance: new Prisma.Decimal(newAvailableBalance),
        },
      });

      // 6. Deduct from user balance
      const newUserBalance = userBalance - amount;
      await tx.user.update({
        where: { id: userId },
        data: {
          virtualBalance: new Prisma.Decimal(newUserBalance),
        },
      });

      // 7. Create balance transaction
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'pool_deposit',
          amount: new Prisma.Decimal(-amount),
          balanceBefore: new Prisma.Decimal(userBalance),
          balanceAfter: new Prisma.Decimal(newUserBalance),
          relatedId: deposit.id,
          description: `Deposited into ${pool.name}`,
        },
      });

      // 8. Award reputation points for pool participation (+1 point per $100 deposited)
      const reputationBonus = Math.floor(amount / 100);
      if (reputationBonus > 0) {
        const currentReputation = user.reputationPoints;
        const newReputation = currentReputation + reputationBonus;

        await tx.user.update({
          where: { id: userId },
          data: {
            reputationPoints: newReputation,
          },
        });

        await tx.pointsTransaction.create({
          data: {
            userId,
            amount: reputationBonus,
            pointsBefore: currentReputation,
            pointsAfter: newReputation,
            reason: 'pool_deposit',
            metadata: JSON.stringify({
              poolId: pool.id,
              poolName: pool.name,
              depositAmount: amount,
            }),
          },
        });
      }

      return {
        deposit: {
          id: deposit.id,
          poolId,
          amount,
          shares,
          currentValue: amount,
          depositedAt: deposit.depositedAt.toISOString(),
        },
        newBalance: newUserBalance,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Error depositing into pool:', error, 'POST /api/pools/[id]/deposit');
    const errorMessage = error instanceof Error ? error.message : 'Failed to deposit into pool';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}


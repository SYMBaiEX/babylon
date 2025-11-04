/**
 * Pool repository for managing pool-related database operations
 */

import type { Pool, PoolDeposit, PoolPosition, Prisma, PrismaClient, NPCTrade } from '@prisma/client';
import { BaseRepository, CacheTTL } from './base.repository';
import { PoolError, DepositError, DatabaseError, NotFoundError } from '@/lib/errors';

/**
 * Pool with relations type
 */
export type PoolWithRelations = Pool & {
  npcActor?: {
    id: string;
    name: string;
    description: string | null;
    tier: string;
    personality: string | null;
  };
  deposits?: PoolDeposit[];
  positions?: PoolPosition[];
  _count?: {
    deposits: number;
    positions: number;
    trades: number;
  };
};

/**
 * Pool metrics type
 */
export interface PoolMetrics {
  totalReturn: number;
  absoluteReturn: number;
  sharpeRatio?: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

/**
 * Pool repository class
 */
export class PoolRepository extends BaseRepository<Pool, Prisma.PoolCreateInput, Prisma.PoolUpdateInput> {
  /**
   * Standard includes for pool queries
   */
  private readonly STANDARD_INCLUDES = {
    npcActor: {
      select: {
        id: true,
        name: true,
        description: true,
        tier: true,
        personality: true
      }
    },
    _count: {
      select: {
        deposits: {
          where: { withdrawnAt: null }
        },
        positions: {
          where: { closedAt: null }
        },
        trades: true
      }
    }
  };

  /**
   * Full includes with deposits and positions
   */
  private readonly FULL_INCLUDES = {
    ...this.STANDARD_INCLUDES,
    deposits: {
      where: { withdrawnAt: null },
      select: {
        id: true,
        userId: true,
        amount: true,
        shares: true,
        currentValue: true,
        unrealizedPnL: true,
        depositedAt: true,
        withdrawnAt: true
      }
    },
    positions: {
      where: { closedAt: null },
      select: {
        id: true,
        marketType: true,
        ticker: true,
        marketId: true,
        side: true,
        entryPrice: true,
        currentPrice: true,
        size: true,
        shares: true,
        leverage: true,
        liquidationPrice: true,
        unrealizedPnL: true,
        openedAt: true
      }
    }
  };

  constructor(prisma: PrismaClient) {
    super(prisma, 'pool', {
      defaultTTL: CacheTTL.SHORT,
      cachePrefix: 'pool:'
    });
  }

  /**
   * Find active pools with metrics
   */
  async findActivePoolsWithMetrics(
    limit: number = 50,
    offset: number = 0
  ): Promise<PoolWithRelations[]> {
    const cacheKey = this.generateCacheKey('active-metrics', limit, offset);

    return this.getOrSet(
      cacheKey,
      async () => {
        return this.model.findMany({
          where: { isActive: true },
          include: this.STANDARD_INCLUDES,
          orderBy: [
            { totalValue: 'desc' },
            { createdAt: 'desc' }
          ],
          skip: offset,
          take: limit
        });
      },
      CacheTTL.SHORT
    );
  }

  /**
   * Find pools by NPC actor
   */
  async findByNpcActor(
    npcActorId: string,
    includeInactive: boolean = false
  ): Promise<PoolWithRelations[]> {
    const cacheKey = this.generateCacheKey('npc-actor', npcActorId, { includeInactive });

    return this.getOrSet(
      cacheKey,
      async () => {
        return this.model.findMany({
          where: {
            npcActorId,
            ...(includeInactive ? {} : { isActive: true })
          },
          include: this.STANDARD_INCLUDES,
          orderBy: { createdAt: 'desc' }
        });
      },
      CacheTTL.MEDIUM
    );
  }

  /**
   * Find pool with full details
   */
  async findWithDetails(poolId: string): Promise<PoolWithRelations | null> {
    const cacheKey = this.generateCacheKey('details', poolId);

    return this.getOrSet(
      cacheKey,
      async () => {
        return this.model.findUnique({
          where: { id: poolId },
          include: this.FULL_INCLUDES
        });
      },
      CacheTTL.SHORT
    );
  }

  /**
   * Get pool performance metrics
   */
  async getPoolMetrics(poolId: string, period: '1d' | '7d' | '30d' | '90d' | 'all' = '30d'): Promise<PoolMetrics> {
    const cacheKey = this.generateCacheKey('metrics', poolId, period);

    return this.getOrSet(
      cacheKey,
      async () => {
        // Calculate date range
        const startDate = period === 'all' ? undefined : this.getStartDate(period);

        // Get trades for the pool
        const trades = await this.prisma.nPCTrade.findMany({
          where: {
            poolId,
            ...(startDate && { executedAt: { gte: startDate } })
          },
          orderBy: { executedAt: 'asc' }
        });

        // Calculate metrics
        const metrics = this.calculateMetrics(trades);

        return metrics;
      },
      CacheTTL.MEDIUM
    );
  }

  /**
   * Get top performing pools
   */
  async getTopPerformingPools(limit: number = 10): Promise<PoolWithRelations[]> {
    const cacheKey = this.generateCacheKey('top-performing', limit);

    return this.getOrSet(
      cacheKey,
      async () => {
        return this.model.findMany({
          where: { isActive: true },
          include: this.STANDARD_INCLUDES,
          orderBy: [
            { lifetimePnL: 'desc' },
            { totalValue: 'desc' }
          ],
          take: limit
        });
      },
      CacheTTL.MEDIUM
    );
  }

  /**
   * Get pools with open positions
   */
  async getPoolsWithOpenPositions(): Promise<PoolWithRelations[]> {
    const cacheKey = this.generateCacheKey('with-positions');

    return this.getOrSet(
      cacheKey,
      async () => {
        return this.model.findMany({
          where: {
            isActive: true,
            positions: {
              some: { closedAt: null }
            }
          },
          include: {
            ...this.STANDARD_INCLUDES,
            positions: {
              where: { closedAt: null }
            }
          }
        });
      },
      CacheTTL.SHORT
    );
  }

  /**
   * Update pool metrics (after trade execution)
   */
  async updatePoolMetrics(poolId: string): Promise<Pool> {
    try {
      // Calculate new metrics
      const [totalValue, positions] = await Promise.all([
        this.calculateTotalValue(poolId),
        this.getOpenPositions(poolId)
      ]);

      // Update pool
      const updated = await this.update(poolId, {
        totalValue,
        availableBalance: totalValue - positions.reduce((sum, pos) => sum + pos.size, 0)
      });

      // Invalidate related caches
      await this.invalidateCache(poolId, [
        this.generateCacheKey('metrics', poolId),
        this.generateCacheKey('details', poolId),
        this.generateCacheKey('active-metrics')
      ]);

      return updated;
    } catch (error) {
      throw new DatabaseError(
        `Failed to update pool metrics for ${poolId}`,
        'updatePoolMetrics',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create pool deposit
   */
  async createDeposit(
    poolId: string,
    userId: string,
    amount: number
  ): Promise<PoolDeposit> {
    // Validate pool exists and is active
    const pool = await this.findById(poolId);
    if (!pool) {
      throw new NotFoundError('Pool', poolId);
    }
    if (!pool.isActive) {
      throw new PoolError('Cannot deposit to inactive pool', poolId, 'INACTIVE');
    }

    return this.transaction(async (tx) => {
      // Calculate shares based on current pool value
      const totalValue = parseFloat(pool.totalValue.toString());
      const sharePrice = totalValue > 0 ? totalValue / 100 : 1; // 100 shares initial
      const shares = amount / sharePrice;

      // Create deposit
      const deposit = await tx.poolDeposit.create({
        data: {
          poolId,
          userId,
          amount,
          shares,
          currentValue: amount,
          unrealizedPnL: 0
        }
      });

      // Update pool totals
      await tx.pool.update({
        where: { id: poolId },
        data: {
          totalDeposits: { increment: amount },
          totalValue: { increment: amount },
          availableBalance: { increment: amount }
        }
      });

      return deposit;
    });
  }

  /**
   * Process withdrawal
   */
  async processWithdrawal(
    depositId: string,
    percentage?: number
  ): Promise<PoolDeposit> {
    const deposit = await this.prisma.poolDeposit.findUnique({
      where: { id: depositId },
      include: { pool: true }
    });

    if (!deposit) {
      throw new NotFoundError('Deposit', depositId);
    }

    if (deposit.withdrawnAt) {
      throw new DepositError('Deposit already withdrawn', depositId, 'ALREADY_WITHDRAWN');
    }

    return this.transaction(async (tx) => {
      const withdrawPercentage = percentage || 100;
      const sharePrice = parseFloat(deposit.pool.totalValue.toString()) / 100;
      const withdrawAmount = (parseFloat(deposit.shares.toString()) * sharePrice * withdrawPercentage) / 100;

      // Update deposit
      const updated = await tx.poolDeposit.update({
        where: { id: depositId },
        data: {
          withdrawnAt: withdrawPercentage === 100 ? new Date() : null,
          withdrawnAmount: withdrawAmount,
          shares: withdrawPercentage === 100 ? 0 : {
            decrement: (parseFloat(deposit.shares.toString()) * withdrawPercentage) / 100
          }
        }
      });

      // Update pool
      await tx.pool.update({
        where: { id: deposit.poolId },
        data: {
          totalValue: { decrement: withdrawAmount },
          availableBalance: { decrement: withdrawAmount }
        }
      });

      return updated;
    });
  }

  /**
   * Helper: Calculate total pool value
   */
  private async calculateTotalValue(poolId: string): Promise<number> {
    const [deposits, positions] = await Promise.all([
      this.prisma.poolDeposit.aggregate({
        where: { poolId, withdrawnAt: null },
        _sum: { currentValue: true }
      }),
      this.prisma.poolPosition.findMany({
        where: { poolId, closedAt: null },
        select: { size: true, unrealizedPnL: true }
      })
    ]);

    const depositValue = deposits._sum.currentValue || 0;
    const positionValue = positions.reduce(
      (sum, pos) => sum + pos.size + pos.unrealizedPnL,
      0
    );

    return Number(depositValue) + positionValue;
  }

  /**
   * Helper: Get open positions
   */
  private async getOpenPositions(poolId: string): Promise<PoolPosition[]> {
    return this.prisma.poolPosition.findMany({
      where: { poolId, closedAt: null }
    });
  }

  /**
   * Helper: Calculate metrics from trades
   */
  private calculateMetrics(trades: NPCTrade[]): PoolMetrics {
    if (trades.length === 0) {
      return {
        totalReturn: 0,
        absoluteReturn: 0,
        maxDrawdown: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        totalTrades: 0
      };
    }

    // Calculate P&L for each trade
    const profits = trades.map(t => {
      // Simplified P&L calculation - would need more complex logic in production
      return t.action === 'close' ? (t.price - t.amount) : 0;
    });

    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p < 0);

    return {
      totalReturn: profits.reduce((sum, p) => sum + p, 0),
      absoluteReturn: Math.abs(profits.reduce((sum, p) => sum + p, 0)),
      maxDrawdown: this.calculateMaxDrawdown(profits),
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      avgWin: wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? Math.abs(losses.reduce((sum, l) => sum + l, 0) / losses.length) : 0,
      totalTrades: trades.length
    };
  }

  /**
   * Helper: Calculate max drawdown
   */
  private calculateMaxDrawdown(profits: number[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let runningTotal = 0;

    for (const profit of profits) {
      runningTotal += profit;
      if (runningTotal > peak) {
        peak = runningTotal;
      }
      const drawdown = peak - runningTotal;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Helper: Get start date for period
   */
  private getStartDate(period: '1d' | '7d' | '30d' | '90d'): Date {
    const now = new Date();
    const days = period === '1d' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
}
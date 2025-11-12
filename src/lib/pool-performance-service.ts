/**
 * Pool Performance Service
 * 
 * Updates pool values, positions, and deposit values in real-time
 * Runs on every tick to keep P&L calculations accurate
 */

import { Prisma } from '@prisma/client';
import { getReadyPerpsEngine } from './perps-service';
import { prisma } from './prisma';
import { logger } from './logger';

export class PoolPerformanceService {
  /**
   * Update all active pools' performance metrics
   */
  static async updateAllPools(): Promise<void> {
    const activePools = await prisma.pool.findMany({
      where: { isActive: true },
      include: {
        PoolPosition: { where: { closedAt: null } },
        PoolDeposit: { where: { withdrawnAt: null } },
      },
    });

    for (const pool of activePools) {
      await this.updatePoolPerformance(pool.id);
    }

    logger.info(`Updated ${activePools.length} pools`, {}, 'PoolPerformanceService');
  }

  /**
   * Update a specific pool's performance
   */
  static async updatePoolPerformance(poolId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        include: {
          PoolPosition: { where: { closedAt: null } },
          PoolDeposit: { where: { withdrawnAt: null } },
        },
      });

      if (!pool) throw new Error(`Pool not found: ${poolId}`);

      // Update prediction market positions (perp positions are managed by engine)
      for (const position of pool.PoolPosition) {
        await this.updatePositionPnL(tx, position);
      }

      const dbPositions = await tx.poolPosition.findMany({
        where: { poolId, closedAt: null },
      });

      // Get fresh perp position data from engine (engine has real-time prices)
      // Sync engine to DB first to ensure DB is also up-to-date for this calculation
      const perpsEngine = await getReadyPerpsEngine();
      await perpsEngine.syncDirtyPositions().catch((error) => {
        // Log but don't fail - engine sync is best effort
        logger.warn(
          'Failed to sync engine positions before pool calculation',
          { poolId, error },
          'PoolPerformanceService'
        );
      });

      // Read from engine (most real-time source) for perp positions
      const positionsWithFreshPnL = await Promise.all(
        dbPositions.map(async (pos) => {
          if (pos.marketType === 'perp' && pos.ticker) {
            // Get position from engine (has latest price/PnL, now synced to DB too)
            const enginePosition = perpsEngine.getPosition(pos.id);
            if (enginePosition) {
              return {
                ...pos,
                unrealizedPnL: enginePosition.unrealizedPnL,
                currentPrice: enginePosition.currentPrice,
              };
            }
          }
          // For prediction markets or if not in engine, use DB values
          return pos;
        })
      );

      const availableBalance = parseFloat(pool.availableBalance.toString());
      const totalDeposits = parseFloat(pool.totalDeposits.toString());
      const positionsValue = positionsWithFreshPnL.reduce(
        (sum, pos) => sum + pos.size + pos.unrealizedPnL,
        0
      );
      const newTotalValue = availableBalance + positionsValue;
      const newLifetimePnL = newTotalValue - totalDeposits;

      await tx.pool.update({
        where: { id: poolId },
        data: {
          totalValue: new Prisma.Decimal(newTotalValue),
          lifetimePnL: new Prisma.Decimal(newLifetimePnL),
        },
      });

      if (pool.PoolDeposit.length > 0 && totalDeposits > 0) {
        const totalShares = pool.PoolDeposit.reduce((sum, d) => sum + parseFloat(d.shares.toString()), 0);
        const sharePrice = totalShares > 0 ? newTotalValue / totalShares : 1;

        for (const deposit of pool.PoolDeposit) {
          const shares = parseFloat(deposit.shares.toString());
          const originalAmount = parseFloat(deposit.amount.toString());
          const currentValue = shares * sharePrice;
          const unrealizedPnL = currentValue - originalAmount;

          await tx.poolDeposit.update({
            where: { id: deposit.id },
            data: {
              currentValue: new Prisma.Decimal(currentValue),
              unrealizedPnL: new Prisma.Decimal(unrealizedPnL),
            },
          });
        }
      }
    });
  }

  /**
   * Update a position's current price and P&L
   * Note: Perp positions are now managed by PerpetualsEngine and will be updated automatically.
   * This method only updates prediction market positions.
   */
  private static async updatePositionPnL(
    tx: Prisma.TransactionClient,
    position: {
      id: string
      marketType: string
      ticker: string | null
      marketId: string | null
      side: string
      entryPrice: number
      currentPrice: number
      size: number
      shares: number | null
      unrealizedPnL: number
    }
  ): Promise<void> {
    // Skip perp positions - they are managed by PerpetualsEngine
    // The engine syncs price updates to PoolPosition records automatically
    if (position.marketType === 'perp') {
      return;
    }

    let currentPrice = position.currentPrice;
    let unrealizedPnL = position.unrealizedPnL;

    if (position.marketType === 'prediction' && position.marketId) {
      const market = await tx.market.findFirst({
        where: { id: position.marketId, resolved: false },
        select: { yesShares: true, noShares: true },
      });

      if (market) {
        const totalShares = parseFloat(market.yesShares.toString()) + parseFloat(market.noShares.toString());
        if (totalShares > 0) {
          const yesPrice = parseFloat(market.yesShares.toString()) / totalShares * 100;
          const noPrice = parseFloat(market.noShares.toString()) / totalShares * 100;
          currentPrice = position.side === 'YES' ? yesPrice : noPrice;
          const priceChange = currentPrice - position.entryPrice;
          const shares = position.shares || 0;
          unrealizedPnL = (priceChange / 100) * shares;
        }
      }
    }

    await tx.poolPosition.update({
      where: { id: position.id },
      data: { currentPrice, unrealizedPnL },
    });
  }

  /**
   * Close a position (called when NPC sells or position is liquidated)
   */
  static async closePosition(positionId: string, closingPrice: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const position = await tx.poolPosition.findUnique({ where: { id: positionId } });
      if (!position) throw new Error(`Position not found: ${positionId}`);
      if (position.closedAt) throw new Error(`Position already closed: ${positionId}`);

      const priceChange = closingPrice - position.entryPrice;
      const isLong = position.side === 'long' || position.side === 'YES';
      const pnlMultiplier = isLong ? 1 : -1;
      
      let realizedPnL: number;
      if (position.marketType === 'perp') {
        const percentChange = priceChange / position.entryPrice;
        realizedPnL = percentChange * position.size * pnlMultiplier;
      } else {
        const shares = position.shares || 0;
        realizedPnL = (priceChange / 100) * shares;
      }

      await tx.poolPosition.update({
        where: { id: positionId },
        data: {
          closedAt: new Date(),
          currentPrice: closingPrice,
          unrealizedPnL: 0,
          realizedPnL,
        },
      });

      const returnAmount = position.size + realizedPnL;
      await tx.pool.update({
        where: { id: position.poolId },
        data: {
          availableBalance: { increment: returnAmount },
          lifetimePnL: { increment: realizedPnL },
        },
      });

      logger.info(`Position closed: ${positionId} with P&L: ${realizedPnL}`, {}, 'PoolPerformanceService');
    });
  }
}


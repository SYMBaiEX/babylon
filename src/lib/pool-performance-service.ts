/**
 * Pool Performance Service
 * 
 * Updates pool values, positions, and deposit values in real-time
 * Runs on every tick to keep P&L calculations accurate
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();

export class PoolPerformanceService {
  /**
   * Update all active pools' performance metrics
   */
  static async updateAllPools(): Promise<void> {
    try {
      const activePools = await prisma.pool.findMany({
        where: {
          isActive: true,
        },
        include: {
          positions: {
            where: {
              closedAt: null,
            },
          },
          deposits: {
            where: {
              withdrawnAt: null,
            },
          },
        },
      });

      for (const pool of activePools) {
        await this.updatePoolPerformance(pool.id);
      }

      logger.info(`Updated ${activePools.length} pools`, {}, 'PoolPerformanceService');
    } catch (error) {
      logger.error('Error updating pools:', error, 'PoolPerformanceService');
    }
  }

  /**
   * Update a specific pool's performance
   */
  static async updatePoolPerformance(poolId: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Get pool with positions
        const pool = await tx.pool.findUnique({
          where: { id: poolId },
          include: {
            positions: {
              where: { closedAt: null },
            },
            deposits: {
              where: { withdrawnAt: null },
            },
          },
        });

        if (!pool) return;

        // 2. Update each position's current price and P&L
        for (const position of pool.positions) {
          await this.updatePositionPnL(tx, position);
        }

        // 3. Recalculate pool totals
        const updatedPositions = await tx.poolPosition.findMany({
          where: {
            poolId,
            closedAt: null,
          },
        });

        const totalUnrealizedPnL = updatedPositions.reduce(
          (sum, pos) => sum + pos.unrealizedPnL,
          0
        );

        const availableBalance = parseFloat(pool.availableBalance.toString());
        const totalDeposits = parseFloat(pool.totalDeposits.toString());
        
        // Total value = available balance + sum of position sizes + unrealized P&L
        const positionsValue = updatedPositions.reduce(
          (sum, pos) => sum + pos.size + pos.unrealizedPnL,
          0
        );
        
        const newTotalValue = availableBalance + positionsValue;
        const newLifetimePnL = newTotalValue - totalDeposits;

        // 4. Update pool
        await tx.pool.update({
          where: { id: poolId },
          data: {
            totalValue: new Prisma.Decimal(newTotalValue),
            lifetimePnL: new Prisma.Decimal(newLifetimePnL),
          },
        });

        // 5. Update deposit values based on pool performance
        if (pool.deposits.length > 0 && totalDeposits > 0) {
          const totalShares = pool.deposits.reduce(
            (sum, d) => sum + parseFloat(d.shares.toString()),
            0
          );

          // Share price = total value / total shares
          const sharePrice = totalShares > 0 ? newTotalValue / totalShares : 1;

          for (const deposit of pool.deposits) {
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
    } catch (error) {
      logger.error(`Error updating pool ${poolId}:`, error, 'PoolPerformanceService');
    }
  }

  /**
   * Update a position's current price and P&L
   */
  private static async updatePositionPnL(tx: any, position: any): Promise<void> {
    try {
      let currentPrice = position.currentPrice;
      let unrealizedPnL = position.unrealizedPnL;

      if (position.marketType === 'perp' && position.ticker) {
        // Get current market price for perps
        const org = await tx.organization.findFirst({
          where: {
            id: {
              contains: position.ticker.toLowerCase(),
            },
          },
          select: { currentPrice: true },
        });

        if (org?.currentPrice) {
          currentPrice = org.currentPrice;

          // Calculate P&L based on position side
          const priceChange = currentPrice - position.entryPrice;
          const isLong = position.side === 'long';
          const pnlMultiplier = isLong ? 1 : -1;
          
          // P&L = (price change / entry price) * position size * direction
          const percentChange = priceChange / position.entryPrice;
          unrealizedPnL = percentChange * position.size * pnlMultiplier;
        }
      } else if (position.marketType === 'prediction' && position.marketId) {
        // Get current odds for predictions
        const market = await tx.market.findFirst({
          where: {
            id: position.marketId,
            resolved: false,
          },
          select: {
            yesShares: true,
            noShares: true,
          },
        });

        if (market) {
          const totalShares = parseFloat(market.yesShares.toString()) + 
                            parseFloat(market.noShares.toString());
          
          if (totalShares > 0) {
            const yesPrice = parseFloat(market.yesShares.toString()) / totalShares * 100;
            const noPrice = parseFloat(market.noShares.toString()) / totalShares * 100;
            
            currentPrice = position.side === 'YES' ? yesPrice : noPrice;
            
            // Calculate P&L based on price movement
            const priceChange = currentPrice - position.entryPrice;
            const shares = position.shares || 0;
            unrealizedPnL = (priceChange / 100) * shares;
          }
        }
      }

      // Update position
      await tx.poolPosition.update({
        where: { id: position.id },
        data: {
          currentPrice,
          unrealizedPnL,
        },
      });
    } catch (error) {
      logger.error('Error updating position P&L:', error, 'PoolPerformanceService');
    }
  }

  /**
   * Close a position (called when NPC sells or position is liquidated)
   */
  static async closePosition(positionId: string, closingPrice: number): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        const position = await tx.poolPosition.findUnique({
          where: { id: positionId },
        });

        if (!position || position.closedAt) return;

        // Calculate final P&L
        const priceChange = closingPrice - position.entryPrice;
        const isLong = position.side === 'long' || position.side === 'YES';
        const pnlMultiplier = isLong ? 1 : -1;
        
        let realizedPnL: number;
        if (position.marketType === 'perp') {
          const percentChange = priceChange / position.entryPrice;
          realizedPnL = percentChange * position.size * pnlMultiplier;
        } else {
          // Prediction markets
          const shares = position.shares || 0;
          realizedPnL = (priceChange / 100) * shares;
        }

        // Close the position
        await tx.poolPosition.update({
          where: { id: positionId },
          data: {
            closedAt: new Date(),
            currentPrice: closingPrice,
            unrealizedPnL: 0,
            realizedPnL,
          },
        });

        // Return funds + P&L to pool available balance
        const returnAmount = position.size + realizedPnL;

        await tx.pool.update({
          where: { id: position.poolId },
          data: {
            availableBalance: {
              increment: returnAmount,
            },
            lifetimePnL: {
              increment: realizedPnL,
            },
          },
        });

        logger.info(`Position closed: ${positionId} with P&L: ${realizedPnL}`, {}, 'PoolPerformanceService');
      });
    } catch (error) {
      logger.error(`Error closing position ${positionId}:`, error, 'PoolPerformanceService');
    }
  }
}


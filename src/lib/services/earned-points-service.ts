/**
 * Earned Points Service
 * 
 * @description Converts P&L from trading into earned points. Provides methods
 * for calculating points from P&L, syncing earned points, and awarding incremental
 * points for trades.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateSnowflakeId } from '@/lib/snowflake'

/**
 * Earned Points Service Class
 * 
 * @description Static service class for managing earned points from trading P&L.
 * Provides methods for converting P&L to points and syncing earned points.
 */
export class EarnedPointsService {
  /**
   * Convert P&L to earned points
   * 
   * @description Converts trading P&L to earned points using formula: 1 point
   * per $10 of realized P&L. Minimum is -100 points to limit downside risk and
   * encourage trading.
   * 
   * Formula: 1 point per $10 of realized P&L
   * Minimum: -100 points (can't go below -100)
   * 
   * @param {number} pnl - Profit and loss amount
   * @returns {number} Earned points (capped at -100 minimum)
   * 
   * @example
   * ```typescript
   * const points = EarnedPointsService.pnlToPoints(100); // Returns: 10
   * const negative = EarnedPointsService.pnlToPoints(-2000); // Returns: -100 (capped)
   * ```
   */
  static pnlToPoints(pnl: number): number {
    const points = Math.floor(pnl / 10)
    // Cap negative points at -100 to avoid extreme penalties
    return Math.max(points, -100)
  }

  /**
   * Update earned points based on current lifetime P&L
   * 
   * @description Recalculates earned points from scratch based on lifetimePnL.
   * Updates user's earned points and total reputation points. Only updates if
   * earned points have changed.
   * 
   * @param {string} userId - User ID to sync points for
   * @returns {Promise<void>}
   * @throws {Error} If user not found
   */
  static async syncEarnedPointsFromPnL(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lifetimePnL: true,
        earnedPoints: true,
        invitePoints: true,
        bonusPoints: true,
        reputationPoints: true,
      },
    })

    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    const lifetimePnL = Number(user.lifetimePnL)
    const newEarnedPoints = this.pnlToPoints(lifetimePnL)

    // Only update if earned points have changed
    if (newEarnedPoints === user.earnedPoints) {
      return
    }

    // Calculate new total reputation points
    // Total = Invite Points + Earned Points + Bonus Points + Base (100)
    const basePoints = 100
    const newReputationPoints = basePoints + user.invitePoints + newEarnedPoints + user.bonusPoints

    await prisma.user.update({
      where: { id: userId },
      data: {
        earnedPoints: newEarnedPoints,
        reputationPoints: newReputationPoints,
      },
    })

    logger.info('Updated earned points from P&L', {
      userId,
      lifetimePnL,
      earnedPoints: newEarnedPoints,
      totalPoints: newReputationPoints,
    }, 'EarnedPointsService')
  }

  /**
   * Award earned points for a specific P&L amount (for incremental updates)
   * 
   * @description Awards earned points incrementally when recording a trade's P&L.
   * Calculates the difference between previous and new P&L and updates earned
   * points accordingly. Creates a points transaction record.
   * 
   * Use this when recording a trade's P&L for incremental updates.
   * 
   * @param {string} userId - User ID
   * @param {number} newLifetimePnL - New lifetime P&L (after this trade)
   * @param {string} tradeType - Type of trade (for transaction record)
   * @param {string} [relatedId] - Optional related entity ID (trade ID, etc.)
   * @param {Prisma.TransactionClient} [tx] - Optional transaction client for atomic operations
   * @returns {Promise<number>} Points awarded (can be negative)
   * @throws {Error} If user not found
   */
  static async awardEarnedPointsForPnL(
    userId: string,
    newLifetimePnL: number,
    tradeType: string,
    relatedId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const db = tx || prisma
    const computedEarnedPoints = this.pnlToPoints(newLifetimePnL)

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        earnedPoints: true,
        invitePoints: true,
        bonusPoints: true,
        reputationPoints: true,
        lifetimePnL: true,
      },
    })

    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    const currentEarnedPoints = user.earnedPoints
    const storedLifetimePnL = Number(user.lifetimePnL)

    // Compute what earnedPoints should be based on the NEW lifetimePnL
    // The newLifetimePnL was already written to the DB in the same transaction
    // so storedLifetimePnL should equal newLifetimePnL
    const earnedPointsDelta = computedEarnedPoints - currentEarnedPoints

    // Log if there was a pre-existing mismatch (for monitoring purposes)
    // This can happen if points got out of sync due to previous bugs
    const expectedPointsFromPreviousPnL = this.pnlToPoints(storedLifetimePnL - (newLifetimePnL - storedLifetimePnL))
    if (expectedPointsFromPreviousPnL !== currentEarnedPoints && storedLifetimePnL !== newLifetimePnL) {
      // Note: storedLifetimePnL should == newLifetimePnL since we're in the same tx
      // If they differ, something unexpected happened
      logger.warn('Earned points may have been out of sync (auto-correcting)', {
        userId,
        storedLifetimePnL,
        newLifetimePnL,
        currentEarnedPoints,
        computedNewPoints: computedEarnedPoints,
      }, 'EarnedPointsService')
    }

    if (earnedPointsDelta === 0) {
      return 0
    }

    const newEarnedPoints = computedEarnedPoints
    const basePoints = 100
    const newReputationPoints = basePoints + user.invitePoints + newEarnedPoints + user.bonusPoints

    // Update user and create transaction
    await db.user.update({
      where: { id: userId },
      data: {
        earnedPoints: newEarnedPoints,
        reputationPoints: newReputationPoints,
      },
    })

    await db.pointsTransaction.create({
      data: {
        id: await generateSnowflakeId(),
        userId,
        amount: earnedPointsDelta,
        pointsBefore: user.reputationPoints,
        pointsAfter: newReputationPoints,
        reason: 'trading_pnl',
        metadata: JSON.stringify({
          tradeType,
          relatedId,
          storedLifetimePnL,
          newLifetimePnL,
          previousEarnedPoints: currentEarnedPoints,
          newEarnedPoints,
          earnedPointsDelta,
        }),
      },
    })

    logger.info('Awarded earned points for P&L', {
      userId,
      storedLifetimePnL,
      newLifetimePnL,
      earnedPointsDelta,
      totalEarnedPoints: newEarnedPoints,
      totalReputationPoints: newReputationPoints,
    }, 'EarnedPointsService')

    return earnedPointsDelta
  }

  /**
   * Bulk sync earned points for all users
   * Useful for migration or recalculation
   * Note: Individual user errors are caught to allow continuation
   */
  static async bulkSyncAllUsers(): Promise<{ success: number; errors: number }> {
    const users = await prisma.user.findMany({
      where: { isActor: false },
      select: { id: true },
    })

    logger.info(`Syncing earned points for ${users.length} users`, {}, 'EarnedPointsService')

    let successCount = 0
    const errorCount = 0

    for (const user of users) {
      await this.syncEarnedPointsFromPnL(user.id)
      successCount++
    }

    logger.info(`Bulk sync complete`, {
      total: users.length,
      success: successCount,
      errors: errorCount,
    }, 'EarnedPointsService')

    return { success: successCount, errors: errorCount }
  }
}


/**
 * Virtual Wallet Service
 * 
 * @description Manages user's virtual USD balance for trading. Provides
 * methods for checking balances, debiting/crediting funds, and tracking
 * transaction history. All users start with $1,000 virtual balance.
 * 
 * Features:
 * - Starting balance: $1,000
 * - Tracks all transactions
 * - Validates sufficient funds
 * - Calculates PnL
 */
import type { PrismaClient, Prisma } from '@prisma/client';

import { cachedDb } from '@/lib/cached-database-service';
// import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { EarnedPointsService } from '@/lib/services/earned-points-service';
import { generateSnowflakeId } from '@/lib/snowflake';

/**
 * User balance information
 * 
 * @description Contains current balance and lifetime statistics.
 */
export interface BalanceInfo {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lifetimePnL: number;
}

/**
 * Transaction history item
 * 
 * @description Represents a single balance transaction with before/after
 * balances and metadata.
 */
export interface TransactionHistoryItem {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  relatedId: string | null;
  createdAt: Date;
}

/**
 * Wallet Service Class
 * 
 * @description Static service class for managing user virtual balances.
 * Provides methods for checking balances, debiting/crediting funds, and
 * retrieving transaction history.
 */
export class WalletService {
  /**
   * Starting balance for new users ($1,000 USD)
   * 
   * @private
   */
  private static readonly STARTING_BALANCE = 1000; // $1,000 USD

  /**
   * Apply balance change atomically
   * 
   * @description Internal method to apply a balance change and create a
   * transaction record. Used by debit and credit methods.
   * 
   * @param {Prisma.TransactionClient} tx - Prisma transaction client
   * @param {string} userId - User ID
   * @param {number} delta - Amount to change (positive for credit, negative for debit)
   * @param {string} type - Transaction type identifier
   * @param {string} description - Transaction description
   * @param {string} [relatedId] - Optional related entity ID
   * @returns {Promise<void>}
   * @private
   */
  private static async applyBalanceChange(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: number,
    type: string,
    description: string,
    relatedId?: string
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { virtualBalance: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const currentBalance = Number(user.virtualBalance);
    const newBalance = currentBalance + delta;

    await tx.user.update({
      where: { id: userId },
      data: {
        virtualBalance: newBalance,
      },
    });

    await tx.balanceTransaction.create({
      data: {
        id: await generateSnowflakeId(),
        userId,
        type,
        amount: delta,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        relatedId: relatedId || null,
        description,
      },
    });
  }

  /**
   * Get user's current balance
   * 
   * @description Retrieves user's current balance and lifetime statistics.
   * 
   * @param {string} userId - User ID
   * @returns {Promise<BalanceInfo>} Balance information
   * @throws {Error} If user not found
   * 
   * @example
   * ```typescript
   * const balance = await WalletService.getBalance(userId);
   * console.log(`Balance: $${balance.balance}`);
   * ```
   */
  static async getBalance(userId: string): Promise<BalanceInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        virtualBalance: true,
        totalDeposited: true,
        totalWithdrawn: true,
        lifetimePnL: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      balance: Number(user.virtualBalance),
      totalDeposited: Number(user.totalDeposited),
      totalWithdrawn: Number(user.totalWithdrawn),
      lifetimePnL: Number(user.lifetimePnL),
    };
  }

  /**
   * Check if user has sufficient balance
   * 
   * @description Checks if user has enough balance for a transaction.
   * 
   * @param {string} userId - User ID
   * @param {number} requiredAmount - Required amount
   * @returns {Promise<boolean>} True if user has sufficient balance
   * 
   * @example
   * ```typescript
   * if (await WalletService.hasSufficientBalance(userId, 100)) {
   *   // Proceed with transaction
   * }
   * ```
   */
  static async hasSufficientBalance(
    userId: string,
    requiredAmount: number
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { virtualBalance: true },
    });

    if (!user) {
      return false;
    }

    return Number(user.virtualBalance) >= requiredAmount;
  }

  /**
   * Debit from user's balance (opening position, buying shares)
   * 
   * @description Debits an amount from user's balance. Used when opening
   * positions or buying shares. Creates a transaction record.
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Amount to debit
   * @param {string} type - Transaction type identifier
   * @param {string} description - Transaction description
   * @param {string} [relatedId] - Optional related entity ID
   * @param {Prisma.TransactionClient} [tx] - Optional transaction client for atomic operations
   * @returns {Promise<void>}
   * @throws {Error} If user not found or insufficient balance
   * 
   * @example
   * ```typescript
   * await WalletService.debit(userId, 100, 'pred_buy', 'Buying shares', tradeId);
   * ```
   */
  static async debit(
    userId: string,
    amount: number,
    type: string,
    description: string,
    relatedId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const delta = -amount;

    if (tx) {
      await this.applyBalanceChange(tx, userId, delta, type, description, relatedId);
    } else {
      await prisma.$transaction(async (transaction) => {
        await this.applyBalanceChange(transaction, userId, delta, type, description, relatedId);
      });
    }

    await cachedDb.invalidateUserCache(userId);
  }

  /**
   * Credit to user's balance (closing position with profit, payouts)
   */
  static async credit(
    userId: string,
    amount: number,
    type: string,
    description: string,
    relatedId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    if (tx) {
      await this.applyBalanceChange(tx, userId, amount, type, description, relatedId);
    } else {
      await prisma.$transaction(async (transaction) => {
        await this.applyBalanceChange(transaction, userId, amount, type, description, relatedId);
      });
    }

    await cachedDb.invalidateUserCache(userId);
  }

  /**
   * Record PnL (update lifetime PnL and earned points)
   */
  static async recordPnL(
    userId: string,
    pnl: number,
    tradeType: string,
    relatedId?: string
  ): Promise<{
    previousLifetimePnL: number;
    newLifetimePnL: number;
    earnedPointsDelta: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const previousLifetimePnL = Number(user.lifetimePnL);
    const newLifetimePnL = previousLifetimePnL + pnl;

    await prisma.user.update({
      where: { id: userId },
      data: {
        lifetimePnL: newLifetimePnL,
      },
    });

    const earnedPointsDelta = await EarnedPointsService.awardEarnedPointsForPnL(
      userId,
      previousLifetimePnL,
      newLifetimePnL,
      tradeType,
      relatedId
    );

    return {
      previousLifetimePnL,
      newLifetimePnL,
      earnedPointsDelta,
    };
  }

  /**
   * Get transaction history
   */
  static async getTransactionHistory(
    userId: string,
    limit: number = 50
  ): Promise<TransactionHistoryItem[]> {
    const transactions = await prisma.balanceTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    type TransactionType = typeof transactions[0];
    return transactions.map((tx: TransactionType) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      balanceBefore: Number(tx.balanceBefore),
      balanceAfter: Number(tx.balanceAfter),
      description: tx.description,
      relatedId: tx.relatedId,
      createdAt: tx.createdAt,
    }));
  }

  /**
   * Initialize user balance (for new users)
   */
  static async initializeBalance(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (Number(user.virtualBalance) === 0) {
      await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            virtualBalance: this.STARTING_BALANCE,
            totalDeposited: this.STARTING_BALANCE,
          },
        });

        await tx.balanceTransaction.create({
          data: {
            id: await generateSnowflakeId(),
            userId,
            type: 'deposit',
            amount: this.STARTING_BALANCE,
            balanceBefore: 0,
            balanceAfter: this.STARTING_BALANCE,
            description: 'Initial deposit - Welcome to Babylon!',
          },
        });
      });
    }
  }
}

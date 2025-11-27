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

import {
  balanceTransactions,
  db,
  desc,
  eq,
  type Transaction,
  users,
  withTransaction,
} from '@/db';
import { cachedDb } from '@/lib/cached-database-service';
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
   * @param {Transaction} tx - Drizzle transaction client
   * @param {string} userId - User ID
   * @param {number} delta - Amount to change (positive for credit, negative for debit)
   * @param {string} type - Transaction type identifier
   * @param {string} description - Transaction description
   * @param {string} [relatedId] - Optional related entity ID
   * @returns {Promise<void>}
   * @private
   */
  private static async applyBalanceChange(
    tx: Transaction,
    userId: string,
    delta: number,
    type: string,
    description: string,
    relatedId?: string
  ): Promise<void> {
    const result = await tx
      .select({
        virtualBalance: users.virtualBalance,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [user] = result;
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const currentBalance = Number(user.virtualBalance);
    const newBalance = currentBalance + delta;

    await tx
      .update(users)
      .set({ virtualBalance: String(newBalance) })
      .where(eq(users.id, userId));

    await tx.insert(balanceTransactions).values({
      id: await generateSnowflakeId(),
      userId,
      type,
      amount: String(delta),
      balanceBefore: String(currentBalance),
      balanceAfter: String(newBalance),
      relatedId: relatedId ?? null,
      description,
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
    const result = await db
      .select({
        virtualBalance: users.virtualBalance,
        totalDeposited: users.totalDeposited,
        totalWithdrawn: users.totalWithdrawn,
        lifetimePnL: users.lifetimePnL,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [user] = result;
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
    const result = await db
      .select({
        virtualBalance: users.virtualBalance,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [user] = result;
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
   * @param {Transaction} [tx] - Optional transaction client for atomic operations
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
    tx?: Transaction
  ): Promise<void> {
    const delta = -amount;

    if (tx) {
      await WalletService.applyBalanceChange(
        tx,
        userId,
        delta,
        type,
        description,
        relatedId
      );
    } else {
      await withTransaction(async (transaction) => {
        await WalletService.applyBalanceChange(
          transaction,
          userId,
          delta,
          type,
          description,
          relatedId
        );
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
    tx?: Transaction
  ): Promise<void> {
    if (tx) {
      await WalletService.applyBalanceChange(
        tx,
        userId,
        amount,
        type,
        description,
        relatedId
      );
    } else {
      await withTransaction(async (transaction) => {
        await WalletService.applyBalanceChange(
          transaction,
          userId,
          amount,
          type,
          description,
          relatedId
        );
      });
    }

    await cachedDb.invalidateUserCache(userId);
  }

  /**
   * Record PnL (update lifetime PnL and earned points)
   *
   * Uses a transaction to atomically update both lifetimePnL and earnedPoints
   * to prevent race conditions that could cause sync issues.
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
    return await withTransaction(async (tx) => {
      const result = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const [user] = result;
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const previousLifetimePnL = Number(user.lifetimePnL);
      const newLifetimePnL = previousLifetimePnL + pnl;

      // Update lifetimePnL first within the transaction
      await tx
        .update(users)
        .set({ lifetimePnL: String(newLifetimePnL) })
        .where(eq(users.id, userId));

      // Now award earned points within the same transaction
      // This ensures atomicity and prevents race conditions
      const earnedPointsDelta =
        await EarnedPointsService.awardEarnedPointsForPnL(
          userId,
          newLifetimePnL,
          tradeType,
          relatedId,
          tx
        );

      return {
        previousLifetimePnL,
        newLifetimePnL,
        earnedPointsDelta,
      };
    });
  }

  /**
   * Get transaction history
   */
  static async getTransactionHistory(
    userId: string,
    limit = 50
  ): Promise<TransactionHistoryItem[]> {
    const transactions = await db
      .select()
      .from(balanceTransactions)
      .where(eq(balanceTransactions.userId, userId))
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(limit);

    return transactions.map((tx) => ({
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
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [user] = result;
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (Number(user.virtualBalance) === 0) {
      await withTransaction(async (tx) => {
        await tx
          .update(users)
          .set({
            virtualBalance: String(WalletService.STARTING_BALANCE),
            totalDeposited: String(WalletService.STARTING_BALANCE),
          })
          .where(eq(users.id, userId));

        await tx.insert(balanceTransactions).values({
          id: await generateSnowflakeId(),
          userId,
          type: 'deposit',
          amount: String(WalletService.STARTING_BALANCE),
          balanceBefore: '0',
          balanceAfter: String(WalletService.STARTING_BALANCE),
          description: 'Initial deposit - Welcome to Babylon!',
        });
      });
    }
  }
}

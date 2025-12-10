/**
 * NPC Wallet Adapter
 *
 * Wraps actorState table operations to implement WalletPort interface.
 * This allows NPC trades to use the core PerpMarketService while
 * managing balances in the actorState table.
 */
import type { WalletPort } from '@babylon/core/markets/shared';
import { actorState, db as defaultDb, eq, type Transaction } from '@babylon/db';

type DbClient = typeof defaultDb | Transaction;

/**
 * Creates a WalletPort implementation for NPC actors.
 * Uses actorState.tradingBalance instead of user wallets.
 */
export function createNpcWalletAdapter(
  actorId: string,
  dbClient?: DbClient
): WalletPort {
  const db = dbClient ?? defaultDb;

  return {
    async debit({ amount, reason }: { amount: number; reason: string }) {
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, actorId))
        .limit(1);

      if (!actor) {
        throw new Error(`Actor not found: ${actorId}`);
      }

      const currentBalance = Number(actor.tradingBalance);
      if (currentBalance < amount) {
        throw new Error(
          `Insufficient trading balance: ${currentBalance.toFixed(2)} < ${amount.toFixed(2)} (${reason})`
        );
      }

      await db
        .update(actorState)
        .set({
          tradingBalance: String(currentBalance - amount),
          updatedAt: new Date(),
        })
        .where(eq(actorState.id, actorId));
    },

    async credit({ amount }: { amount: number }) {
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, actorId))
        .limit(1);

      if (!actor) {
        throw new Error(`Actor not found: ${actorId}`);
      }

      const currentBalance = Number(actor.tradingBalance);

      await db
        .update(actorState)
        .set({
          tradingBalance: String(currentBalance + amount),
          updatedAt: new Date(),
        })
        .where(eq(actorState.id, actorId));
    },

    async recordPnL({ pnl, reason }: { pnl: number; reason: string }) {
      // For NPCs, we just update the trading balance directly
      // No separate PnL tracking like user wallets
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, actorId))
        .limit(1);

      if (!actor) {
        throw new Error(`Actor not found: ${actorId}`);
      }

      // Log PnL for debugging but don't modify balance here
      // (credit/debit already handles the balance changes)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[NPC PnL] ${actorId}: ${pnl.toFixed(2)} (${reason})`);
      }
    },

    async getBalance() {
      const [actor] = await db
        .select({ tradingBalance: actorState.tradingBalance })
        .from(actorState)
        .where(eq(actorState.id, actorId))
        .limit(1);

      if (!actor) {
        return { balance: 0 };
      }

      return { balance: Number(actor.tradingBalance) };
    },
  };
}

/**
 * Total Points Service
 *
 * Manages the `totalPoints` column on the User table.
 * totalPoints = wallet + positions (excludes agents).
 */

import { PredictionPricing } from '@babylon/core/markets/prediction';
import {
  db,
  markets,
  perpPositions,
  positions,
  userPointsSnapshots,
  users,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { FEE_CONFIG } from '../config/fees';

// ---------------------------------------------------------------------------
// Helpers (mirrored from portfolio-breakdown.ts)
// ---------------------------------------------------------------------------

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clampFeeRate(rate: number): number {
  return rate > 0 && rate < 1 ? rate : 0;
}

function calculatePerpPositionValue(position: {
  size: unknown;
  leverage: unknown;
  unrealizedPnL: unknown;
}): number {
  const size = toNumber(position.size);
  const leverage = toNumber(position.leverage);
  const unrealizedPnL = toNumber(position.unrealizedPnL);

  const effectiveLeverage =
    Number.isFinite(leverage) && leverage > 0 ? leverage : 1;
  const margin = Math.abs(size / effectiveLeverage);
  return margin + unrealizedPnL;
}

function calculatePredictionPositionValue(position: {
  shares: unknown;
  avgPrice: unknown;
  side: boolean | null;
  marketYesShares: unknown;
  marketNoShares: unknown;
}): number {
  const shares = toNumber(position.shares);
  const avgPrice = toNumber(position.avgPrice);

  const yesShares = toNumber(position.marketYesShares);
  const noShares = toNumber(position.marketNoShares);

  const feeRate = clampFeeRate(FEE_CONFIG.TRADING_FEE_RATE);
  const costBasisNet = shares * avgPrice;
  const costBasis = feeRate > 0 ? costBasisNet / (1 - feeRate) : costBasisNet;

  if (shares <= 0 || yesShares <= 0 || noShares <= 0) {
    return costBasis;
  }

  const sideKey = position.side ? 'yes' : 'no';
  const sellPreview = PredictionPricing.calculateSellWithFees(
    yesShares,
    noShares,
    sideKey,
    shares,
    feeRate
  );

  return sellPreview.netProceeds ?? sellPreview.totalCost;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const TotalPointsService = {
  /**
   * Recompute totalPoints for a single user.
   * totalPoints = wallet + open position values (perps + predictions).
   * Only the user's own positions are included (not agent positions).
   */
  async recomputeTotalPoints(userId: string): Promise<number> {
    const userResult = await db
      .select({ virtualBalance: users.virtualBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];
    if (!user) {
      logger.warn('recomputeTotalPoints: user not found', { userId }, 'TotalPointsService');
      return 0;
    }

    const wallet = toNumber(user.virtualBalance);

    const [perpRows, predictionRows] = await Promise.all([
      db
        .select({
          size: perpPositions.size,
          leverage: perpPositions.leverage,
          unrealizedPnL: perpPositions.unrealizedPnL,
        })
        .from(perpPositions)
        .where(
          and(eq(perpPositions.userId, userId), isNull(perpPositions.closedAt))
        ),
      db
        .select({
          shares: positions.shares,
          avgPrice: positions.avgPrice,
          side: positions.side,
          marketYesShares: markets.yesShares,
          marketNoShares: markets.noShares,
        })
        .from(positions)
        .innerJoin(markets, eq(positions.marketId, markets.id))
        .where(and(eq(positions.userId, userId), eq(markets.resolved, false))),
    ]);

    const perpsValue = perpRows.reduce(
      (sum, p) => sum + calculatePerpPositionValue(p),
      0
    );

    const predictionsValue = predictionRows.reduce(
      (sum, p) =>
        sum +
        calculatePredictionPositionValue({
          shares: p.shares,
          avgPrice: p.avgPrice,
          side: p.side,
          marketYesShares: p.marketYesShares,
          marketNoShares: p.marketNoShares,
        }),
      0
    );

    const totalPoints = wallet + perpsValue + predictionsValue;

    await db
      .update(users)
      .set({ totalPoints: totalPoints.toFixed(2) })
      .where(eq(users.id, userId));

    return totalPoints;
  },

  /**
   * Mark a user's totalPoints as dirty (needing recompute).
   * Called instead of immediate recompute on balance/position changes.
   */
  async markDirty(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ totalPointsDirtyAt: new Date() })
      .where(eq(users.id, userId));
  },

  /**
   * Snapshot all non-agent, non-actor users' current totalPoints
   * into the userPointsSnapshots table.
   */
  async snapshotAllUsers(): Promise<number> {
    const allUsers = await db
      .select({ id: users.id, totalPoints: users.totalPoints })
      .from(users)
      .where(and(eq(users.isAgent, false), eq(users.isActor, false)));

    const now = new Date();
    const BATCH_SIZE = 500;

    for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
      const batch = allUsers.slice(i, i + BATCH_SIZE);
      const rows = await Promise.all(
        batch.map(async (user) => ({
          id: await generateSnowflakeId(),
          userId: user.id,
          totalPoints: user.totalPoints ?? '0',
          snapshotDate: now,
          period: 'daily' as const,
        }))
      );
      await db.insert(userPointsSnapshots).values(rows);
    }

    return allUsers.length;
  },

  /**
   * Recompute totalPoints only for users marked dirty.
   * Called by the 15-min cron job for incremental updates.
   */
  async recomputeDirtyUsers(): Promise<number> {
    const cutoff = new Date();
    const dirtyUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(isNotNull(users.totalPointsDirtyAt));

    const BATCH_SIZE = 100;
    let processed = 0;

    for (let i = 0; i < dirtyUsers.length; i += BATCH_SIZE) {
      const batch = dirtyUsers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (user) => {
          await TotalPointsService.recomputeTotalPoints(user.id);
          // Only clear flag if it wasn't re-dirtied after we started
          await db
            .update(users)
            .set({ totalPointsDirtyAt: null })
            .where(
              and(eq(users.id, user.id), lte(users.totalPointsDirtyAt, cutoff))
            );
        })
      );
      processed += batch.length;
    }

    return processed;
  },
};

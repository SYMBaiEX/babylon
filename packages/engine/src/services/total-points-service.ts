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
  whitelist,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
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
  try {
    const sellPreview = PredictionPricing.calculateSellWithFees(
      yesShares,
      noShares,
      sideKey,
      shares,
      feeRate
    );
    return sellPreview.netProceeds ?? sellPreview.totalCost;
  } catch {
    // Fall back to cost basis when sell preview fails (e.g. negative proceeds)
    return costBasis;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * When true, batch operations (backfill, self-heal, snapshots) are scoped to
 * active Whitelist entries only. Set POINTS_WHITELIST_ONLY=false (or remove it)
 * to process ALL users (for open registration).
 *
 * Per-user operations (recomputeTotalPoints, markDirty, recomputeDirtyUsers)
 * are always unscoped — they only touch users explicitly flagged dirty.
 */
function isWhitelistOnly(): boolean {
  return process.env.POINTS_WHITELIST_ONLY !== 'false';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const TotalPointsService = {
  /**
   * Recompute totalPoints for a single user.
   * totalPoints = wallet + open positions + reputationPoints.
   * Only the user's own positions are included (not agent positions).
   */
  async recomputeTotalPoints(userId: string): Promise<number> {
    const userResult = await db
      .select({
        id: users.id,
        privyId: users.privyId,
        virtualBalance: users.virtualBalance,
        reputationPoints: users.reputationPoints,
      })
      .from(users)
      .where(or(eq(users.id, userId), eq(users.privyId, userId)))
      .limit(1);

    const user = userResult[0];
    if (!user) {
      logger.warn(
        'recomputeTotalPoints: user not found',
        { userId },
        'TotalPointsService'
      );
      return 0;
    }

    const wallet = toNumber(user.virtualBalance);
    const reputation = user.reputationPoints;
    const canonicalUserId = user.id;
    const positionUserIds = Array.from(
      new Set([canonicalUserId, user.privyId].filter(Boolean))
    ) as string[];

    const [perpRows, predictionRows] = await Promise.all([
      db
        .select({
          size: perpPositions.size,
          leverage: perpPositions.leverage,
          unrealizedPnL: perpPositions.unrealizedPnL,
        })
        .from(perpPositions)
        .where(
          and(
            inArray(perpPositions.userId, positionUserIds),
            isNull(perpPositions.closedAt)
          )
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
        .where(
          and(
            inArray(positions.userId, positionUserIds),
            eq(markets.resolved, false),
            gt(positions.shares, '0')
          )
        ),
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

    const totalPoints = wallet + perpsValue + predictionsValue + reputation;

    await db
      .update(users)
      .set({ totalPoints: totalPoints.toFixed(2) })
      .where(eq(users.id, canonicalUserId));

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
      .where(or(eq(users.id, userId), eq(users.privyId, userId)));
  },

  /**
   * Backfill helper: mark users with totalPoints=0 as dirty, so the cron can
   * recompute them incrementally.
   * When POINTS_WHITELIST_ONLY !== 'false', scoped to active whitelist entries.
   */
  async markZeroTotalPointsDirty(batchSize = 5000): Promise<number> {
    const safeBatchSize = Math.min(Math.max(1, batchSize), 10_000);
    const baseWhere = and(
      eq(users.isAgent, false),
      eq(users.isActor, false),
      eq(users.totalPoints, '0'),
      isNull(users.totalPointsDirtyAt)
    );

    let candidates: { id: string }[];
    if (isWhitelistOnly()) {
      candidates = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          whitelist,
          and(eq(whitelist.userId, users.id), isNull(whitelist.revokedAt))
        )
        .where(baseWhere)
        .orderBy(users.id)
        .limit(safeBatchSize);
    } else {
      candidates = await db
        .select({ id: users.id })
        .from(users)
        .where(baseWhere)
        .orderBy(users.id)
        .limit(safeBatchSize);
    }

    if (candidates.length === 0) return 0;

    const ids = candidates.map((c) => c.id);
    await db
      .update(users)
      .set({ totalPointsDirtyAt: new Date() })
      .where(inArray(users.id, ids));

    return candidates.length;
  },

  /**
   * Snapshot users' current totalPoints into the userPointsSnapshots table.
   * When POINTS_WHITELIST_ONLY !== 'false', scoped to active whitelist entries.
   */
  async snapshotAllUsers(): Promise<number> {
    const now = new Date();
    const BATCH_SIZE = 500;
    let processed = 0;
    let lastId: string | null = null;
    const wlOnly = isWhitelistOnly();

    // Cursor-based pagination: fetch BATCH_SIZE at a time, ordered by id
    while (true) {
      const cursorFilter = lastId ? gt(users.id, lastId) : undefined;

      // Use separate query builders to avoid drizzle type mismatch with
      // conditional .innerJoin() (join changes the builder generic).
      let batch: { id: string; totalPoints: string | null }[];
      if (wlOnly) {
        batch = await db
          .select({ id: users.id, totalPoints: users.totalPoints })
          .from(users)
          .innerJoin(
            whitelist,
            and(eq(whitelist.userId, users.id), isNull(whitelist.revokedAt))
          )
          .where(
            and(
              eq(users.isAgent, false),
              eq(users.isActor, false),
              cursorFilter
            )
          )
          .orderBy(users.id)
          .limit(BATCH_SIZE);
      } else {
        batch = await db
          .select({ id: users.id, totalPoints: users.totalPoints })
          .from(users)
          .where(
            and(
              eq(users.isAgent, false),
              eq(users.isActor, false),
              cursorFilter
            )
          )
          .orderBy(users.id)
          .limit(BATCH_SIZE);
      }

      if (batch.length === 0) break;

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

      processed += batch.length;
      const lastUser = batch[batch.length - 1];
      if (lastUser) lastId = lastUser.id;

      // If we got fewer than BATCH_SIZE, we've reached the end
      if (batch.length < BATCH_SIZE) break;
    }

    return processed;
  },

  /**
   * Recompute totalPoints only for users marked dirty.
   * Called by the 15-min cron job for incremental updates.
   * Uses cursor-based pagination to avoid loading unbounded rows into memory.
   */
  async recomputeDirtyUsers(): Promise<number> {
    const cutoff = new Date();
    const BATCH_SIZE = 100;
    let processed = 0;
    let lastId: string | null = null;

    // Cursor-based pagination: fetch BATCH_SIZE at a time, ordered by id
    while (true) {
      const whereClause = lastId
        ? and(isNotNull(users.totalPointsDirtyAt), gt(users.id, lastId))
        : isNotNull(users.totalPointsDirtyAt);

      const batch: { id: string }[] = await db
        .select({ id: users.id })
        .from(users)
        .where(whereClause)
        .orderBy(users.id)
        .limit(BATCH_SIZE);

      if (batch.length === 0) break;

      await Promise.all(
        batch.map(async (user) => {
          try {
            await TotalPointsService.recomputeTotalPoints(user.id);
          } catch (error) {
            logger.error(
              'Failed to recompute totalPoints for user',
              {
                userId: user.id,
                error: error instanceof Error ? error.message : String(error),
              },
              'TotalPointsService'
            );
          }
          // Clear flag even on error to avoid infinite retry loops
          await db
            .update(users)
            .set({ totalPointsDirtyAt: null })
            .where(
              and(eq(users.id, user.id), lte(users.totalPointsDirtyAt, cutoff))
            );
        })
      );

      processed += batch.length;
      const lastUser = batch[batch.length - 1];
      if (lastUser) lastId = lastUser.id;

      // If we got fewer than BATCH_SIZE, we've reached the end
      if (batch.length < BATCH_SIZE) break;
    }

    return processed;
  },

  /**
   * Bulk backfill: set totalPoints = virtualBalance + reputationPoints for
   * users with totalPoints = 0.
   * When POINTS_WHITELIST_ONLY !== 'false', scoped to active whitelist entries.
   * Also marks backfilled users as dirty so the cron can add position values.
   */
  async bulkBackfillFromBalance(): Promise<number> {
    const wlOnly = isWhitelistOnly();
    const result = wlOnly
      ? await db.execute(sql`
          UPDATE "User" u
          SET
            "totalPoints" = COALESCE(CAST(u."virtualBalance" AS DECIMAL(18,2)), 0) + u."reputationPoints",
            "totalPointsDirtyAt" = NOW()
          FROM "Whitelist" w
          WHERE w."userId" = u."id"
            AND w."revokedAt" IS NULL
            AND u."totalPoints" = '0'
            AND u."isAgent" = false
            AND u."isActor" = false
        `)
      : await db.execute(sql`
          UPDATE "User"
          SET
            "totalPoints" = COALESCE(CAST("virtualBalance" AS DECIMAL(18,2)), 0) + "reputationPoints",
            "totalPointsDirtyAt" = NOW()
          WHERE "totalPoints" = '0'
            AND "isAgent" = false
            AND "isActor" = false
        `);

    // postgres-js puts affected row count on `.count`; drizzle passes through
    // the raw Result object from the driver.
    const count = Number(
      (result as unknown as { count?: number }).count ?? result?.length ?? 0
    );
    logger.info(
      `Bulk backfilled totalPoints from virtualBalance for ${count} users (whitelistOnly=${wlOnly})`,
      { count, whitelistOnly: wlOnly },
      'TotalPointsService'
    );
    return count;
  },
};

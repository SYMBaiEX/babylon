import {
  type PerpPosition as DbPerpPosition,
  db,
  organizations,
  perpMarketSnapshots,
  perpPositions,
} from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';
import type { InferInsertModel } from 'drizzle-orm';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  PerpDbPort,
  PerpMarketRecord,
  PerpPositionRecord,
  PerpSide,
} from '../../types';

type NewPerpPosition = InferInsertModel<typeof perpPositions>;
type NewPerpMarketSnapshot = InferInsertModel<typeof perpMarketSnapshots>;

/**
 * Drizzle adapter for PerpDbPort.
 *
 * Notes:
 * - Uses PerpMarketSnapshot as single source for market-level stats.
 * - Generates IDs via snowflake when none provided.
 */
export class PerpDbAdapter implements PerpDbPort {
  async listMarkets(): Promise<PerpMarketRecord[]> {
    const snapshots = await db.select().from(perpMarketSnapshots);
    if (snapshots.length === 0) return [];

    // Fetch org names to enrich if missing
    const orgIds = Array.from(
      new Set(snapshots.map((s) => s.organizationId).filter(Boolean))
    );
    const orgs =
      orgIds.length > 0
        ? await db
            .select({
              id: organizations.id,
              name: organizations.name,
            })
            .from(organizations)
            .where(inArray(organizations.id, orgIds))
        : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    return snapshots.map((s) => ({
      ticker: s.ticker,
      organizationId: s.organizationId,
      name: s.name ?? orgMap.get(s.organizationId),
      currentPrice: Number(s.currentPrice),
      change24h: Number(s.change24h ?? 0),
      changePercent24h: Number(s.changePercent24h ?? 0),
      high24h: Number(s.high24h),
      low24h: Number(s.low24h),
      volume24h: Number(s.volume24h ?? 0),
      openInterest: Number(s.openInterest ?? 0),
      fundingRate: (s.fundingRate ?? {
        rate: 0,
        nextFundingTime: new Date().toISOString(),
        predictedRate: 0,
      }) as PerpMarketRecord['fundingRate'],
      maxLeverage: Number(s.maxLeverage ?? 100),
      minOrderSize: Number(s.minOrderSize ?? 10),
      markPrice: s.markPrice ? Number(s.markPrice) : undefined,
      indexPrice: s.indexPrice ? Number(s.indexPrice) : undefined,
    }));
  }

  async listOpenPositions(): Promise<PerpPositionRecord[]> {
    const positions = await db
      .select()
      .from(perpPositions)
      .where(isNull(perpPositions.closedAt));

    return positions.map(mapPosition);
  }

  async getPositionById(id: string): Promise<PerpPositionRecord | null> {
    const [pos] = await db
      .select()
      .from(perpPositions)
      .where(eq(perpPositions.id, id))
      .limit(1);
    return pos ? mapPosition(pos) : null;
  }

  async upsertPosition(
    position: Omit<PerpPositionRecord, 'id'> & { id?: string }
  ): Promise<PerpPositionRecord> {
    const now = new Date();
    const id = position.id ?? (await generateSnowflakeId());
    const insert: NewPerpPosition = {
      id,
      userId: position.userId,
      ticker: position.ticker,
      organizationId: position.organizationId,
      side: position.side,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice,
      size: position.size,
      leverage: position.leverage,
      liquidationPrice: position.liquidationPrice,
      unrealizedPnL: position.unrealizedPnL,
      unrealizedPnLPercent: position.unrealizedPnLPercent,
      fundingPaid: position.fundingPaid,
      openedAt: position.openedAt ?? now,
      lastUpdated: position.lastUpdated ?? now,
      closedAt: position.closedAt ?? null,
      realizedPnL: position.realizedPnL ?? null,
    };

    const result = await db
      .insert(perpPositions)
      .values(insert)
      .onConflictDoUpdate({
        target: perpPositions.id,
        set: { ...insert, openedAt: insert.openedAt },
      })
      .returning()
      .execute();

    return mapPosition(result[0]!);
  }

  async updateOpenPosition(
    positionId: string,
    updates: Partial<
      Pick<
        PerpPositionRecord,
        | 'currentPrice'
        | 'unrealizedPnL'
        | 'unrealizedPnLPercent'
        | 'fundingPaid'
        | 'liquidationPrice'
        | 'lastUpdated'
      >
    >
  ): Promise<void> {
    await db
      .update(perpPositions)
      .set({
        currentPrice: updates.currentPrice,
        unrealizedPnL: updates.unrealizedPnL,
        unrealizedPnLPercent: updates.unrealizedPnLPercent,
        fundingPaid: updates.fundingPaid,
        liquidationPrice: updates.liquidationPrice,
        lastUpdated: updates.lastUpdated ?? new Date(),
      })
      .where(
        and(eq(perpPositions.id, positionId), isNull(perpPositions.closedAt))
      );
  }

  async closePosition(
    positionId: string,
    updates: Partial<
      Pick<
        PerpPositionRecord,
        | 'currentPrice'
        | 'closedAt'
        | 'realizedPnL'
        | 'unrealizedPnL'
        | 'unrealizedPnLPercent'
      >
    >
  ): Promise<void> {
    await db
      .update(perpPositions)
      .set({
        currentPrice: updates.currentPrice,
        closedAt: updates.closedAt ?? new Date(),
        realizedPnL: updates.realizedPnL,
        unrealizedPnL: updates.unrealizedPnL ?? 0,
        unrealizedPnLPercent: updates.unrealizedPnLPercent ?? 0,
        lastUpdated: updates.closedAt ?? new Date(),
      })
      .where(eq(perpPositions.id, positionId));
  }

  async updateMarketStats(
    ticker: string,
    updates: Partial<
      Pick<
        PerpMarketRecord,
        | 'currentPrice'
        | 'change24h'
        | 'changePercent24h'
        | 'high24h'
        | 'low24h'
        | 'volume24h'
        | 'openInterest'
        | 'fundingRate'
        | 'markPrice'
        | 'indexPrice'
        | 'maxLeverage'
        | 'minOrderSize'
      >
    >
  ): Promise<void> {
    const now = new Date();
    const existing = await db
      .select()
      .from(perpMarketSnapshots)
      .where(eq(perpMarketSnapshots.ticker, ticker))
      .limit(1);

    if (existing.length === 0) {
      // Need organizationId to create; try to fetch from organizations by ticker match
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
        })
        .from(organizations)
        .where(eq(organizations.ticker, ticker))
        .limit(1);

      if (!org) {
        throw new Error(
          `Cannot create market snapshot for ${ticker}: organization not found`
        );
      }

      const snapshot: NewPerpMarketSnapshot = {
        ticker,
        organizationId: org.id,
        name: org.name,
        currentPrice: updates.currentPrice ?? 0,
        change24h: updates.change24h ?? 0,
        changePercent24h: updates.changePercent24h ?? 0,
        high24h: updates.high24h ?? updates.currentPrice ?? 0,
        low24h: updates.low24h ?? updates.currentPrice ?? 0,
        volume24h: updates.volume24h ?? 0,
        openInterest: updates.openInterest ?? 0,
        fundingRate: updates.fundingRate ?? {
          rate: 0,
          nextFundingTime: now.toISOString(),
          predictedRate: 0,
        },
        maxLeverage: updates.maxLeverage ?? 100,
        minOrderSize: updates.minOrderSize ?? 10,
        markPrice: updates.markPrice ?? null,
        indexPrice: updates.indexPrice ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(perpMarketSnapshots).values(snapshot).execute();
      return;
    }

    const current = existing[0]!;
    await db
      .update(perpMarketSnapshots)
      .set({
        currentPrice: updates.currentPrice ?? current.currentPrice,
        change24h: updates.change24h ?? current.change24h,
        changePercent24h: updates.changePercent24h ?? current.changePercent24h,
        high24h: updates.high24h ?? current.high24h,
        low24h: updates.low24h ?? current.low24h,
        volume24h: updates.volume24h ?? current.volume24h,
        openInterest: updates.openInterest ?? current.openInterest,
        fundingRate: updates.fundingRate ?? current.fundingRate,
        maxLeverage: updates.maxLeverage ?? current.maxLeverage,
        minOrderSize: updates.minOrderSize ?? current.minOrderSize,
        markPrice: updates.markPrice ?? current.markPrice,
        indexPrice: updates.indexPrice ?? current.indexPrice,
        updatedAt: now,
      })
      .where(eq(perpMarketSnapshots.ticker, ticker));
  }
}

function mapPosition(pos: DbPerpPosition): PerpPositionRecord {
  return {
    id: pos.id,
    userId: pos.userId,
    ticker: pos.ticker,
    organizationId: pos.organizationId,
    side: pos.side as PerpSide,
    entryPrice: Number(pos.entryPrice),
    currentPrice: Number(pos.currentPrice),
    size: Number(pos.size),
    leverage: Number(pos.leverage),
    liquidationPrice: Number(pos.liquidationPrice),
    unrealizedPnL: Number(pos.unrealizedPnL),
    unrealizedPnLPercent: Number(pos.unrealizedPnLPercent),
    fundingPaid: Number(pos.fundingPaid),
    openedAt: new Date(pos.openedAt),
    lastUpdated: new Date(pos.lastUpdated),
    closedAt: pos.closedAt ? new Date(pos.closedAt) : undefined,
    realizedPnL: pos.realizedPnL !== null ? Number(pos.realizedPnL) : undefined,
  };
}

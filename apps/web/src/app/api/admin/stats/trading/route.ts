// GET /api/admin/stats/trading - Trading statistics with filtering

import {
  errorResponse,
  requirePermission,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
import { FEE_CONFIG } from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/** Maximum allowed date range in days to prevent heavy queries */
const MAX_DATE_RANGE_DAYS = 365;

function parseDateParam(param: string | null): Date | null {
  if (!param) return null;
  const date = new Date(param);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Validate that the date range doesn't exceed the maximum allowed days.
 * Returns null if valid, or an error message if invalid.
 */
function validateDateRange(
  startDate: Date | null,
  endDate: Date | null
): string | null {
  if (!startDate || !endDate) return null;

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    return 'startDate must be before endDate';
  }

  if (diffDays > MAX_DATE_RANGE_DAYS) {
    return `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`;
  }

  return null;
}

/** Valid market types for filtering - whitelist to prevent injection */
const VALID_MARKET_TYPES = ['all', 'prediction', 'perpetual'] as const;
type MarketType = (typeof VALID_MARKET_TYPES)[number];

function validateMarketType(value: string | null): MarketType {
  if (!value || !VALID_MARKET_TYPES.includes(value as MarketType)) {
    return 'all';
  }
  return value as MarketType;
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_trading');

  const { searchParams } = new URL(request.url);
  const startDate = parseDateParam(searchParams.get('startDate'));
  const endDate = parseDateParam(searchParams.get('endDate'));
  const marketType = validateMarketType(searchParams.get('marketType'));
  const includeTimeSeries = searchParams.get('includeTimeSeries') === 'true';

  // Validate date range to prevent heavy queries
  const dateRangeError = validateDateRange(startDate, endDate);
  if (dateRangeError) {
    return errorResponse(dateRangeError, 'INVALID_DATE_RANGE', 400, {
      maxDays: MAX_DATE_RANGE_DAYS,
    });
  }

  logger.info(
    'Trading stats requested',
    { startDate, endDate, marketType, includeTimeSeries },
    'GET /api/admin/stats/trading'
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalMarkets,
    activeMarkets,
    resolvedMarkets,
    totalPositions,
    activePositions,
    totalPerpPositions,
    activePerpPositions,
  ] = await Promise.all([
    db.market.count(),
    db.market.count({ where: { resolved: false } }),
    db.market.count({ where: { resolved: true } }),
    db.position.count(),
    db.position.count({ where: { shares: { gt: '0' } } }),
    db.perpPosition.count(),
    db.perpPosition.count({ where: { closedAt: null } }),
  ]);

  const [
    totalBalanceTransactions,
    totalNpcTrades,
    npcTradesToday,
    tradingFeesResult,
    feesTodayResult,
  ] = await Promise.all([
    db.balanceTransaction.count(),
    db.npcTrade.count(),
    db.npcTrade.count({ where: { executedAt: { gte: today } } }),
    db.tradingFee.aggregate({
      _sum: { feeAmount: true, platformFee: true, referrerFee: true },
    }),
    db.$queryRaw<{ total: string }>`
      SELECT COALESCE(SUM("feeAmount"::numeric), 0) as total
      FROM "TradingFee"
      WHERE "createdAt" >= ${today}
    `,
  ]);

  const totalFees = tradingFeesResult._sum?.feeAmount
    ? Number(tradingFeesResult._sum.feeAmount)
    : 0;
  const platformFees = tradingFeesResult._sum?.platformFee
    ? Number(tradingFeesResult._sum.platformFee)
    : 0;
  const referrerFees = tradingFeesResult._sum?.referrerFee
    ? Number(tradingFeesResult._sum.referrerFee)
    : 0;
  const feesTodayRow = feesTodayResult[0];
  const feesToday = feesTodayRow ? Number(feesTodayRow.total) : 0;

  const topTraders = await db.$queryRaw<{
    userId: string;
    username: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    tradeCount: string;
    totalVolume: string;
  }>`
    SELECT 
      u.id as "userId",
      u.username,
      u."displayName",
      u."profileImageUrl",
      COUNT(bt.id) as "tradeCount",
      ABS(SUM(bt.amount::numeric)) as "totalVolume"
    FROM "User" u
    JOIN "BalanceTransaction" bt ON u.id = bt."userId"
    WHERE bt.type IN ('prediction_buy', 'prediction_sell', 'perp_open', 'perp_close')
      AND u."isActor" = false
    GROUP BY u.id, u.username, u."displayName", u."profileImageUrl"
    ORDER BY "totalVolume" DESC
    LIMIT 10
  `;

  const topMarkets = await db.$queryRaw<{
    marketId: string;
    question: string;
    positionCount: string;
    totalVolume: string;
  }>`
    SELECT 
      m.id as "marketId",
      m.question,
      COUNT(DISTINCT p."userId") as "positionCount",
      COALESCE(SUM(p.shares::numeric * p."avgPrice"::numeric), 0) as "totalVolume"
    FROM "Market" m
    LEFT JOIN "Position" p ON m.id = p."marketId"
    GROUP BY m.id, m.question
    ORDER BY "totalVolume" DESC
    LIMIT 10
  `;

  let timeSeries: Array<{
    date: string;
    trades: number;
    volume: number;
    fees: number;
  }> = [];

  if (includeTimeSeries) {
    const timeSeriesStart =
      startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeSeriesEnd = endDate ?? new Date();

    let dailyStats: Array<{
      date: string;
      trades: string;
      volume: string;
      fees: string;
    }>;

    if (marketType === 'prediction') {
      dailyStats = await db.$queryRaw<{
        date: string;
        trades: string;
        volume: string;
        fees: string;
      }>`
        SELECT DATE(bt."createdAt") as date, COUNT(*) as trades,
          ABS(SUM(bt.amount::numeric)) as volume, COALESCE(SUM(tf."feeAmount"::numeric), 0) as fees
        FROM "BalanceTransaction" bt
        LEFT JOIN "TradingFee" tf ON bt.id = tf."tradeId"
        WHERE bt."createdAt" >= ${timeSeriesStart} AND bt."createdAt" <= ${timeSeriesEnd}
          AND bt.type IN ('prediction_buy', 'prediction_sell')
        GROUP BY DATE(bt."createdAt") ORDER BY date ASC
      `;
    } else if (marketType === 'perpetual') {
      dailyStats = await db.$queryRaw<{
        date: string;
        trades: string;
        volume: string;
        fees: string;
      }>`
        SELECT DATE(bt."createdAt") as date, COUNT(*) as trades,
          ABS(SUM(bt.amount::numeric)) as volume, COALESCE(SUM(tf."feeAmount"::numeric), 0) as fees
        FROM "BalanceTransaction" bt
        LEFT JOIN "TradingFee" tf ON bt.id = tf."tradeId"
        WHERE bt."createdAt" >= ${timeSeriesStart} AND bt."createdAt" <= ${timeSeriesEnd}
          AND bt.type IN ('perp_open', 'perp_close')
        GROUP BY DATE(bt."createdAt") ORDER BY date ASC
      `;
    } else {
      dailyStats = await db.$queryRaw<{
        date: string;
        trades: string;
        volume: string;
        fees: string;
      }>`
        SELECT DATE(bt."createdAt") as date, COUNT(*) as trades,
          ABS(SUM(bt.amount::numeric)) as volume, COALESCE(SUM(tf."feeAmount"::numeric), 0) as fees
        FROM "BalanceTransaction" bt
        LEFT JOIN "TradingFee" tf ON bt.id = tf."tradeId"
        WHERE bt."createdAt" >= ${timeSeriesStart} AND bt."createdAt" <= ${timeSeriesEnd}
          AND bt.type IN ('prediction_buy', 'prediction_sell', 'perp_open', 'perp_close')
        GROUP BY DATE(bt."createdAt") ORDER BY date ASC
      `;
    }

    timeSeries = dailyStats.map((row) => ({
      date: row.date,
      trades: Number(row.trades),
      volume: Number(row.volume),
      fees: Number(row.fees),
    }));
  }

  let recentTrades: Array<{
    id: string;
    userId: string;
    username: string | null;
    displayName: string | null;
    type: string;
    amount: string;
    createdAt: Date;
  }>;

  // Default to last 30 days if no start date provided (avoid scanning from 1970)
  const recentTradesStart =
    startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentTradesEnd = endDate ?? new Date();

  if (marketType === 'prediction') {
    recentTrades = await db.$queryRaw`
      SELECT bt.id, bt."userId", u.username, u."displayName", bt.type, bt.amount, bt."createdAt"
      FROM "BalanceTransaction" bt
      JOIN "User" u ON bt."userId" = u.id
      WHERE bt.type IN ('prediction_buy', 'prediction_sell')
        AND bt."createdAt" >= ${recentTradesStart} AND bt."createdAt" <= ${recentTradesEnd}
      ORDER BY bt."createdAt" DESC LIMIT 20
    `;
  } else if (marketType === 'perpetual') {
    recentTrades = await db.$queryRaw`
      SELECT bt.id, bt."userId", u.username, u."displayName", bt.type, bt.amount, bt."createdAt"
      FROM "BalanceTransaction" bt
      JOIN "User" u ON bt."userId" = u.id
      WHERE bt.type IN ('perp_open', 'perp_close')
        AND bt."createdAt" >= ${recentTradesStart} AND bt."createdAt" <= ${recentTradesEnd}
      ORDER BY bt."createdAt" DESC LIMIT 20
    `;
  } else {
    recentTrades = await db.$queryRaw`
      SELECT bt.id, bt."userId", u.username, u."displayName", bt.type, bt.amount, bt."createdAt"
      FROM "BalanceTransaction" bt
      JOIN "User" u ON bt."userId" = u.id
      WHERE bt.type IN ('prediction_buy', 'prediction_sell', 'perp_open', 'perp_close')
        AND bt."createdAt" >= ${recentTradesStart} AND bt."createdAt" <= ${recentTradesEnd}
      ORDER BY bt."createdAt" DESC LIMIT 20
    `;
  }

  return successResponse({
    overview: {
      totalMarkets,
      activeMarkets,
      resolvedMarkets,
      totalPositions,
      activePositions,
      totalPerpPositions,
      activePerpPositions,
    },
    volume: {
      totalBalanceTransactions,
      totalNpcTrades,
      npcTradesToday,
    },
    fees: {
      totalFees,
      platformFees,
      referrerFees,
      feesToday,
      feeRate: FEE_CONFIG.TRADING_FEE_RATE,
    },
    topTraders: topTraders.map((t) => ({
      ...t,
      tradeCount: Number(t.tradeCount),
      totalVolume: Number(t.totalVolume),
    })),
    topMarkets: topMarkets.map((m) => ({
      ...m,
      positionCount: Number(m.positionCount),
      totalVolume: Number(m.totalVolume),
    })),
    recentTrades: recentTrades.map((t) => ({
      ...t,
      amount: Number(t.amount),
      createdAt: t.createdAt.toISOString(),
    })),
    timeSeries,
    filters: {
      startDate: startDate?.toISOString() || null,
      endDate: endDate?.toISOString() || null,
      marketType,
      applied: Boolean(startDate || endDate || marketType !== 'all'),
    },
  });
});

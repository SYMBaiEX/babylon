/**
 * Admin Trading Statistics API
 *
 * @route GET /api/admin/stats/trading - Get trading statistics with filtering
 * @access Admin
 */

import {
  requirePermission,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
import { FEE_CONFIG } from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * Parse date from query param
 */
function parseDateParam(param: string | null): Date | null {
  if (!param) return null;
  const date = new Date(param);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * GET /api/admin/stats/trading
 * Returns comprehensive trading statistics
 *
 * Query params:
 * - startDate: ISO date string (optional) - filters trades and time series
 * - endDate: ISO date string (optional) - filters trades and time series
 * - marketType: 'all' | 'prediction' | 'perpetual' (default: 'all')
 * - includeTimeSeries: 'true' | 'false' (default: 'false')
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_trading');

  const { searchParams } = new URL(request.url);
  const startDate = parseDateParam(searchParams.get('startDate'));
  const endDate = parseDateParam(searchParams.get('endDate'));
  const marketType = searchParams.get('marketType') || 'all';
  const includeTimeSeries = searchParams.get('includeTimeSeries') === 'true';

  logger.info(
    'Trading stats requested',
    { startDate, endDate, marketType, includeTimeSeries },
    'GET /api/admin/stats/trading'
  );

  // Calculate today's date boundary
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Build date filter for queries
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  // Trade types are used in individual queries based on marketType filter

  // Market statistics
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

  // Volume and fees
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

  // Top traders by volume
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

  // Top markets by volume
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

  // Time series data (respects date and market type filters)
  let timeSeries: Array<{
    date: string;
    trades: number;
    volume: number;
    fees: number;
  }> = [];

  if (includeTimeSeries) {
    // Use provided date range or default to last 30 days
    const timeSeriesStart =
      startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeSeriesEnd = endDate ?? new Date();

    // Build trade type condition based on market type
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
      // 'all' - include all trade types
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

  // Recent trades (respects date and market type filters)
  let recentTrades: Array<{
    id: string;
    userId: string;
    username: string | null;
    displayName: string | null;
    type: string;
    amount: string;
    createdAt: Date;
  }>;

  // Build date bounds for recent trades query
  const recentTradesStart = startDate ?? new Date(0); // epoch if no start
  const recentTradesEnd = endDate ?? new Date(); // now if no end

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
    // 'all' - include all trade types
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
      feeRate: FEE_CONFIG.TRADING_FEE_RATE, // From centralized config
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

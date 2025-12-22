/**
 * Admin User Statistics API
 *
 * @route GET /api/admin/stats/users - Get user statistics with filtering
 * @access Admin
 */

import {
  requirePermission,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
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
 * Build user type filter based on query param
 */
function buildUserTypeFilter(userType: string): {
  isActor?: boolean;
  isAgent?: boolean;
} {
  switch (userType) {
    case 'real':
      return { isActor: false, isAgent: false };
    case 'actors':
      return { isActor: true };
    case 'agents':
      return { isAgent: true };
    default:
      return {}; // 'all' - no filter
  }
}

/**
 * GET /api/admin/stats/users
 * Returns comprehensive user statistics
 *
 * Query params:
 * - startDate: ISO date string (optional) - filters signups and time series
 * - endDate: ISO date string (optional) - filters signups and time series
 * - userType: 'all' | 'real' | 'actors' | 'agents' (default: 'all')
 * - includeTimeSeries: 'true' | 'false' (default: 'false')
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_users');

  const { searchParams } = new URL(request.url);
  const startDate = parseDateParam(searchParams.get('startDate'));
  const endDate = parseDateParam(searchParams.get('endDate'));
  const userType = searchParams.get('userType') || 'all';
  const includeTimeSeries = searchParams.get('includeTimeSeries') === 'true';

  logger.info(
    'User stats requested',
    { startDate, endDate, userType, includeTimeSeries },
    'GET /api/admin/stats/users'
  );

  // Calculate date boundaries for relative stats
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000); // 1 day in ms
  const lastWeek = new Date(today.getTime() - 7 * 86400000);
  const lastMonth = new Date(today.getTime() - 30 * 86400000);

  // Build user type filter
  const userTypeFilter = buildUserTypeFilter(userType);

  // Build date range filter for filtered queries
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  // Combine filters
  const combinedFilter = { ...userTypeFilter, ...dateFilter };

  // Run parallel queries - use filters where applicable
  const [
    totalUsers,
    realUsers,
    actors,
    agents,
    bannedUsers,
    adminUsers,
    usersToday,
    usersYesterday,
    usersThisWeek,
    usersThisMonth,
    profileComplete,
    onChainRegistered,
    withFarcaster,
    withTwitter,
    withDiscord,
    withWallet,
    // Filtered counts (when date/type filters are applied)
    filteredTotal,
  ] = await Promise.all([
    // Overview counts (unfiltered for dashboard totals)
    db.user.count(),
    db.user.count({ where: { isActor: false, isAgent: false } }),
    db.user.count({ where: { isActor: true } }),
    db.user.count({ where: { isAgent: true } }),
    db.user.count({ where: { isBanned: true } }),
    db.user.count({ where: { isAdmin: true } }),
    // Relative date counts (always relative to today)
    db.user.count({ where: { ...userTypeFilter, createdAt: { gte: today } } }),
    db.user.count({
      where: { ...userTypeFilter, createdAt: { gte: yesterday, lt: today } },
    }),
    db.user.count({
      where: { ...userTypeFilter, createdAt: { gte: lastWeek } },
    }),
    db.user.count({
      where: { ...userTypeFilter, createdAt: { gte: lastMonth } },
    }),
    // Profile metrics (filtered by user type)
    db.user.count({ where: { ...userTypeFilter, profileComplete: true } }),
    db.user.count({ where: { ...userTypeFilter, onChainRegistered: true } }),
    db.user.count({ where: { ...userTypeFilter, hasFarcaster: true } }),
    db.user.count({ where: { ...userTypeFilter, hasTwitter: true } }),
    db.user.count({ where: { ...userTypeFilter, hasDiscord: true } }),
    db.user.count({
      where: { ...userTypeFilter, walletAddress: { not: null } },
    }),
    // Filtered total (when specific date range requested)
    startDate || endDate
      ? db.user.count({ where: combinedFilter })
      : Promise.resolve(null),
  ]);

  // Time series data (daily signups for specified range or last 30 days)
  let timeSeries: Array<{ date: string; signups: number; cumulative: number }> =
    [];

  if (includeTimeSeries) {
    // Use provided date range or default to last 30 days
    const timeSeriesStart =
      startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeSeriesEnd = endDate ?? new Date();

    // Query differs based on user type to properly filter
    let dailySignups: Array<{ date: string; count: string }>;

    if (userType === 'actors') {
      dailySignups = await db.$queryRaw<{ date: string; count: string }>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "User"
        WHERE "createdAt" >= ${timeSeriesStart} AND "createdAt" <= ${timeSeriesEnd}
          AND "isActor" = true
        GROUP BY DATE("createdAt") ORDER BY date ASC
      `;
    } else if (userType === 'agents') {
      dailySignups = await db.$queryRaw<{ date: string; count: string }>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "User"
        WHERE "createdAt" >= ${timeSeriesStart} AND "createdAt" <= ${timeSeriesEnd}
          AND "isAgent" = true
        GROUP BY DATE("createdAt") ORDER BY date ASC
      `;
    } else if (userType === 'real') {
      dailySignups = await db.$queryRaw<{ date: string; count: string }>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "User"
        WHERE "createdAt" >= ${timeSeriesStart} AND "createdAt" <= ${timeSeriesEnd}
          AND "isActor" = false AND "isAgent" = false
        GROUP BY DATE("createdAt") ORDER BY date ASC
      `;
    } else {
      // 'all' - no user type filter
      dailySignups = await db.$queryRaw<{ date: string; count: string }>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "User"
        WHERE "createdAt" >= ${timeSeriesStart} AND "createdAt" <= ${timeSeriesEnd}
        GROUP BY DATE("createdAt") ORDER BY date ASC
      `;
    }

    let cumulative = 0;
    timeSeries = dailySignups.map((row) => {
      cumulative += Number(row.count);
      return {
        date: row.date,
        signups: Number(row.count),
        cumulative,
      };
    });
  }

  // Top referrers (filtered by user type if specified)
  const topReferrers = await db.user.findMany({
    where: { ...userTypeFilter, referralCount: { gt: 0 } },
    orderBy: { referralCount: 'desc' },
    take: 10,
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      referralCount: true,
    },
  });

  // Recent signups (filtered by user type and date range)
  const recentSignups = await db.user.findMany({
    where: combinedFilter,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      createdAt: true,
      onChainRegistered: true,
      hasFarcaster: true,
      hasTwitter: true,
      hasDiscord: true,
    },
  });

  // Calculate base count for rate calculations based on filtered results
  const baseCount =
    userType === 'actors'
      ? actors
      : userType === 'agents'
        ? agents
        : userType === 'real'
          ? realUsers
          : totalUsers;

  return successResponse({
    overview: {
      total: totalUsers,
      realUsers,
      actors,
      agents,
      banned: bannedUsers,
      admins: adminUsers,
      // Include filtered total when date filters applied
      ...(filteredTotal !== null && { filteredTotal }),
    },
    signups: {
      today: usersToday,
      yesterday: usersYesterday,
      thisWeek: usersThisWeek,
      thisMonth: usersThisMonth,
      growthRate:
        usersYesterday > 0
          ? ((usersToday - usersYesterday) / usersYesterday) * 100
          : 0,
    },
    profileMetrics: {
      profileComplete,
      profileCompletionRate:
        baseCount > 0
          ? Math.round((profileComplete / baseCount) * 1000) / 10
          : 0,
      onChainRegistered,
      onChainRate:
        baseCount > 0
          ? Math.round((onChainRegistered / baseCount) * 1000) / 10
          : 0,
    },
    socialConnections: {
      withFarcaster,
      withTwitter,
      withDiscord,
      withWallet,
      farcasterRate:
        baseCount > 0 ? Math.round((withFarcaster / baseCount) * 1000) / 10 : 0,
      twitterRate:
        baseCount > 0 ? Math.round((withTwitter / baseCount) * 1000) / 10 : 0,
      discordRate:
        baseCount > 0 ? Math.round((withDiscord / baseCount) * 1000) / 10 : 0,
      walletRate:
        baseCount > 0 ? Math.round((withWallet / baseCount) * 1000) / 10 : 0,
    },
    topReferrers,
    recentSignups: recentSignups.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
    timeSeries,
    filters: {
      startDate: startDate?.toISOString() || null,
      endDate: endDate?.toISOString() || null,
      userType,
      applied: Boolean(startDate || endDate || userType !== 'all'),
    },
  });
});

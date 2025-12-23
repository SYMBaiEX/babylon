// GET /api/admin/stats/users - User statistics with filtering

import {
  errorResponse,
  requirePermission,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db } from '@babylon/db';
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

/** Valid user types for filtering - whitelist to prevent injection */
const VALID_USER_TYPES = ['all', 'real', 'actors', 'agents'] as const;
type UserType = (typeof VALID_USER_TYPES)[number];

function validateUserType(value: string | null): UserType {
  if (!value || !VALID_USER_TYPES.includes(value as UserType)) {
    return 'all';
  }
  return value as UserType;
}

function buildUserTypeFilter(userType: UserType): {
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
      return {};
  }
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_users');

  const { searchParams } = new URL(request.url);
  const startDate = parseDateParam(searchParams.get('startDate'));
  const endDate = parseDateParam(searchParams.get('endDate'));
  const userType = validateUserType(searchParams.get('userType'));
  const includeTimeSeries = searchParams.get('includeTimeSeries') === 'true';

  // Validate date range to prevent heavy queries
  const dateRangeError = validateDateRange(startDate, endDate);
  if (dateRangeError) {
    return errorResponse(dateRangeError, 'INVALID_DATE_RANGE', 400, {
      maxDays: MAX_DATE_RANGE_DAYS,
    });
  }

  logger.info(
    'User stats requested',
    { startDate, endDate, userType, includeTimeSeries },
    'GET /api/admin/stats/users'
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000); // 1 day in ms
  const lastWeek = new Date(today.getTime() - 7 * 86400000);
  const lastMonth = new Date(today.getTime() - 30 * 86400000);

  const userTypeFilter = buildUserTypeFilter(userType);
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }
  const combinedFilter = { ...userTypeFilter, ...dateFilter };

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
    filteredTotal,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActor: false, isAgent: false } }),
    db.user.count({ where: { isActor: true } }),
    db.user.count({ where: { isAgent: true } }),
    db.user.count({ where: { isBanned: true } }),
    db.user.count({ where: { isAdmin: true } }),
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
    db.user.count({ where: { ...userTypeFilter, profileComplete: true } }),
    db.user.count({ where: { ...userTypeFilter, onChainRegistered: true } }),
    db.user.count({ where: { ...userTypeFilter, hasFarcaster: true } }),
    db.user.count({ where: { ...userTypeFilter, hasTwitter: true } }),
    db.user.count({ where: { ...userTypeFilter, hasDiscord: true } }),
    db.user.count({
      where: { ...userTypeFilter, walletAddress: { not: null } },
    }),
    startDate || endDate
      ? db.user.count({ where: combinedFilter })
      : Promise.resolve(null),
  ]);

  let timeSeries: Array<{ date: string; signups: number; cumulative: number }> =
    [];

  if (includeTimeSeries) {
    const timeSeriesStart =
      startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeSeriesEnd = endDate ?? new Date();

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

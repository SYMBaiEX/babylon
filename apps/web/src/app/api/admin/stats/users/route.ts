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
 * GET /api/admin/stats/users
 * Returns comprehensive user statistics
 *
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
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

  // Calculate date boundaries
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000); // 1 day in ms
  const lastWeek = new Date(today.getTime() - 7 * 86400000);
  const lastMonth = new Date(today.getTime() - 30 * 86400000);

  // Run parallel queries
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
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActor: false, isAgent: false } }),
    db.user.count({ where: { isActor: true } }),
    db.user.count({ where: { isAgent: true } }),
    db.user.count({ where: { isBanned: true } }),
    db.user.count({ where: { isAdmin: true } }),
    db.user.count({ where: { createdAt: { gte: today } } }),
    db.user.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
    db.user.count({ where: { createdAt: { gte: lastWeek } } }),
    db.user.count({ where: { createdAt: { gte: lastMonth } } }),
    db.user.count({ where: { profileComplete: true } }),
    db.user.count({ where: { onChainRegistered: true } }),
    db.user.count({ where: { hasFarcaster: true } }),
    db.user.count({ where: { hasTwitter: true } }),
    db.user.count({ where: { hasDiscord: true } }),
    db.user.count({ where: { walletAddress: { not: null } } }),
  ]);

  // Calculate rates
  const profileCompletionRate =
    realUsers > 0 ? (profileComplete / realUsers) * 100 : 0;
  const onChainRate = realUsers > 0 ? (onChainRegistered / realUsers) * 100 : 0;

  // Time series data (daily signups for last 30 days)
  let timeSeries: Array<{ date: string; signups: number; cumulative: number }> =
    [];

  if (includeTimeSeries) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailySignups = await db.$queryRaw<{ date: string; count: string }>`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM "User"
      WHERE "createdAt" >= ${thirtyDaysAgo}
        AND "isActor" = false
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

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

  // Top referrers
  const topReferrers = await db.user.findMany({
    where: { referralCount: { gt: 0 } },
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

  // Recent signups
  const recentSignups = await db.user.findMany({
    where: { isActor: false },
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

  return successResponse({
    overview: {
      total: totalUsers,
      realUsers,
      actors,
      agents,
      banned: bannedUsers,
      admins: adminUsers,
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
      profileCompletionRate: Math.round(profileCompletionRate * 10) / 10,
      onChainRegistered,
      onChainRate: Math.round(onChainRate * 10) / 10,
    },
    socialConnections: {
      withFarcaster,
      withTwitter,
      withDiscord,
      withWallet,
      farcasterRate:
        realUsers > 0 ? Math.round((withFarcaster / realUsers) * 1000) / 10 : 0,
      twitterRate:
        realUsers > 0 ? Math.round((withTwitter / realUsers) * 1000) / 10 : 0,
      discordRate:
        realUsers > 0 ? Math.round((withDiscord / realUsers) * 1000) / 10 : 0,
      walletRate:
        realUsers > 0 ? Math.round((withWallet / realUsers) * 1000) / 10 : 0,
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
    },
  });
});

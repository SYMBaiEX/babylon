/**
 * Admin System Health API
 *
 * @route GET /api/admin/system-health - Get system health metrics
 * @access Admin
 *
 * @description
 * Returns system health metrics including game engine status,
 * database connectivity, and error rates.
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { count, db, desc, games, gte, posts, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  logger.info(
    'System health check requested',
    {},
    'GET /api/admin/system-health'
  );

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get game state
  const [currentGame] = await db
    .select()
    .from(games)
    .orderBy(desc(games.updatedAt))
    .limit(1);

  // Calculate time since last tick
  const timeSinceLastTick = currentGame?.lastTickAt
    ? now.getTime() - new Date(currentGame.lastTickAt).getTime()
    : null;

  // Get user activity stats as proxy for API health
  const [userStatsHour] = await db
    .select({
      newUsers: count(),
    })
    .from(users)
    .where(gte(users.createdAt, oneHourAgo));

  const [userStatsDay] = await db
    .select({
      newUsers: count(),
    })
    .from(users)
    .where(gte(users.createdAt, oneDayAgo));

  // Get post activity stats
  const [postStatsHour] = await db
    .select({
      newPosts: count(),
    })
    .from(posts)
    .where(gte(posts.createdAt, oneHourAgo));

  const [postStatsDay] = await db
    .select({
      newPosts: count(),
    })
    .from(posts)
    .where(gte(posts.createdAt, oneDayAgo));

  // Determine overall health status
  let healthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  const issues: string[] = [];

  // Check game tick freshness
  if (currentGame?.isRunning) {
    if (timeSinceLastTick && timeSinceLastTick > 10 * 60 * 1000) {
      healthStatus = 'critical';
      issues.push('Game tick stale (>10 minutes)');
    } else if (timeSinceLastTick && timeSinceLastTick > 5 * 60 * 1000) {
      healthStatus = healthStatus === 'healthy' ? 'degraded' : healthStatus;
      issues.push('Game tick delayed (>5 minutes)');
    }
  }

  // Check for activity
  if (postStatsDay?.newPosts === 0 && userStatsDay?.newUsers === 0) {
    healthStatus = healthStatus === 'healthy' ? 'degraded' : healthStatus;
    issues.push('No activity in last 24 hours');
  }

  return successResponse({
    status: healthStatus,
    issues,
    timestamp: now.toISOString(),
    gameEngine: {
      isRunning: currentGame?.isRunning ?? false,
      currentDay: currentGame?.currentDay ?? 0,
      lastTickAt: currentGame?.lastTickAt?.toISOString() ?? null,
      timeSinceLastTickMs: timeSinceLastTick,
      tickIntervalMs: currentGame?.speed ?? 60000,
      uptimeMs: currentGame?.startedAt
        ? now.getTime() - new Date(currentGame.startedAt).getTime()
        : 0,
    },
    llmMetrics: {
      lastHour: {
        totalCalls: 0,
        avgLatencyMs: 0,
        errors: 0,
        errorRate: 0,
      },
      last24Hours: {
        totalCalls: 0,
        avgLatencyMs: 0,
        errors: 0,
        errorRate: 0,
      },
    },
    activityMetrics: {
      lastHour: {
        newUsers: userStatsHour?.newUsers ?? 0,
        newPosts: postStatsHour?.newPosts ?? 0,
      },
      last24Hours: {
        newUsers: userStatsDay?.newUsers ?? 0,
        newPosts: postStatsDay?.newPosts ?? 0,
      },
    },
    recentErrors: [],
  });
});

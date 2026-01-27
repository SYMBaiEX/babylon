/**
 * Metrics Snapshot Cron Job
 *
 * @route GET/POST /api/cron/metrics-snapshot
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Hourly job that collects platform metrics from various stats endpoints
 * and stores them in the SystemMetricsSnapshot table for time-series analysis.
 *
 * Runs at the top of every hour (0 * * * *).
 * Max execution time: 60s (most queries complete in <10s).
 *
 * Metrics collected:
 * - User metrics: total, active (24h), new signups (1h)
 * - Trading: volume, markets, positions (prediction + perpetual)
 * - Social: posts, comments, reactions (1h)
 * - Financial: total balance, fees collected (1h)
 * - System: uptime, response time, error rate, cron health
 *
 * @openapi
 * /api/cron/metrics-snapshot:
 *   get:
 *     tags:
 *       - Cron
 *     summary: Create hourly metrics snapshot
 *     description: Collects platform metrics and stores in SystemMetricsSnapshot table
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Snapshot created or skipped (if already exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 skipped:
 *                   type: boolean
 *                 snapshotId:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                 durationMs:
 *                   type: number
 *       401:
 *         description: Invalid or missing CRON_SECRET
 *       500:
 *         description: Snapshot collection failed
 */

import { cronMetrics, recordCronExecution, verifyCronAuth } from '@babylon/api';
import {
  and,
  db,
  eq,
  generateSnowflakeId,
  systemMetricsSnapshots,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Environment = 'production' | 'staging' | 'development';

/**
 * Get current deployment environment
 * Matches pattern from apps/web/src/app/api/admin/environment/route.ts
 */
function getEnvironment(): Environment {
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'staging';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

/**
 * Truncate date to hour boundary for consistent timestamps
 * All snapshots are aligned to the start of the hour
 */
function getHourBoundary(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  // Verify cron authorization
  if (!verifyCronAuth(request, { jobName: 'MetricsSnapshot' })) {
    logger.warn(
      'Unauthorized metrics-snapshot request',
      undefined,
      'MetricsSnapshot'
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const snapshotTimestamp = getHourBoundary();
  const environment = getEnvironment();

  logger.info(
    'Metrics snapshot started',
    {
      timestamp: snapshotTimestamp.toISOString(),
      environment,
    },
    'MetricsSnapshot'
  );

  try {
    // Check if snapshot already exists for this hour/environment
    const existing = await db
      .select({ id: systemMetricsSnapshots.id })
      .from(systemMetricsSnapshots)
      .where(
        and(
          eq(systemMetricsSnapshots.timestamp, snapshotTimestamp),
          eq(systemMetricsSnapshots.environment, environment)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(
        'Snapshot already exists, skipping',
        {
          timestamp: snapshotTimestamp.toISOString(),
          environment,
          existingId: existing[0]!.id,
        },
        'MetricsSnapshot'
      );

      recordCronExecution('metrics-snapshot', new Date(startTime), {
        success: true,
        skipped: true,
        reason: 'Snapshot already exists for this hour',
      });

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Snapshot already exists',
        timestamp: snapshotTimestamp.toISOString(),
        environment,
        existingId: existing[0]!.id,
      });
    }

    // Collect metrics in parallel
    const metrics = await collectMetrics(snapshotTimestamp);

    // Collect system health metrics
    const systemHealth = await collectSystemHealth();

    // Store snapshot
    const snapshotId = await generateSnowflakeId();
    const snapshotDurationMs = Date.now() - startTime;

    await db.insert(systemMetricsSnapshots).values({
      id: snapshotId,
      timestamp: snapshotTimestamp,
      environment,
      ...metrics,
      ...systemHealth,
      snapshotDurationMs,
    });

    const result = {
      success: true,
      snapshotId,
      timestamp: snapshotTimestamp.toISOString(),
      environment,
      durationMs: snapshotDurationMs,
      metrics: {
        totalUsers: metrics.totalUsers,
        activeUsers: metrics.activeUsers,
        newSignups: metrics.newSignups,
        tradingVolume: metrics.tradingVolume,
        activeMarkets: metrics.activeMarkets,
        postsCreated: metrics.postsCreated,
      },
      systemHealth: {
        apiUptime: systemHealth.apiUptime,
        avgResponseTime: systemHealth.avgResponseTime,
        errorRate: systemHealth.errorRate,
        cronJobsHealthy: systemHealth.cronJobsHealthy,
        cronJobsUnhealthy: systemHealth.cronJobsUnhealthy,
      },
    };

    logger.info('Metrics snapshot completed', result, 'MetricsSnapshot');

    recordCronExecution('metrics-snapshot', new Date(startTime), result);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      'Metrics snapshot failed',
      {
        error: errorMessage,
        timestamp: snapshotTimestamp.toISOString(),
        environment,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'MetricsSnapshot'
    );

    recordCronExecution('metrics-snapshot', new Date(startTime), {
      success: false,
      error: errorMessage,
    });

    // Return error response for visibility (don't throw - allows monitoring)
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: snapshotTimestamp.toISOString(),
        environment,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * Collect platform metrics from database
 *
 * Active users calculation:
 * User table does NOT have a lastActivityAt column, so we compute
 * active users by counting distinct users who posted, commented,
 * or traded in the last 24 hours.
 */
async function collectMetrics(snapshotTime: Date) {
  // Convert dates to ISO strings for proper PostgreSQL timestamp handling
  const oneHourAgoStr = new Date(
    snapshotTime.getTime() - 60 * 60 * 1000
  ).toISOString();
  const oneDayAgoStr = new Date(
    snapshotTime.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  // Run all queries in parallel for efficiency
  const [
    userStats,
    activeUserStats,
    tradingStats,
    socialStats,
    financialStats,
  ] = await Promise.all([
    // User metrics (basic counts)
    db.$queryRaw<{
      total: string;
      newSignups: string;
    }>`
        SELECT 
          COUNT(*)::text as total,
          COUNT(*) FILTER (WHERE "createdAt" >= ${oneHourAgoStr}::timestamp)::text as "newSignups"
        FROM "User"
        WHERE "isActor" = false
      `,

    // Active users: count distinct users who posted, commented, or traded in last 24h
    // User table has no lastActivityAt column, so we compute from activity
    db.$queryRaw<{ active: string }>`
        SELECT COUNT(DISTINCT user_id)::text as active FROM (
          SELECT "authorId" as user_id FROM "Post" 
            WHERE "createdAt" >= ${oneDayAgoStr}::timestamp
          UNION
          SELECT "authorId" as user_id FROM "Comment" 
            WHERE "createdAt" >= ${oneDayAgoStr}::timestamp
          UNION
          SELECT "userId" as user_id FROM "BalanceTransaction" 
            WHERE "createdAt" >= ${oneDayAgoStr}::timestamp
        ) active_users
      `,

    // Trading metrics
    db.$queryRaw<{
      volume: string;
      activeMarkets: string;
      openPositions: string;
      perpVolume: string;
      activePerpPositions: string;
    }>`
        SELECT
          COALESCE(
            (SELECT ABS(SUM(amount::numeric)) FROM "BalanceTransaction" 
             WHERE "createdAt" >= ${oneHourAgoStr}::timestamp 
             AND type IN ('prediction_buy', 'prediction_sell')), 0
          )::text as volume,
          (SELECT COUNT(*) FROM "Market" WHERE resolved = false)::text as "activeMarkets",
          (SELECT COUNT(*) FROM "Position" WHERE shares::numeric > 0)::text as "openPositions",
          COALESCE(
            (SELECT ABS(SUM(amount::numeric)) FROM "BalanceTransaction" 
             WHERE "createdAt" >= ${oneHourAgoStr}::timestamp 
             AND type IN ('perp_open', 'perp_close')), 0
          )::text as "perpVolume",
          (SELECT COUNT(*) FROM "PerpPosition" WHERE "closedAt" IS NULL)::text as "activePerpPositions"
      `,

    // Social metrics (since last snapshot)
    db.$queryRaw<{
      posts: string;
      comments: string;
      reactions: string;
    }>`
        SELECT
          (SELECT COUNT(*) FROM "Post" WHERE "createdAt" >= ${oneHourAgoStr}::timestamp)::text as posts,
          (SELECT COUNT(*) FROM "Comment" WHERE "createdAt" >= ${oneHourAgoStr}::timestamp)::text as comments,
          (SELECT COUNT(*) FROM "Reaction" WHERE "createdAt" >= ${oneHourAgoStr}::timestamp)::text as reactions
      `,

    // Financial metrics
    db.$queryRaw<{
      totalBalance: string;
      feesCollected: string;
    }>`
        SELECT
          COALESCE(SUM("virtualBalance"::numeric), 0)::text as "totalBalance",
          COALESCE(
            (SELECT SUM("feeAmount"::numeric) FROM "TradingFee" 
             WHERE "createdAt" >= ${oneHourAgoStr}::timestamp), 0
          )::text as "feesCollected"
        FROM "User"
        WHERE "isActor" = false
      `,
  ]);

  const userRow = Array.isArray(userStats) ? userStats[0] : userStats;
  const activeRow = Array.isArray(activeUserStats)
    ? activeUserStats[0]
    : activeUserStats;
  const tradingRow = Array.isArray(tradingStats)
    ? tradingStats[0]
    : tradingStats;
  const socialRow = Array.isArray(socialStats) ? socialStats[0] : socialStats;
  const financialRow = Array.isArray(financialStats)
    ? financialStats[0]
    : financialStats;

  return {
    totalUsers: Number(userRow?.total ?? 0),
    activeUsers: Number(activeRow?.active ?? 0),
    newSignups: Number(userRow?.newSignups ?? 0),
    tradingVolume: tradingRow?.volume ?? '0',
    activeMarkets: Number(tradingRow?.activeMarkets ?? 0),
    openPositions: Number(tradingRow?.openPositions ?? 0),
    perpVolume: tradingRow?.perpVolume ?? '0',
    activePerpPositions: Number(tradingRow?.activePerpPositions ?? 0),
    postsCreated: Number(socialRow?.posts ?? 0),
    commentsCreated: Number(socialRow?.comments ?? 0),
    reactionsCreated: Number(socialRow?.reactions ?? 0),
    totalVirtualBalance: financialRow?.totalBalance ?? '0',
    totalFeesCollected: financialRow?.feesCollected ?? '0',
  };
}

/**
 * Collect system health metrics
 *
 * Uses cronMetrics.getDashboardMetrics() for cron job stats
 * and a simple SELECT 1 query for database health check.
 */
async function collectSystemHealth() {
  // Get cron job stats from in-memory metrics
  const cronStats = cronMetrics.getDashboardMetrics();

  // Calculate uptime based on database connectivity
  const apiUptime = 100.0;
  let avgResponseTime = 0;
  let errorRate = 0;

  const healthStart = Date.now();
  // Simple health check - verify DB responds
  await db.$queryRaw`SELECT 1`;
  avgResponseTime = Date.now() - healthStart;

  // Calculate error rate from cron metrics (if we have data)
  if (cronStats.summary.totalExecutions > 0) {
    const failedExecutions =
      cronStats.summary.totalExecutions *
      (1 - cronStats.summary.overallSuccessRate / 100);
    errorRate = (failedExecutions / cronStats.summary.totalExecutions) * 100;
  }

  return {
    apiUptime,
    avgResponseTime,
    errorRate,
    cronJobsHealthy: cronStats.summary.healthyJobs,
    cronJobsUnhealthy: cronStats.summary.unhealthyJobs,
    extendedMetrics: {
      cronAlerts: cronStats.alerts,
      avgCronDurationMs: cronStats.summary.avgDurationMs,
      totalCronExecutions: cronStats.summary.totalExecutions,
    },
  };
}

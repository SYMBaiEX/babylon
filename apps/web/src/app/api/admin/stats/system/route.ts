// GET /api/admin/stats/system - System health statistics

import {
  cronMetrics,
  isRedisAvailable,
  requirePermission,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { checkDatabaseHealth, db } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_system');

  logger.info('System stats requested', {}, 'GET /api/admin/stats/system');

  const healthChecks = await Promise.allSettled([
    checkDatabaseHealth(),
    isRedisAvailable(),
  ]);

  const databaseHealthy =
    healthChecks[0].status === 'fulfilled' && healthChecks[0].value;
  const redisHealthy =
    healthChecks[1].status === 'fulfilled' && healthChecks[1].value;

  const game = await db.game.findFirst({
    where: { isContinuous: true },
  });

  const metrics = cronMetrics.getAllJobStats();

  const recentLlmErrors = await db.$queryRaw<{ count: string }>`
    SELECT COUNT(*) as count
    FROM "LlmCallLog"
    WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
      AND "error" IS NOT NULL
  `;
  const llmErrorsLastHour = recentLlmErrors[0]
    ? Number(recentLlmErrors[0].count)
    : 0;

  const llmStats = await db.$queryRaw<{
    totalCalls: string;
    totalInputTokens: string;
    totalOutputTokens: string;
  }>`
    SELECT 
      COUNT(*) as "totalCalls",
      COALESCE(SUM("inputTokens"), 0) as "totalInputTokens",
      COALESCE(SUM("outputTokens"), 0) as "totalOutputTokens"
    FROM "LlmCallLog"
    WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
  `;

  const tableSizes = await db.$queryRaw<{
    tableName: string;
    rowCount: string;
    sizeBytes: string;
  }>`
    SELECT 
      relname as "tableName",
      n_live_tup as "rowCount",
      pg_total_relation_size(quote_ident(relname)::regclass) as "sizeBytes"
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(quote_ident(relname)::regclass) DESC
    LIMIT 20
  `;

  const outboxStats = await db.$queryRaw<{
    pending: string;
    oldest: Date | null;
  }>`
    SELECT 
      COUNT(*) as pending,
      MIN("createdAt") as oldest
    FROM "RealtimeOutbox"
    WHERE "processedAt" IS NULL
  `;

  const outboxPending = outboxStats[0] ? Number(outboxStats[0].pending) : 0;
  const outboxOldest = outboxStats[0]?.oldest ?? null;
  const outboxLagSeconds = outboxOldest
    ? Math.floor((Date.now() - new Date(outboxOldest).getTime()) / 1000)
    : 0;

  const activeLocks = await db.generationLock.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { lockedAt: 'desc' },
    take: 5,
  });

  const latestPost = await db.post.findFirst({
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });

  const lookaheadMinutes = latestPost
    ? Math.floor(
        (new Date(latestPost.timestamp).getTime() - Date.now()) / 60000
      )
    : 0;

  const pendingReports = await db.report.count({
    where: { status: 'pending' },
  });

  const activeQuestions = await db.question.count({
    where: { status: 'active' },
  });

  const llmUsageRow = llmStats[0];
  const llmCallsTotal = llmUsageRow ? Number(llmUsageRow.totalCalls) : 0;
  const llmInputTokensTotal = llmUsageRow
    ? Number(llmUsageRow.totalInputTokens)
    : 0;
  const llmOutputTokensTotal = llmUsageRow
    ? Number(llmUsageRow.totalOutputTokens)
    : 0;

  return successResponse({
    health: {
      database: databaseHealthy,
      redis: redisHealthy,
      overall: databaseHealthy && redisHealthy,
      timestamp: new Date().toISOString(),
    },
    game: game
      ? {
          id: game.id,
          isRunning: game.isRunning,
          pausedAt: game.pausedAt?.toISOString() || null,
          currentTick: game.currentDay,
          lastTickAt: game.lastTickAt?.toISOString() || null,
        }
      : null,
    cronJobs: {
      gameTick: metrics.find((m) => m.jobName === 'game-tick') || null,
      agentTick: metrics.find((m) => m.jobName === 'agent-tick') || null,
      realtimeDrain:
        metrics.find((m) => m.jobName === 'realtime-drain') || null,
      allJobs: metrics,
    },
    llm: {
      callsLast24h: llmCallsTotal,
      inputTokensLast24h: llmInputTokensTotal,
      outputTokensLast24h: llmOutputTokensTotal,
      errorsLastHour: llmErrorsLastHour,
    },
    content: {
      lookaheadMinutes,
      isHealthy: lookaheadMinutes >= 5,
      activeQuestions,
    },
    realtime: {
      outboxPending,
      outboxLagSeconds,
      isHealthy: outboxLagSeconds < 60,
    },
    locks: {
      active: activeLocks.map((lock) => ({
        id: lock.id,
        lockType: lock.operation,
        acquiredAt: lock.lockedAt.toISOString(),
        ageSeconds: Math.floor((Date.now() - lock.lockedAt.getTime()) / 1000),
      })),
    },
    moderation: {
      pendingReports,
    },
    database: {
      tables: tableSizes.map((t) => ({
        name: t.tableName,
        rowCount: Number(t.rowCount),
        sizeBytes: Number(t.sizeBytes),
        sizeMB: Math.round((Number(t.sizeBytes) / 1024 / 1024) * 10) / 10,
      })),
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION,
    },
  });
});

/**
 * Points Recompute Cron Job
 *
 * @route GET/POST /api/cron/points-recompute
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Periodic job that recomputes total points for dirty users only.
 * At midnight UTC, also takes a daily snapshot of all user points.
 *
 * Max execution time: 300s (batch processing).
 *
 * Operations:
 * - Always: Recompute dirty users (incremental)
 * - At midnight UTC: Additionally snapshot all user points
 */

import { recordCronExecution, verifyCronAuth } from '@babylon/api';
import { TotalPointsService } from '@babylon/engine';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, { jobName: 'PointsRecompute' })) {
    logger.warn(
      'Unauthorized points-recompute request',
      undefined,
      'PointsRecompute'
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();
  const isMidnight = now.getUTCHours() === 0 && now.getUTCMinutes() < 15;

  logger.info('Points recompute started', { isMidnight }, 'PointsRecompute');

  try {
    // Self-heal: mark users with totalPoints=0 as dirty so recompute can backfill.
    const markedZeroTotalPoints =
      await TotalPointsService.markZeroTotalPointsDirty();

    // Incremental: only recompute users marked dirty
    const recomputeResult = await TotalPointsService.recomputeDirtyUsers();

    // At midnight UTC, also snapshot all user points
    let snapshotResult: number | null = null;
    if (isMidnight) {
      snapshotResult = await TotalPointsService.snapshotAllUsers();
    }

    const durationMs = Date.now() - startTime;

    const result = {
      success: true,
      markedZeroTotalPoints,
      recomputed: recomputeResult,
      snapshot: snapshotResult,
      isMidnight,
      durationMs,
    };

    logger.info('Points recompute completed', result, 'PointsRecompute');

    recordCronExecution('points-recompute', new Date(startTime), result);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      'Points recompute failed',
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'PointsRecompute'
    );

    recordCronExecution('points-recompute', new Date(startTime), {
      success: false,
      error: errorMessage,
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

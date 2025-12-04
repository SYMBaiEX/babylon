/**
 * Admin Training Data Status API
 *
 * @route GET /api/admin/training-data - Get training data status
 * @access Admin
 *
 * @description
 * Returns training data statistics and readiness information including
 * trajectory counts, window statistics, and training readiness metrics.
 *
 * @openapi
 * /api/admin/training-data:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get training data status
 *     description: Returns training data statistics and readiness (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTrajectories:
 *                   type: integer
 *                 windowStats:
 *                   type: array
 *                 readyWindows:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * const status = await fetch('/api/admin/training-data', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import { db } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/training-data
 * Returns training data statistics and ready windows
 */
export async function GET(_req: NextRequest) {
  try {
    // Get total trajectory count
    const totalTrajectories = await db.trajectory.count();

    // Get trajectories by window
    const windowStatsRaw = await db.$queryRaw<{
      windowId: string;
      count: bigint;
      avgSteps: number;
      avgPnl: number;
    }>`
      SELECT 
        "windowId",
        COUNT(*)::bigint as count,
        AVG("episodeLength")::float as "avgSteps",
        AVG(COALESCE("finalPnL", 0))::float as "avgPnl"
      FROM trajectories
      WHERE "windowId" IS NOT NULL
        AND "isTrainingData" = true
        AND "stepsJson" IS NOT NULL
      GROUP BY "windowId"
      ORDER BY "windowId" DESC
      LIMIT 50
    `;

    // Convert to serializable format
    const windows = windowStatsRaw.map((w) => ({
      windowId: w.windowId,
      trajectoryCount: Number(w.count),
      avgSteps: w.avgSteps || 0,
      avgPnl: w.avgPnl || 0,
    }));

    // Find ready windows (>= 3 agents minimum for GRPO)
    const MIN_AGENTS_FOR_TRAINING = 3;
    const readyWindows = windows.filter(
      (w) => w.trajectoryCount >= MIN_AGENTS_FOR_TRAINING
    );

    // Get recent trajectories for preview
    const recentTrajectories = await db.trajectory.findMany({
      where: {
        isTrainingData: true,
      },
      select: {
        id: true,
        trajectoryId: true,
        agentId: true,
        windowId: true,
        episodeLength: true,
        finalPnL: true,
        tradesExecuted: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // Calculate quality metrics
    const qualityMetrics = {
      avgEpisodeLength:
        windows.reduce((sum, w) => sum + w.avgSteps, 0) / (windows.length || 1),
      avgPnl:
        windows.reduce((sum, w) => sum + w.avgPnl, 0) / (windows.length || 1),
      trainingDataQuality:
        totalTrajectories > 100
          ? 'good'
          : totalTrajectories > 20
            ? 'fair'
            : 'low',
    };

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalTrajectories,
          totalWindows: windows.length,
          readyWindows: readyWindows.length,
          minAgentsRequired: MIN_AGENTS_FOR_TRAINING,
        },
        windows,
        readyWindows,
        recentTrajectories,
        qualityMetrics,
      },
    });
  } catch (error) {
    logger.error(
      'Failed to get training data stats',
      { error },
      'TrainingDataAPI'
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get training data statistics',
      },
      { status: 500 }
    );
  }
}

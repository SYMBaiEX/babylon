/**
 * Admin Training Status API
 *
 * @route GET /api/admin/training/status - Get training system status
 * @access Admin
 *
 * @description
 * Returns complete training system status for admin panel including automation
 * status, readiness checks, recent jobs, models, and trajectory statistics.
 *
 * @openapi
 * /api/admin/training/status:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get training system status
 *     description: Returns complete training system status (admin only)
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
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 automation:
 *                   type: object
 *                 readiness:
 *                   type: object
 *                 recentJobs:
 *                   type: array
 *                 models:
 *                   type: array
 *                 trajectoryStats:
 *                   type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * const status = await fetch('/api/admin/training/status', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import { NextResponse } from 'next/server';
// import { db } from '@/db';
import { automationPipeline } from '@/lib/training/AutomationPipeline';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Get automation status
  const status = await automationPipeline.getStatus();

  // Get readiness check
  const readiness = await automationPipeline.checkTrainingReadiness();

  // Note: Trajectory schema models require trajectory schema to be merged into main schema schema
  // Returning stub data until then
  const recentJobs: Array<Record<string, unknown>> = [];
  const models: Array<Record<string, unknown>> = [];
  const trajectoryStats = {
    _count: 0,
    _avg: { totalReward: null, episodeLength: null, durationMs: null },
  };

  return NextResponse.json({
    status: 'healthy',
    automation: status,
    readiness,
    recentJobs,
    models,
    trajectoryStats,
    timestamp: new Date().toISOString(),
  });
}

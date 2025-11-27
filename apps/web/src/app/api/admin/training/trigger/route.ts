/**
 * Admin Training Trigger API
 *
 * @route GET /api/admin/training/trigger - Get training readiness
 * @route POST /api/admin/training/trigger - Trigger training job
 * @access Admin
 *
 * @description
 * Manually triggers a training job or checks training readiness. GET returns
 * readiness status. POST triggers training with optional force flag and batch size.
 *
 * @openapi
 * /api/admin/training/trigger:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get training readiness
 *     description: Returns training readiness status (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Readiness status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   post:
 *     tags:
 *       - Admin
 *     summary: Trigger training job
 *     description: Manually triggers a training job (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 default: false
 *               batchSize:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Training job triggered successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * await fetch('/api/admin/training/trigger', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` },
 *   body: JSON.stringify({ force: true })
 * });
 * ```
 */

import { NextResponse } from 'next/server';
import { automationPipeline } from '@babylon/training';

export async function POST(request: Request) {
  const body = await request.json();
  const { force = false, batchSize } = body;

  const result = await automationPipeline.triggerTraining({
    force,
    batchSize,
  });

  return NextResponse.json(result);
}

export async function GET() {
  // Get training readiness
  const readiness = await automationPipeline.checkTrainingReadiness();
  return NextResponse.json(readiness);
}

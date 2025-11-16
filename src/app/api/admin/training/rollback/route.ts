/**
 * Admin Training Rollback API
 * 
 * @route POST /api/admin/training/rollback - Rollback model version
 * @access Admin
 * 
 * @description
 * Rolls back to a previous model version. Useful for reverting problematic
 * deployments. Updates all agents to use the specified version.
 * 
 * @openapi
 * /api/admin/training/rollback:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Rollback model version
 *     description: Rolls back to previous model version (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetVersion
 *             properties:
 *               targetVersion:
 *                 type: string
 *                 description: Model version to rollback to
 *     responses:
 *       200:
 *         description: Rollback completed successfully
 *       400:
 *         description: Target version required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 * 
 * @example
 * ```typescript
 * await fetch('/api/admin/training/rollback', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` },
 *   body: JSON.stringify({ targetVersion: 'v0.9.0' })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { modelDeployer } from '@/lib/training/ModelDeployer';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetVersion } = body;

    if (!targetVersion) {
      return NextResponse.json(
        { error: 'Target version required' },
        { status: 400 }
      );
    }

    // Get current deployed version
    const currentModel = await prisma.trainedModel.findFirst({
      where: { status: 'deployed' },
      orderBy: { deployedAt: 'desc' }
    });

    if (!currentModel) {
      return NextResponse.json(
        { error: 'No currently deployed model' },
        { status: 400 }
      );
    }

    const result = await modelDeployer.rollback(
      currentModel.version,
      targetVersion
    );

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Rollback failed'
      },
      { status: 500 }
    );
  }
}


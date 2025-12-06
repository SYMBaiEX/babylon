/**
 * Admin Training Deploy Model API
 *
 * @route POST /api/admin/training/deploy - Deploy model version
 * @access Admin
 *
 * @description
 * Deploys a trained model version to agents. Supports gradual rollout with
 * percentage-based deployment strategy.
 *
 * @openapi
 * /api/admin/training/deploy:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Deploy model version
 *     description: Deploys model version to agents with rollout strategy (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelVersion
 *             properties:
 *               modelVersion:
 *                 type: string
 *               strategy:
 *                 type: string
 *                 enum: [gradual, immediate]
 *                 default: gradual
 *               rolloutPercentage:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 10
 *     responses:
 *       200:
 *         description: Model deployed successfully
 *       400:
 *         description: Model version required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * await fetch('/api/admin/training/deploy', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` },
 *   body: JSON.stringify({ modelVersion: 'v1.0.0', strategy: 'gradual' })
 * });
 * ```
 */

import { modelDeployer } from '@babylon/training';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { modelVersion, strategy = 'gradual', rolloutPercentage = 10 } = body;

  if (!modelVersion) {
    return NextResponse.json(
      { error: 'Model version required' },
      { status: 400 }
    );
  }

  const result = await modelDeployer.deploy({
    modelVersion,
    strategy,
    rolloutPercentage,
  });

  return NextResponse.json(result);
}

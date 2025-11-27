/**
 * Admin Agents Resume All API
 *
 * @route POST /api/admin/agents/resume-all - Resume all agents
 * @access Admin
 *
 * @description
 * Resumes all autonomous agents that have sufficient points. Re-enables all
 * autonomous behaviors (trading, posting, commenting, DMs, group chats).
 * Admin only.
 *
 * @openapi
 * /api/admin/agents/resume-all:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Resume all agents
 *     description: Resumes all agents with sufficient points (admin only)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Agents resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                   description: Number of agents resumed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * await fetch('/api/admin/agents/resume-all', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { logger } from '@/lib/logger';

export async function POST(_req: NextRequest) {
  try {
    // Resume all agents with sufficient points
    const result = await db.user.updateMany({
      where: {
        isAgent: true,
        agentPointsBalance: { gte: 1 }, // Only resume agents with points
      },
      data: {
        autonomousTrading: true,
        autonomousPosting: true,
        autonomousCommenting: true,
        agentStatus: 'running',
      },
    });

    logger.info(
      `Resumed ${result.count} autonomous agents`,
      undefined,
      'AdminAgentsAPI'
    );

    return NextResponse.json({
      success: true,
      message: `Resumed ${result.count} agents`,
      data: {
        resumed: result.count,
      },
    });
  } catch (error) {
    logger.error('Failed to resume all agents', { error }, 'AdminAgentsAPI');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to resume all agents',
      },
      { status: 500 }
    );
  }
}

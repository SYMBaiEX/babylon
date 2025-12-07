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

import {
  getClientIp,
  logAdminModify,
  requireAdmin,
  withErrorHandling,
} from '@babylon/api';
import { db, gte, userAgentConfigs } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await requireAdmin(req);

  // Audit log the admin action
  logAdminModify({
    adminId: admin.userId,
    ipAddress: getClientIp(req.headers) ?? undefined,
    resourceType: 'agents',
    metadata: { action: 'resume_all' },
  });

  // Resume all agents with sufficient points
  await db
    .update(userAgentConfigs)
    .set({
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: true,
      status: 'running',
      updatedAt: new Date(),
    })
    .where(gte(userAgentConfigs.pointsBalance, 1));

  logger.info(
    `Resumed autonomous agents with points >= 1`,
    undefined,
    'AdminAgentsAPI'
  );

  return NextResponse.json({
    success: true,
    message: 'Resumed agents with sufficient points',
    data: {
      resumed: 'all with points >= 1',
    },
  });
});

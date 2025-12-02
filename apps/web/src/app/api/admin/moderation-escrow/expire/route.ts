/**
 * Admin Moderation Escrow Expire API
 *
 * @route POST /api/admin/moderation-escrow/expire - Expire old payments
 * @access Admin
 *
 * @description
 * Marks expired escrow payments as expired. Can be called by cron job or
 * manually by admin. Finds all pending payments past expiration time.
 *
 * @openapi
 * /api/admin/moderation-escrow/expire:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Expire old escrow payments
 *     description: Marks expired payments as expired (admin only, can be cron)
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Expired payments processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expired:
 *                   type: integer
 *                   description: Number of payments expired
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * await fetch('/api/admin/moderation-escrow/expire', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@babylon/db';
import { requireAdmin } from '@babylon/api';
import { logger } from '@babylon/shared';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const now = new Date();

    // Find all pending escrows that have expired
    const expiredEscrows = await db.moderationEscrow.updateMany({
      where: {
        status: 'pending',
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: 'expired',
      },
    });

    logger.info(
      `Expired ${expiredEscrows.count} escrow payments`,
      { count: expiredEscrows.count },
      'ModerationEscrow'
    );

    return NextResponse.json({
      success: true,
      expiredCount: expiredEscrows.count,
    });
  } catch (error) {
    logger.error(
      'Failed to expire escrow payments',
      { error },
      'ModerationEscrow'
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to expire escrow payments',
      },
      { status: 500 }
    );
  }
}

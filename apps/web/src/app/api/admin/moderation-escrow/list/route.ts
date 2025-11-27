/**
 * Admin Moderation Escrow List API
 *
 * @route GET /api/admin/moderation-escrow/list - List escrow payments
 * @access Admin
 *
 * @description
 * Returns list of moderation escrow payments with filtering by recipient,
 * admin, or status. Supports pagination.
 *
 * @openapi
 * /api/admin/moderation-escrow/list:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List moderation escrow payments
 *     description: Returns escrow payments with filtering and pagination (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: query
 *         name: recipientId
 *         schema:
 *           type: string
 *         description: Filter by recipient ID
 *       - in: query
 *         name: adminId
 *         schema:
 *           type: string
 *         description: Filter by admin ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, paid, refunded, expired]
 *         description: Filter by payment status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Payments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payments:
 *                   type: array
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * const { payments } = await fetch('/api/admin/moderation-escrow/list?status=pending', {
 *   headers: { 'Authorization': `Bearer ${adminToken}` }
 * }).then(r => r.json());
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@babylon/db';
import { requireAdmin } from '@babylon/api';

const ListEscrowQuerySchema = z.object({
  recipientId: z.string().optional(),
  adminId: z.string().optional(),
  status: z.enum(['pending', 'paid', 'refunded', 'expired']).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const validation = ListEscrowQuerySchema.safeParse({
      recipientId: searchParams.get('recipientId'),
      adminId: searchParams.get('adminId'),
      status: searchParams.get('status'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error:
            validation.error.issues[0]?.message || 'Invalid query parameters',
        },
        { status: 400 }
      );
    }

    const { recipientId, adminId, status, limit, offset } = validation.data;

    // Auto-expire old pending escrows before querying
    const now = new Date();
    await db.moderationEscrow.updateMany({
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

    const where: {
      recipientId?: string;
      adminId?: string;
      status?: string;
    } = {};

    if (recipientId) where.recipientId = recipientId;
    if (adminId) where.adminId = adminId;
    if (status) where.status = status;

    const [escrows, total] = await Promise.all([
      db.moderationEscrow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
          admin: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          refundedByUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      }),
      db.moderationEscrow.count({ where }),
    ]);

    type EscrowWithRelations = (typeof escrows)[0] & {
      recipient?: {
        id: string;
        username: string | null;
        displayName: string | null;
        profileImageUrl: string | null;
      } | null;
      admin?: {
        id: string;
        username: string | null;
        displayName: string | null;
      } | null;
      refundedByUser?: {
        id: string;
        username: string | null;
        displayName: string | null;
      } | null;
    };

    return NextResponse.json({
      success: true,
      escrows: escrows.map((escrow) => {
        const escrowWithRelations = escrow as EscrowWithRelations;
        return {
          id: escrow.id,
          recipientId: escrow.recipientId,
          recipient: escrowWithRelations.recipient,
          adminId: escrow.adminId,
          admin: escrowWithRelations.admin,
          amountUSD: escrow.amountUSD,
          amountWei: escrow.amountWei,
          status: escrow.status,
          reason: escrow.reason,
          paymentRequestId: escrow.paymentRequestId,
          paymentTxHash: escrow.paymentTxHash,
          refundTxHash: escrow.refundTxHash,
          refundedBy: escrow.refundedBy,
          refundedByUser: escrowWithRelations.refundedByUser,
          refundedAt: escrow.refundedAt?.toISOString(),
          createdAt: escrow.createdAt.toISOString(),
          expiresAt: escrow.expiresAt.toISOString(),
        };
      }),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list escrow payments',
      },
      { status: 500 }
    );
  }
}

/**
 * User Group Admins API
 *
 * @route GET /api/user-groups/[id]/admins - Get group admins
 * @route POST /api/user-groups/[id]/admins - Grant admin privileges
 * @route DELETE /api/user-groups/[id]/admins/[userId] - Revoke admin privileges
 * @access Authenticated (admin only)
 *
 * @description
 * Manages group admin privileges. GET returns list of admins. POST grants admin
 * privileges to a member. DELETE revokes admin privileges.
 *
 * @openapi
 * /api/user-groups/{id}/admins:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get group admins
 *     description: Returns list of group admins
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Admins retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admins:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags:
 *       - User Groups
 *     summary: Grant admin privileges
 *     description: Grants admin privileges to a group member (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin privileges granted successfully
 *       400:
 *         description: User not a member
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * // Grant admin
 * await fetch(`/api/user-groups/${groupId}/admins`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ userId: 'user-id' })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { generateSnowflakeId } from '@/lib/snowflake';

const addAdminSchema = z.object({
  userId: z.string(),
});

/**
 * POST /api/user-groups/[id]/admins
 * Grant admin privileges to a member (admin only)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { userId: targetUserId } = addAdminSchema.parse(body);

    // Check if requester is admin
    const isAdmin = await db.userGroupAdmin.findFirst({
      where: {
        groupId,
        userId: user.userId,
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can grant admin privileges' },
        { status: 403 }
      );
    }

    // Check if target is a member
    const isMember = await db.userGroupMember.findFirst({
      where: {
        groupId,
        userId: targetUserId,
      },
    });

    if (!isMember) {
      return NextResponse.json(
        { error: 'User must be a member first' },
        { status: 400 }
      );
    }

    // Check if already admin
    const existingAdmin = await db.userGroupAdmin.findFirst({
      where: {
        groupId,
        userId: targetUserId,
      },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { error: 'User is already an admin' },
        { status: 400 }
      );
    }

    // Grant admin
    await db.userGroupAdmin.create({
      data: {
        id: await generateSnowflakeId(),
        groupId,
        userId: targetUserId,
        grantedBy: user.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin privileges granted',
    });
  }
);

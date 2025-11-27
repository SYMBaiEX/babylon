/**
 * Group Admins Management API
 *
 * @route POST /api/groups/[groupId]/admins - Promote member to admin
 * @route DELETE /api/groups/[groupId]/admins - Remove admin
 * @access Authenticated (group admin only)
 *
 * @description
 * Manages group administrators. POST promotes a member to admin. DELETE
 * removes admin status. Only group admins can perform these actions.
 *
 * @openapi
 * /api/groups/{groupId}/admins:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Promote member to admin
 *     description: Promotes a group member to admin (group admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
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
 *       200:
 *         description: Member promoted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not group admin
 *       404:
 *         description: Group or user not found
 *   delete:
 *     tags:
 *       - Groups
 *     summary: Remove admin
 *     description: Removes admin status from a member (group admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove admin from
 *     responses:
 *       200:
 *         description: Admin removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not group admin
 *       404:
 *         description: Group or user not found
 *
 * @example
 * ```typescript
 * // Promote to admin
 * await fetch(`/api/groups/${groupId}/admins`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ userId: 'user-id' })
 * });
 * ```
 */

import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { ApiError } from '@/lib/errors/api-errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';

const PromoteAdminSchema = z.object({
  userId: z.string(),
});

/**
 * POST /api/groups/[groupId]/admins
 * Promote a member to admin (admin only)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;
    const body = await request.json();
    const data = PromoteAdminSchema.parse(body);

    await asUser(user, async (db) => {
      // Check if user is admin
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      });

      if (!isAdmin) {
        throw new ApiError(
          'Only group admins can promote members to admin',
          403
        );
      }

      // Check if target user is a member
      const isMember = await db.userGroupMember.findFirst({
        where: {
          groupId,
          userId: data.userId,
        },
      });

      if (!isMember) {
        throw new ApiError('User must be a member of the group', 400);
      }

      // Check if already an admin
      const existingAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: data.userId,
        },
      });

      if (existingAdmin) {
        throw new ApiError('User is already an admin', 400);
      }

      // Promote to admin
      await db.userGroupAdmin.create({
        data: {
          id: nanoid(),
          groupId,
          userId: data.userId,
          grantedBy: user.userId,
          grantedAt: new Date(),
        },
      });
    });

    logger.info(
      'Member promoted to admin',
      { userId: user.userId, groupId, promotedUserId: data.userId },
      'POST /api/groups/:groupId/admins'
    );

    return successResponse({ success: true });
  }
);

/**
 * DELETE /api/groups/[groupId]/admins
 * Remove admin status from a member (admin only)
 */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;
    const { searchParams } = new URL(request.url);
    const userIdToRemove = searchParams.get('userId');

    if (!userIdToRemove) {
      throw new ApiError('userId parameter is required', 400);
    }

    await asUser(user, async (db) => {
      // Check if user is admin
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      });

      if (!isAdmin) {
        throw new ApiError('Only group admins can remove admin status', 403);
      }

      // Cannot remove admin status from creator
      const group = await db.userGroup.findUnique({
        where: { id: groupId },
      });

      if (group?.createdById === userIdToRemove) {
        throw new ApiError(
          'Cannot remove admin status from group creator',
          400
        );
      }

      // Remove admin status
      await db.userGroupAdmin.deleteMany({
        where: {
          groupId,
          userId: userIdToRemove,
        },
      });
    });

    logger.info(
      'Admin status removed',
      { userId: user.userId, groupId, removedAdminUserId: userIdToRemove },
      'DELETE /api/groups/:groupId/admins'
    );

    return successResponse({ success: true });
  }
);

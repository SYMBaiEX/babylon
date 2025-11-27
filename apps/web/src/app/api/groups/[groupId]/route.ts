/**
 * Group Management API
 *
 * @route GET /api/groups/[groupId] - Get group details
 * @route PUT /api/groups/[groupId] - Update group
 * @route DELETE /api/groups/[groupId] - Delete group
 * @access Authenticated (members/admins only)
 *
 * @description
 * Manages individual group details, settings, and lifecycle. GET returns group
 * information with members and admins. PUT updates group name/description (admin only).
 * DELETE removes the group (creator/admin only).
 *
 * @openapi
 * /api/groups/{groupId}:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get group details
 *     description: Returns group information including members and admins
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     members:
 *                       type: array
 *                     admins:
 *                       type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a group member
 *       404:
 *         description: Group not found
 *   put:
 *     tags:
 *       - Groups
 *     summary: Update group
 *     description: Updates group name and description (admin only)
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Group updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a group admin
 *       404:
 *         description: Group not found
 *   delete:
 *     tags:
 *       - Groups
 *     summary: Delete group
 *     description: Permanently deletes group (creator/admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to delete group
 *       404:
 *         description: Group not found
 *
 * @example
 * ```typescript
 * // Get group details
 * const group = await fetch(`/api/groups/${groupId}`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 *
 * // Update group
 * await fetch(`/api/groups/${groupId}`, {
 *   method: 'PUT',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     name: 'New Group Name',
 *     description: 'Updated description'
 *   })
 * });
 * ```
 *
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { ApiError } from '@/lib/errors/api-errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/groups/[groupId]
 * Get group details including members and admins
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;

    const groupDetails = await asUser(user, async (db) => {
      // Fetch the group
      const group = await db.userGroup.findUnique({
        where: { id: groupId },
      });

      if (!group) {
        throw new ApiError('Group not found', 404);
      }

      // Fetch members and admins separately
      const groupMembers = await db.userGroupMember.findMany({
        where: { groupId },
      });

      const groupAdmins = await db.userGroupAdmin.findMany({
        where: { groupId },
      });

      const isMember = groupMembers.some((m) => m.userId === user.userId);
      const isAdmin = groupAdmins.some((a) => a.userId === user.userId);

      if (!isMember && !isAdmin) {
        throw new ApiError('You are not a member of this group', 403);
      }

      // Fetch member details
      const memberIds = groupMembers.map((m) => m.userId);
      const members = await db.user.findMany({
        where: {
          id: { in: memberIds },
        },
      });

      const adminIds = groupAdmins.map((a) => a.userId);

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        createdById: group.createdById,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          username: m.username,
          profileImageUrl: m.profileImageUrl,
          isAdmin: adminIds.includes(m.id),
          joinedAt:
            groupMembers.find((gm) => gm.userId === m.id)?.joinedAt ||
            new Date(),
        })),
        isAdmin,
        isCreator: group.createdById === user.userId,
      };
    });

    logger.info(
      'Group details retrieved',
      { userId: user.userId, groupId },
      'GET /api/groups/:groupId'
    );

    return successResponse({ group: groupDetails });
  }
);

/**
 * PATCH /api/groups/[groupId]
 * Update group details (admin only)
 */
export const PATCH = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;
    const body = await request.json();
    const data = UpdateGroupSchema.parse(body);

    const updatedGroup = await asUser(user, async (db) => {
      // Check if user is admin
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      });

      if (!isAdmin) {
        throw new ApiError('Only group admins can update group details', 403);
      }

      // Update group
      const group = await db.userGroup.update({
        where: { id: groupId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      // Update associated chat name if name changed
      if (data.name) {
        await db.chat.updateMany({
          where: {
            groupId: groupId,
            isGroup: true,
          },
          data: {
            name: data.name,
            updatedAt: new Date(),
          },
        });
      }

      return group;
    });

    logger.info(
      'Group updated',
      { userId: user.userId, groupId },
      'PATCH /api/groups/:groupId'
    );

    return successResponse({ group: updatedGroup });
  }
);

/**
 * DELETE /api/groups/[groupId]
 * Delete a group (admin only)
 */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;

    await asUser(user, async (db) => {
      // Check if user is admin
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      });

      if (!isAdmin) {
        throw new ApiError('Only group admins can delete the group', 403);
      }

      // Delete group (cascades to members and admins)
      await db.userGroup.delete({
        where: { id: groupId },
      });

      // Note: Associated chats remain but could be cleaned up separately
    });

    logger.info(
      'Group deleted',
      { userId: user.userId, groupId },
      'DELETE /api/groups/:groupId'
    );

    return successResponse({ success: true });
  }
);

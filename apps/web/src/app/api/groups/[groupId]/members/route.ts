/**
 * Group Members API
 *
 * REFACTORED: Now uses unified Group/GroupMember/GroupInvite tables.
 *
 * @route POST /api/groups/[groupId]/members - Add member to group (sends invite)
 * @route DELETE /api/groups/[groupId]/members - Remove member from group
 * @access Authenticated (admins can add/remove, members can self-remove)
 */

import {
  ApiError,
  authenticate,
  notifyUserGroupInvite,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { asUser } from '@babylon/db';
import { logger } from '@babylon/shared';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const AddMemberSchema = z.object({
  userId: z.string(),
});

/**
 * POST /api/groups/[groupId]/members
 * Add a member to the group via invite (admin only, using unified schema)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ groupId: string }> }
  ) => {
    const user = await authenticate(request);
    const { groupId } = await params;
    const body = await request.json();
    const data = AddMemberSchema.parse(body);

    let groupName = 'Unknown';
    let inviteId = '';

    await asUser(user, async (db) => {
      // Check if user is admin or owner (unified GroupMember)
      const membership = await db.groupMember.findFirst({
        where: {
          groupId,
          userId: user.userId,
          isActive: true,
        },
      });

      if (!membership || !['admin', 'owner'].includes(membership.role)) {
        throw new ApiError('Only group admins can add members', 403);
      }

      // Check if user is already a member (unified GroupMember)
      const existingMember = await db.groupMember.findFirst({
        where: {
          groupId,
          userId: data.userId,
          isActive: true,
        },
      });

      if (existingMember) {
        throw new ApiError('User is already a member of this group', 400);
      }

      // Check if there's already an existing invite (unique constraint on groupId + invitedUserId)
      const existingInvite = await db.groupInvite.findFirst({
        where: {
          groupId,
          invitedUserId: data.userId,
        },
      });

      if (existingInvite) {
        if (existingInvite.status === 'pending') {
          throw new ApiError('User already has a pending invite', 400);
        }
        // For declined invites, reset to pending (re-invite flow)
        if (existingInvite.status === 'declined') {
          await db.groupInvite.update({
            where: { id: existingInvite.id },
            data: {
              status: 'pending',
              invitedBy: user.userId,
              invitedAt: new Date(),
              respondedAt: null,
            },
          });
          inviteId = existingInvite.id;
        }
      }

      // Get group details for notification (unified Group)
      const group = await db.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      groupName = group?.name || 'Unknown';

      // Create new invite only if no existing invite was found
      if (!inviteId) {
        inviteId = nanoid();
        await db.groupInvite.create({
          data: {
            id: inviteId,
            groupId,
            invitedUserId: data.userId,
            invitedBy: user.userId,
            status: 'pending',
          },
        });
      }
    });

    // Send notification to the invited user (outside of asUser context)
    await notifyUserGroupInvite(
      data.userId,
      user.userId,
      groupId,
      groupName,
      inviteId
    );

    logger.info(
      'Member invited to group',
      { userId: user.userId, groupId, invitedUserId: data.userId },
      'POST /api/groups/:groupId/members'
    );

    return successResponse({ success: true, inviteId });
  }
);

/**
 * DELETE /api/groups/[groupId]/members
 * Remove a member from the group (admin only or self, using unified schema)
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
      // Check if user is admin/owner or removing themselves
      const userMembership = await db.groupMember.findFirst({
        where: {
          groupId,
          userId: user.userId,
          isActive: true,
        },
      });

      const isSelf = user.userId === userIdToRemove;
      const isAdmin =
        userMembership &&
        ['admin', 'owner'].includes(userMembership.role);

      if (!isAdmin && !isSelf) {
        throw new ApiError('Only group admins can remove members', 403);
      }

      // Get target member
      const targetMembership = await db.groupMember.findFirst({
        where: {
          groupId,
          userId: userIdToRemove,
          isActive: true,
        },
      });

      if (!targetMembership) {
        throw new ApiError('User is not a member of this group', 404);
      }

      // Cannot remove the owner
      if (targetMembership.role === 'owner') {
        throw new ApiError('Cannot remove the group owner', 400);
      }

      // Mark member as inactive (soft delete) - unified GroupMember
      await db.groupMember.update({
        where: { id: targetMembership.id },
        data: {
          isActive: false,
          kickedAt: new Date(),
          kickReason: isSelf ? 'left' : 'removed by admin',
        },
      });

      // Find chat for this group (Chat.groupId → Group.id)
      const groupChat = await db.chat.findFirst({
        where: { groupId },
        select: { id: true },
      });

      // Remove from associated chat
      if (groupChat) {
        await db.chatParticipant.deleteMany({
          where: {
            chatId: groupChat.id,
            userId: userIdToRemove,
          },
        });
      }
    });

    logger.info(
      'Member removed from group',
      { userId: user.userId, groupId, removedUserId: userIdToRemove },
      'DELETE /api/groups/:groupId/members'
    );

    return successResponse({ success: true });
  }
);

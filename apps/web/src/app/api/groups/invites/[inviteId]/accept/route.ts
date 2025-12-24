/**
 * Group Invite Accept API
 *
 * REFACTORED: Now uses unified Group/GroupMember/GroupInvite tables.
 *
 * @route POST /api/groups/invites/[inviteId]/accept - Accept group invite
 * @access Authenticated
 */

import {
  ApiError,
  authenticate,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { asUser } from '@babylon/db';
import { logger } from '@babylon/shared';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';

/**
 * POST /api/groups/invites/[inviteId]/accept
 * Accept a group invitation (unified schema)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ inviteId: string }> }
  ) => {
    const user = await authenticate(request);
    const { inviteId } = await params;

    const result = await asUser(user, async (db) => {
      // Get the invite (unified GroupInvite)
      const invite = await db.groupInvite.findUnique({
        where: { id: inviteId },
      });

      if (!invite) {
        throw new ApiError('Invite not found', 404);
      }

      if (invite.invitedUserId !== user.userId) {
        throw new ApiError('This invite is not for you', 403);
      }

      if (invite.status !== 'pending') {
        throw new ApiError('This invite has already been processed', 400);
      }

      // Check if user is already a member (unified GroupMember)
      const existingMember = await db.groupMember.findFirst({
        where: {
          groupId: invite.groupId,
          userId: user.userId,
          isActive: true,
        },
      });

      if (existingMember) {
        // Update invite status and return
        await db.groupInvite.update({
          where: { id: inviteId },
          data: {
            status: 'accepted',
            respondedAt: new Date(),
          },
        });
        throw new ApiError('You are already a member of this group', 400);
      }

      // Find the chat for this group (Chat.groupId → Group.id)
      const groupChat = await db.chat.findFirst({
        where: { groupId: invite.groupId },
        select: { id: true },
      });

      // Add user as member (unified GroupMember)
      await db.groupMember.create({
        data: {
          id: nanoid(),
          groupId: invite.groupId,
          userId: user.userId,
          role: 'member',
          addedBy: invite.invitedBy,
        },
      });

      // Add to associated chat
      if (groupChat) {
        await db.chatParticipant.create({
          data: {
            id: nanoid(),
            chatId: groupChat.id,
            userId: user.userId,
            joinedAt: new Date(),
          },
        });
      }

      // Update invite status (unified GroupInvite)
      await db.groupInvite.update({
        where: { id: inviteId },
        data: {
          status: 'accepted',
          respondedAt: new Date(),
        },
      });

      // Mark notification as read
      await db.notification.updateMany({
        where: {
          userId: user.userId,
          type: 'group_invite',
        },
        data: {
          read: true,
        },
      });

      return {
        groupId: invite.groupId,
        chatId: groupChat?.id || null,
      };
    });

    logger.info(
      'Group invite accepted',
      { userId: user.userId, inviteId },
      'POST /api/groups/invites/:inviteId/accept'
    );

    return successResponse(result);
  }
);

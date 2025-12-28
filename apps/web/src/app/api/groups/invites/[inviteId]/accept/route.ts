/**
 * Group Invite Accept API
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
import { GROUP_CONFIG, logger } from '@babylon/shared';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';

/**
 * POST /api/groups/invites/[inviteId]/accept
 * Accept a group invitation
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ inviteId: string }> }
  ) => {
    const user = await authenticate(request);
    const { inviteId } = await params;

    const result = await asUser(user, async (db) => {
      // Get the invite
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

      // Check if user is at the NPC group limit (only NPC groups count toward the limit)
      const activeMemberships = await db.groupMember.findMany({
        where: {
          userId: user.userId,
          isActive: true,
        },
      });

      // Fetch all groups in one query to avoid N+1
      const groupIds = activeMemberships.map((m) => m.groupId);
      const memberGroups =
        groupIds.length > 0
          ? await db.group.findMany({
              where: { id: { in: groupIds } },
              select: { id: true, type: true },
            })
          : [];

      // Count NPC groups
      const npcGroupCount = memberGroups.filter((g) => g.type === 'npc').length;

      if (npcGroupCount >= GROUP_CONFIG.MAX_ACTIVE_USER_GROUPS) {
        throw new ApiError(
          `You can only be in ${GROUP_CONFIG.MAX_ACTIVE_USER_GROUPS} NPC groups at a time. Leave a group first.`,
          400
        );
      }

      // Check if user already has a member record (unique constraint on groupId + userId)
      const existingMember = await db.groupMember.findFirst({
        where: {
          groupId: invite.groupId,
          userId: user.userId,
        },
      });

      if (existingMember) {
        if (existingMember.isActive) {
          // Already an active member - don't modify invite state, just return error
          throw new ApiError('You are already a member of this group', 400);
        }

        // Reactivate inactive member (was kicked/left before)
        await db.groupMember.update({
          where: { id: existingMember.id },
          data: {
            isActive: true,
            role: 'member',
            joinedAt: new Date(),
            addedBy: invite.invitedBy,
            kickedAt: null,
            kickReason: null,
          },
        });
      } else {
        // Create new member record
        await db.groupMember.create({
          data: {
            id: nanoid(),
            groupId: invite.groupId,
            userId: user.userId,
            role: 'member',
            addedBy: invite.invitedBy,
          },
        });
      }

      // Find the chat for this group (Chat.groupId → Group.id)
      const groupChat = await db.chat.findFirst({
        where: { groupId: invite.groupId },
        select: { id: true },
      });

      // Add to associated chat (handle existing inactive participant)
      if (groupChat) {
        const existingParticipant = await db.chatParticipant.findFirst({
          where: {
            chatId: groupChat.id,
            userId: user.userId,
          },
        });

        if (existingParticipant) {
          // Reactivate if inactive
          if (!existingParticipant.isActive) {
            await db.chatParticipant.update({
              where: { id: existingParticipant.id },
              data: {
                isActive: true,
                joinedAt: new Date(),
              },
            });
          }
        } else {
          await db.chatParticipant.create({
            data: {
              id: nanoid(),
              chatId: groupChat.id,
              userId: user.userId,
              joinedAt: new Date(),
            },
          });
        }
      }

      // Update invite status
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

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
import { GROUP_CONFIG, logger } from '@babylon/shared';
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

      // Check if user is at the NPC group limit (only NPC groups count toward the limit)
      const npcGroupMemberships = await db.groupMember.findMany({
        where: {
          userId: user.userId,
          isActive: true,
        },
      });

      // Filter to only NPC groups
      let npcGroupCount = 0;
      for (const membership of npcGroupMemberships) {
        const group = await db.group.findUnique({
          where: { id: membership.groupId },
          select: { type: true },
        });
        if (group?.type === 'npc') {
          npcGroupCount++;
        }
      }

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
          // Already an active member
          await db.groupInvite.update({
            where: { id: inviteId },
            data: {
              status: 'accepted',
              respondedAt: new Date(),
            },
          });
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
                kickedAt: null,
                kickReason: null,
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

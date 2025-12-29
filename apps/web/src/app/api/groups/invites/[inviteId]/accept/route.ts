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
import {
  asUser,
  chatParticipants,
  generateSnowflakeId,
  groupMembers,
  sql,
} from '@babylon/db';
import { GROUP_CONFIG, logger } from '@babylon/shared';
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

      // Check if user is already an active member (fail fast, no race condition here)
      const existingActiveMember = await db.groupMember.findFirst({
        where: {
          groupId: invite.groupId,
          userId: user.userId,
          isActive: true,
        },
      });

      if (existingActiveMember) {
        throw new ApiError('You are already a member of this group', 400);
      }

      // Find the chat for this group (Chat.groupId → Group.id)
      const groupChat = await db.chat.findFirst({
        where: { groupId: invite.groupId },
        select: { id: true },
      });

      const now = new Date();

      // Use transaction with atomic upserts to prevent race conditions
      await db.transaction(async (tx) => {
        // Upsert GroupMember - use raw SQL for partial index compatibility
        // INSERT new member OR update inactive member to active
        const memberId = await generateSnowflakeId();
        await tx.execute(sql`
          INSERT INTO "GroupMember" (
            "id", "groupId", "userId", "role", "addedBy", "joinedAt", "isActive",
            "messageCount", "qualityScore"
          ) VALUES (
            ${memberId}, ${invite.groupId}, ${user.userId}, 'member', ${invite.invitedBy}, ${now}, true,
            0, 1.0
          )
          ON CONFLICT ("groupId", "userId") WHERE "isActive" = true
          DO NOTHING
        `);

        // Also handle the case where there's an inactive record (not covered by partial index)
        // Update any inactive records to active
        await tx
          .update(groupMembers)
          .set({
            isActive: true,
            role: 'member',
            addedBy: invite.invitedBy,
            joinedAt: now,
            kickedAt: null,
            kickReason: null,
          })
          .where(
            sql`${groupMembers.groupId} = ${invite.groupId} AND ${groupMembers.userId} = ${user.userId} AND ${groupMembers.isActive} = false`
          );

        // Upsert ChatParticipant if chat exists
        if (groupChat) {
          const participantId = await generateSnowflakeId();
          await tx
            .insert(chatParticipants)
            .values({
              id: participantId,
              chatId: groupChat.id,
              userId: user.userId,
              joinedAt: now,
              isActive: true,
            })
            .onConflictDoUpdate({
              target: [chatParticipants.chatId, chatParticipants.userId],
              set: {
                isActive: true,
                joinedAt: now,
              },
            });
        }
      });

      // Update invite status
      await db.groupInvite.update({
        where: { id: inviteId },
        data: {
          status: 'accepted',
          respondedAt: new Date(),
        },
      });

      // Mark only this specific invite's notification as read
      await db.notification.updateMany({
        where: {
          userId: user.userId,
          type: 'group_invite',
          inviteId: inviteId,
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

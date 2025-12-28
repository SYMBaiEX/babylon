/**
 * Group Members API
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
import {
  asUser,
  chatParticipants,
  generateSnowflakeId,
  groupMembers,
  sql,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const AddMemberSchema = z.object({
  userId: z.string(),
});

/**
 * POST /api/groups/[groupId]/members
 * Add a member to the group via invite (admin only)
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
    let isAgent = false;

    await asUser(user, async (db) => {
      // Check if user is admin or owner
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

      // Check if invitee is an agent (auto-accept, agents can't manually accept invites)
      const invitee = await db.user.findUnique({
        where: { id: data.userId },
        select: { isAgent: true },
      });
      isAgent = invitee?.isAgent === true;

      // Check if user is already a member
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

      // Get group details for notification
      const group = await db.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      groupName = group?.name || 'Unknown';

      // Find the chat for this group
      const groupChat = await db.chat.findFirst({
        where: { groupId },
        select: { id: true },
      });

      if (isAgent) {
        // Agents are auto-accepted - add them directly using atomic upserts
        const now = new Date();

        await db.transaction(async (tx) => {
          // Upsert GroupMember - use raw SQL for partial index compatibility
          const memberId = await generateSnowflakeId();
          await tx.execute(sql`
            INSERT INTO "GroupMember" (
              "id", "groupId", "userId", "role", "addedBy", "joinedAt", "isActive",
              "messageCount", "qualityScore"
            ) VALUES (
              ${memberId}, ${groupId}, ${data.userId}, 'member', ${user.userId}, ${now}, true,
              0, 1.0
            )
            ON CONFLICT ("groupId", "userId") WHERE "isActive" = true
            DO NOTHING
          `);

          // Update any inactive records to active
          await tx
            .update(groupMembers)
            .set({
              isActive: true,
              role: 'member',
              addedBy: user.userId,
              joinedAt: now,
              kickedAt: null,
              kickReason: null,
            })
            .where(
              sql`${groupMembers.groupId} = ${groupId} AND ${groupMembers.userId} = ${data.userId} AND ${groupMembers.isActive} = false`
            );

          // Upsert ChatParticipant if chat exists
          if (groupChat) {
            const participantId = await generateSnowflakeId();
            await tx
              .insert(chatParticipants)
              .values({
                id: participantId,
                chatId: groupChat.id,
                userId: data.userId,
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
      } else {
        // Regular users get an invite

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
          // For declined or accepted (user left) invites, reset to pending (re-invite flow)
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

        // Create new invite only if no existing invite was found
        if (!inviteId) {
          inviteId = await generateSnowflakeId();
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
      }
    });

    // Send notification to the invited user (only for non-agents)
    if (!isAgent && inviteId) {
      await notifyUserGroupInvite(
        data.userId,
        user.userId,
        groupId,
        groupName,
        inviteId
      );
    }

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
 * Remove a member from the group (admin only or self)
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
        userMembership && ['admin', 'owner'].includes(userMembership.role);

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

      // Mark member as inactive (soft delete)
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

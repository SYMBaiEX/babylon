/**
 * Group Members API
 *
 * @route POST /api/groups/[groupId]/members - Add member to group directly
 * @route DELETE /api/groups/[groupId]/members - Remove member from group
 * @access Authenticated (admins can add/remove, members can self-remove)
 *
 * NOTE: For MVP, members are added directly without invite flow.
 * NPC groups (type: 'npc') use the tiered system and cannot have members added via this API.
 */

import {
  ApiError,
  authenticate,
  notifyGroupMemberAdded,
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
 * Add a member to the group directly (admin only)
 *
 * For MVP: All members (human and agent) are added directly without invite flow.
 * NPC groups use the tiered system and cannot be modified via this API.
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
    let chatId: string | null = null;

    const { adderName } = await asUser(user, async (db) => {
      // Get group details first to check type
      const group = await db.group.findUnique({
        where: { id: groupId },
        select: { name: true, type: true },
      });

      if (!group) {
        throw new ApiError('Group not found', 404);
      }

      groupName = group.name || 'Unknown';

      // NPC groups use the tiered system, cannot add members directly
      if (group.type === 'npc') {
        throw new ApiError(
          'Cannot directly add members to NPC groups. NPC groups use the tiered invitation system.',
          403
        );
      }

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

      // Verify the user to add exists and is not banned
      const userToAdd = await db.user.findUnique({
        where: { id: data.userId },
        select: { id: true, isBanned: true, displayName: true, username: true },
      });

      if (!userToAdd) {
        throw new ApiError('User not found', 404);
      }

      if (userToAdd.isBanned) {
        throw new ApiError('Cannot add banned users to groups', 400);
      }

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

      // Find the chat for this group
      const groupChat = await db.chat.findFirst({
        where: { groupId },
        select: { id: true },
      });

      chatId = groupChat?.id || null;

      // Add member directly using Drizzle upsert
      const now = new Date();
      const memberId = await generateSnowflakeId();

      await db
        .insert(groupMembers)
        .values({
          id: memberId,
          groupId,
          userId: data.userId,
          role: 'member',
          addedBy: user.userId,
          joinedAt: now,
          isActive: true,
          messageCount: 0,
          qualityScore: 1.0,
        })
        .onConflictDoUpdate({
          target: [groupMembers.groupId, groupMembers.userId],
          set: {
            isActive: true,
            role: 'member',
            addedBy: user.userId,
            joinedAt: now,
            kickedAt: sql`NULL`,
            kickReason: sql`NULL`,
          },
        });

      // Upsert ChatParticipant if chat exists
      if (groupChat) {
        const participantId = await generateSnowflakeId();
        await db
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

      // Get adder's name for system message
      const adder = await db.user.findUnique({
        where: { id: user.userId },
        select: { displayName: true, username: true },
      });
      const adderName = adder?.displayName || adder?.username || 'Someone';
      const addedUserName =
        userToAdd.displayName || userToAdd.username || 'Someone';

      // Create system message announcing the new member
      if (groupChat) {
        await db.message.create({
          data: {
            id: await generateSnowflakeId(),
            chatId: groupChat.id,
            senderId: 'system',
            content: `${adderName} added ${addedUserName} to the group`,
            createdAt: now,
          },
        });
      }

      return { adderName };
    });

    // Send notification to the added user (pass adderName to avoid extra query)
    await notifyGroupMemberAdded(
      data.userId,
      user.userId,
      groupId,
      groupName,
      chatId || undefined,
      adderName
    );

    logger.info(
      'Member added to group',
      { userId: user.userId, groupId, addedUserId: data.userId },
      'POST /api/groups/:groupId/members'
    );

    return successResponse({ success: true, added: true });
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

      // Remove from associated chat and add system message
      if (groupChat) {
        await db.chatParticipant.deleteMany({
          where: {
            chatId: groupChat.id,
            userId: userIdToRemove,
          },
        });

        // Get names for system message
        const removedUser = await db.user.findUnique({
          where: { id: userIdToRemove },
          select: { displayName: true, username: true },
        });
        const removedName =
          removedUser?.displayName || removedUser?.username || 'Someone';

        if (isSelf) {
          // User left on their own
          await db.message.create({
            data: {
              id: await generateSnowflakeId(),
              chatId: groupChat.id,
              senderId: 'system',
              content: `${removedName} left the group`,
              createdAt: new Date(),
            },
          });
        } else {
          // User was removed by admin
          const admin = await db.user.findUnique({
            where: { id: user.userId },
            select: { displayName: true, username: true },
          });
          const adminName = admin?.displayName || admin?.username || 'Someone';

          await db.message.create({
            data: {
              id: await generateSnowflakeId(),
              chatId: groupChat.id,
              senderId: 'system',
              content: `${adminName} removed ${removedName} from the group`,
              createdAt: new Date(),
            },
          });
        }
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

/**
 * Admin Group Invite API
 *
 * @route POST /api/admin/group-invite - Send NPC group invite
 * @access Admin
 *
 * @description
 * Sends a group chat invite on behalf of an NPC to a user. Admin only.
 * Used for game mechanics and NPC interactions.
 *
 * @openapi
 * /api/admin/group-invite:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Send NPC group invite
 *     description: Sends group chat invite from NPC to user (admin only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - npcId
 *               - userId
 *               - chatId
 *               - chatName
 *             properties:
 *               npcId:
 *                 type: string
 *                 description: NPC actor ID
 *               userId:
 *                 type: string
 *                 description: Target user ID
 *               chatId:
 *                 type: string
 *                 description: Chat ID
 *               chatName:
 *                 type: string
 *                 description: Chat name
 *     responses:
 *       200:
 *         description: Invite sent successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * await fetch('/api/admin/group-invite', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${adminToken}` },
 *   body: JSON.stringify({
 *     npcId: 'npc-id',
 *     userId: 'user-id',
 *     chatId: 'chat-id',
 *     chatName: 'Group Chat'
 *   })
 * });
 * ```
 */

import {
  getClientIp,
  logAdminModify,
  notifyGroupChatInvite,
  requireAdmin,
  withErrorHandling,
} from '@babylon/api';
import { asSystem } from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import { generateSnowflakeId } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/group-invite
 * Send a group chat invite from an NPC to a user
 * Admin only
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const admin = await requireAdmin(request);

  const body = await request.json();
  const { npcId, userId, chatId, chatName } = body;

  // Audit log the invite
  logAdminModify({
    adminId: admin.userId,
    ipAddress: getClientIp(request.headers) ?? undefined,
    resourceType: 'group_invite',
    metadata: { action: 'send_group_invite', npcId, userId, chatId },
  });

  // Validate inputs
  if (!npcId || !userId) {
    return NextResponse.json(
      { error: 'npcId and userId are required' },
      { status: 400 }
    );
  }

  // Verify NPC exists
  const staticActor = StaticDataRegistry.getActor(npcId);
  const npc = staticActor
    ? { id: staticActor.id, name: staticActor.name }
    : await asSystem(async (db) => {
        return await db.user.findUnique({
          where: { id: npcId, isActor: true },
          select: { id: true, displayName: true, username: true },
        });
      });

  if (!npc) {
    return NextResponse.json({ error: 'NPC not found' }, { status: 404 });
  }

  // Verify user exists
  const targetUser = await asSystem(async (db) => {
    return await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true },
    });
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Check if user is already a member (using unified GroupMember)
  const finalChatIdCheck = chatId || `${npcId}-owned-chat`;
  const existingMembership = await asSystem(async (db) => {
    // First find the group for this chat
    const chat = await db.chat.findUnique({
      where: { id: finalChatIdCheck },
      select: { groupId: true },
    });
    if (!chat?.groupId) return null;

    return await db.groupMember.findFirst({
      where: {
        groupId: chat.groupId,
        userId,
        isActive: true,
      },
    });
  });

  if (existingMembership) {
    return NextResponse.json(
      { error: 'User is already a member of this group' },
      { status: 400 }
    );
  }

  // Generate chat ID and name if not provided
  const finalChatId = chatId || `${npcId}-owned-chat`;
  const npcName =
    'name' in npc ? npc.name : npc.displayName || npc.username || 'Unknown';
  const finalChatName = chatName || `${npcName}'s Inner Circle`;

  // Record the invite using unified Group/GroupMember schema
  await asSystem(async (db) => {
    // Find or create the group for this chat
    let chat = await db.chat.findUnique({
      where: { id: finalChatId },
    });

    let groupId: string;

    if (!chat) {
      // Create Group first
      groupId = await generateSnowflakeId();
      await db.group.create({
        data: {
          id: groupId,
          name: finalChatName,
          type: 'npc',
          ownerId: npcId,
          createdById: npcId,
          updatedAt: new Date(),
        },
      });

      // Create Chat with groupId link
      await db.chat.create({
        data: {
          id: finalChatId,
          name: finalChatName,
          isGroup: true,
          gameId: 'realtime',
          groupId,
          updatedAt: new Date(),
        },
      });
    } else if (!chat.groupId) {
      // Chat exists but no group - create one
      groupId = await generateSnowflakeId();
      await db.group.create({
        data: {
          id: groupId,
          name: finalChatName,
          type: 'npc',
          ownerId: npcId,
          createdById: npcId,
          updatedAt: new Date(),
        },
      });

      await db.chat.update({
        where: { id: finalChatId },
        data: { groupId },
      });
    } else {
      groupId = chat.groupId;
    }

    // Add user to chat participants
    const existingParticipant = await db.chatParticipant.findFirst({
      where: {
        chatId: finalChatId,
        userId,
      },
    });

    if (!existingParticipant) {
      await db.chatParticipant.create({
        data: {
          id: await generateSnowflakeId(),
          chatId: finalChatId,
          userId,
        },
      });
    }

    // Record membership in unified GroupMember table
    await db.groupMember.create({
      data: {
        id: await generateSnowflakeId(),
        groupId,
        userId,
        role: 'member',
        addedBy: npcId,
      },
    });

    // Send notification to user
    await notifyGroupChatInvite(userId, npcId, finalChatId, finalChatName);
  });

  return NextResponse.json({
    success: true,
    message: `Invited ${targetUser.displayName || targetUser.username} to ${finalChatName}`,
    data: {
      chatId: finalChatId,
      chatName: finalChatName,
      npcId,
      npcName,
      userId,
    },
  });
});

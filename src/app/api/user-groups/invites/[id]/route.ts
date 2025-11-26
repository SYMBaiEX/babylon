/**
 * User Group Invite Actions API
 * 
 * @route GET /api/user-groups/invites/[id] - Get invite details
 * @route POST /api/user-groups/invites/[id] - Accept invite
 * @route DELETE /api/user-groups/invites/[id] - Decline invite
 * @access Authenticated
 * 
 * @description
 * Manages group invite actions. GET returns invite details. POST accepts invite
 * and adds user to group. DELETE declines invite. Only works for invites
 * belonging to authenticated user.
 * 
 * @openapi
 * /api/user-groups/invites/{id}:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get invite details
 *     description: Returns invite details with group and inviter info
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite ID
 *     responses:
 *       200:
 *         description: Invite details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invite:
 *                   type: object
 *                 group:
 *                   type: object
 *                 inviter:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Invite not for this user
 *       404:
 *         description: Invite not found
 *   post:
 *     tags:
 *       - User Groups
 *     summary: Accept group invite
 *     description: Accepts invite and adds user to group and chat
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite ID
 *     responses:
 *       200:
 *         description: Invite accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 groupId:
 *                   type: string
 *                 chatId:
 *                   type: string
 *       400:
 *         description: Invite already responded to
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Invite not for this user
 *       404:
 *         description: Invite not found
 *   delete:
 *     tags:
 *       - User Groups
 *     summary: Decline group invite
 *     description: Declines invite and marks notification as read
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite ID
 *     responses:
 *       200:
 *         description: Invite declined successfully
 *       400:
 *         description: Invite already responded to
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Invite not for this user
 *       404:
 *         description: Invite not found
 * 
 * @example
 * ```typescript
 * // Accept invite
 * await fetch(`/api/user-groups/invites/${inviteId}`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { authenticate } from '@/lib/api/auth-middleware';
import { generateSnowflakeId } from '@/lib/snowflake';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { eq, and } from 'drizzle-orm';
import { userGroupInvites, userGroupMembers, userGroups, chats, chatParticipants, notifications, users } from '@/db/schema';

/**
 * POST /api/user-groups/invites/[id]
 * Accept a group invite
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await authenticate(request);
  const { id: inviteId } = await context.params;

  // Get invite
  const inviteResult = await db.select().from(userGroupInvites).where(eq(userGroupInvites.id, inviteId)).limit(1);
  const invite = inviteResult[0];

  if (!invite) {
    return NextResponse.json(
      { error: 'Invite not found' },
      { status: 404 }
    );
  }

  // Verify invite is for this user
  if (invite.invitedUserId !== user.userId) {
    return NextResponse.json(
      { error: 'This invite is not for you' },
      { status: 403 }
    );
  }

  // Check if already responded
  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: `Invite already ${invite.status}` },
      { status: 400 }
    );
  }

  // Update invite status
  await db.update(userGroupInvites)
    .set({
      status: 'accepted',
      respondedAt: new Date(),
    })
    .where(eq(userGroupInvites.id, inviteId));

  // Add user to group
  await db.insert(userGroupMembers).values({
    id: await generateSnowflakeId(),
    groupId: invite.groupId,
    userId: user.userId,
    addedBy: invite.invitedBy,
  });

  // Add to chat participants
  const groupResult = await db.select({ name: userGroups.name }).from(userGroups).where(eq(userGroups.id, invite.groupId)).limit(1);
  const group = groupResult[0];

  // Find the chat for this group
  const chatResult = await db.select().from(chats)
    .where(and(
      eq(chats.name, group?.name ?? ''),
      eq(chats.isGroup, true)
    ))
    .limit(1);
  const chat = chatResult[0];

  if (chat) {
    // Check if participant already exists
    const existingParticipant = await db.select().from(chatParticipants)
      .where(and(
        eq(chatParticipants.chatId, chat.id),
        eq(chatParticipants.userId, user.userId)
      ))
      .limit(1);
    
    if (!existingParticipant[0]) {
      await db.insert(chatParticipants).values({
        id: await generateSnowflakeId(),
        chatId: chat.id,
        userId: user.userId,
      });
    }
  }

  // Mark notification as read
  await db.update(notifications)
    .set({ read: true })
    .where(and(
      eq(notifications.userId, user.userId),
      eq(notifications.type, 'group_invite'),
      eq(notifications.actorId, invite.invitedBy)
    ));

  return successResponse({
    data: {
      message: 'Invite accepted',
      groupId: invite.groupId,
      chatId: chat?.id,
    },
  });
});

/**
 * DELETE /api/user-groups/invites/[id]
 * Decline a group invite
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await authenticate(request);
  const { id: inviteId } = await context.params;

  // Get invite
  const inviteResult = await db.select().from(userGroupInvites).where(eq(userGroupInvites.id, inviteId)).limit(1);
  const invite = inviteResult[0];

  if (!invite) {
    return NextResponse.json(
      { error: 'Invite not found' },
      { status: 404 }
    );
  }

  // Verify invite is for this user
  if (invite.invitedUserId !== user.userId) {
    return NextResponse.json(
      { error: 'This invite is not for you' },
      { status: 403 }
    );
  }

  // Check if already responded
  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: `Invite already ${invite.status}` },
      { status: 400 }
    );
  }

  // Update invite status
  await db.update(userGroupInvites)
    .set({
      status: 'declined',
      respondedAt: new Date(),
    })
    .where(eq(userGroupInvites.id, inviteId));

  // Mark notification as read
  await db.update(notifications)
    .set({ read: true })
    .where(and(
      eq(notifications.userId, user.userId),
      eq(notifications.type, 'group_invite'),
      eq(notifications.actorId, invite.invitedBy)
    ));

  return successResponse({
    data: {
      message: 'Invite declined',
    },
  });
});

/**
 * GET /api/user-groups/invites/[id]
 * Get invite details
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await authenticate(request);
  const { id: inviteId } = await context.params;

  // Get invite with group and inviter details
  const inviteResult = await db.select().from(userGroupInvites).where(eq(userGroupInvites.id, inviteId)).limit(1);
  const invite = inviteResult[0];

  if (!invite) {
    return NextResponse.json(
      { error: 'Invite not found' },
      { status: 404 }
    );
  }

  // Verify invite is for this user
  if (invite.invitedUserId !== user.userId) {
    return NextResponse.json(
      { error: 'This invite is not for you' },
      { status: 403 }
    );
  }

  // Get group details with member count
  const groupResult = await db.select().from(userGroups).where(eq(userGroups.id, invite.groupId)).limit(1);
  const group = groupResult[0];
  
  let memberCount = 0;
  if (group) {
    const members = await db.select({ userId: userGroupMembers.userId }).from(userGroupMembers).where(eq(userGroupMembers.groupId, group.id));
    memberCount = members.length;
  }

  // Get inviter details
  const inviterResult = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    profileImageUrl: users.profileImageUrl,
  }).from(users).where(eq(users.id, invite.invitedBy)).limit(1);
  const inviter = inviterResult[0];

  return successResponse({
    data: {
      invite: {
        id: invite.id,
        status: invite.status,
        invitedAt: invite.invitedAt,
        respondedAt: invite.respondedAt,
      },
      group: group ? {
        id: group.id,
        name: group.name,
        description: group.description,
        memberCount,
      } : null,
      inviter: inviter ? {
        id: inviter.id,
        name: inviter.displayName || inviter.username,
        username: inviter.username,
        profileImageUrl: inviter.profileImageUrl,
      } : null,
    },
  });
});

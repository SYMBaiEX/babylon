/**
 * User Group Details API
 *
 * @route GET /api/user-groups/[id] - Get group details
 * @route PUT /api/user-groups/[id] - Update group
 * @route DELETE /api/user-groups/[id] - Delete group
 * @access Authenticated (member/admin)
 *
 * @description
 * Manages individual user groups. GET returns group details with members and admins.
 * PUT updates group name/description (admin only). DELETE removes group (admin only).
 *
 * @openapi
 * /api/user-groups/{id}:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get group details
 *     description: Returns group details with members and admins (members only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a member of this group
 *   put:
 *     tags:
 *       - User Groups
 *     summary: Update group
 *     description: Updates group name and description (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Group updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   delete:
 *     tags:
 *       - User Groups
 *     summary: Delete group
 *     description: Deletes a group (admin only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * // Get group details
 * const { group } = await fetch(`/api/user-groups/${groupId}`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 */

import { authenticate, withErrorHandling } from '@babylon/api';
import {
  and,
  chatParticipants,
  chats,
  db,
  eq,
  inArray,
  userGroupAdmins,
  userGroupMembers,
  userGroups,
  users,
} from '@babylon/db';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/user-groups/[id]
 * Get group details with members and admins
 */
export const GET = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await context.params;

    // Check if user is a member
    const [membership] = await db
      .select({ userId: userGroupMembers.userId })
      .from(userGroupMembers)
      .where(eq(userGroupMembers.groupId, groupId))
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this group' },
        { status: 403 }
      );
    }

    // Get group
    const [group] = await db
      .select()
      .from(userGroups)
      .where(eq(userGroups.id, groupId))
      .limit(1);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Get group members
    const groupMembersList = await db
      .select({
        userId: userGroupMembers.userId,
        joinedAt: userGroupMembers.joinedAt,
        addedBy: userGroupMembers.addedBy,
      })
      .from(userGroupMembers)
      .where(eq(userGroupMembers.groupId, groupId));

    // Get group admins
    const groupAdminsList = await db
      .select({
        userId: userGroupAdmins.userId,
        grantedAt: userGroupAdmins.grantedAt,
        grantedBy: userGroupAdmins.grantedBy,
      })
      .from(userGroupAdmins)
      .where(eq(userGroupAdmins.groupId, groupId));

    // Get user details for members
    const memberIds = groupMembersList.map(
      (m: (typeof groupMembersList)[number]) => m.userId
    );
    const usersList =
      memberIds.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              displayName: users.displayName,
              profileImageUrl: users.profileImageUrl,
            })
            .from(users)
            .where(inArray(users.id, memberIds))
        : [];

    // Map users to members
    const members = groupMembersList.map(
      (member: (typeof groupMembersList)[number]) => {
        const userDetails = usersList.find(
          (u: (typeof usersList)[number]) => u.id === member.userId
        );
        return {
          userId: member.userId,
          username: userDetails?.username,
          displayName: userDetails?.displayName,
          profileImageUrl: userDetails?.profileImageUrl,
          joinedAt: member.joinedAt,
          addedBy: member.addedBy,
          isAdmin: groupAdminsList.some(
            (admin: (typeof groupAdminsList)[number]) =>
              admin.userId === member.userId
          ),
        };
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdById: group.createdById,
        createdAt: group.createdAt,
        members,
        isCurrentUserAdmin: groupAdminsList.some(
          (admin: (typeof groupAdminsList)[number]) =>
            admin.userId === user.userId
        ),
      },
    });
  }
);

/**
 * PUT /api/user-groups/[id]
 * Update group details (name, description) - admin only
 */
export const PUT = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await context.params;
    const body = await request.json();

    // Validate input
    const updateSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
    });

    const validatedData = updateSchema.parse(body);

    // Check if user is admin
    const [isAdmin] = await db
      .select({ userId: userGroupAdmins.userId })
      .from(userGroupAdmins)
      .where(
        and(
          eq(userGroupAdmins.groupId, groupId),
          eq(userGroupAdmins.userId, user.userId)
        )
      )
      .limit(1);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can update group details' },
        { status: 403 }
      );
    }

    // Update the group
    const [updatedGroup] = await db
      .update(userGroups)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(userGroups.id, groupId))
      .returning();

    if (!updatedGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // If name changed, update associated chat name
    if (validatedData.name) {
      // Find chat where user is a participant
      const [participant] = await db
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(eq(chatParticipants.userId, user.userId))
        .limit(1);

      if (participant) {
        const [chat] = await db
          .select({ id: chats.id })
          .from(chats)
          .where(and(eq(chats.id, participant.chatId), eq(chats.isGroup, true)))
          .limit(1);

        if (chat) {
          await db
            .update(chats)
            .set({
              name: validatedData.name,
              updatedAt: new Date(),
            })
            .where(eq(chats.id, chat.id));
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Group updated',
      data: {
        id: updatedGroup.id,
        name: updatedGroup.name,
        description: updatedGroup.description,
      },
    });
  }
);

/**
 * DELETE /api/user-groups/[id]
 * Delete a group (admin only)
 */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await context.params;

    // Check if user is admin (using compound key lookup)
    const isAdmin = await db.userGroupAdmin.findFirst({
      where: {
        groupId,
        userId: user.userId,
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can delete groups' },
        { status: 403 }
      );
    }

    // Delete the group (cascade will delete members and admins)
    await db.userGroup.delete({
      where: { id: groupId },
    });

    return NextResponse.json({
      success: true,
      message: 'Group deleted',
    });
  }
);

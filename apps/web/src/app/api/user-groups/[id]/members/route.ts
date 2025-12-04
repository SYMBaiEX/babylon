/**
 * User Group Members API
 *
 * @route GET /api/user-groups/[id]/members - Get group members
 * @route POST /api/user-groups/[id]/members - Invite member
 * @route DELETE /api/user-groups/[id]/members/[userId] - Remove member
 * @access Authenticated (admin for POST/DELETE)
 *
 * @description
 * Manages group memberships. GET returns list of members. POST sends invite to join
 * (admin only). DELETE removes member from group (admin only).
 *
 * @openapi
 * /api/user-groups/{id}/members:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get group members
 *     description: Returns list of group members
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
 *         description: Members retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 members:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags:
 *       - User Groups
 *     summary: Invite member
 *     description: Sends invite to user to join group (admin only)
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Invite sent successfully
 *       400:
 *         description: Invalid user or already member
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *
 * @example
 * ```typescript
 * // Invite member
 * await fetch(`/api/user-groups/${groupId}/members`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ userId: 'user-id' })
 * });
 * ```
 */

import {
  authenticate,
  notifyUserGroupInvite,
  withErrorHandling,
} from '@babylon/api';
import { db, isUniqueConstraintError, toDatabaseErrorType } from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const addMemberSchema = z.object({
  userId: z.string(),
});

/**
 * POST /api/user-groups/[id]/members
 * Send invite to a user to join the group (admin only)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { userId: inviteeId } = addMemberSchema.parse(body);

    // Check if requester is admin
    const isAdmin = await db.userGroupAdmin.findFirst({
      where: {
        groupId,
        userId: user.userId,
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can invite members' },
        { status: 403 }
      );
    }

    // Validate that invitee is a real user (not NPC)
    const invitee = await db.user.findUnique({
      where: { id: inviteeId },
      select: {
        id: true,
        isActor: true,
        username: true,
        displayName: true,
      },
    });

    if (!invitee) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (invitee.isActor) {
      return NextResponse.json(
        { error: 'Cannot invite NPCs to user groups' },
        { status: 400 }
      );
    }

    // Check if already a member
    const existingMember = await db.userGroupMember.findFirst({
      where: {
        groupId,
        userId: inviteeId,
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member' },
        { status: 400 }
      );
    }

    // Check if already invited
    const existingInvite = await db.userGroupInvite.findFirst({
      where: {
        groupId,
        invitedUserId: inviteeId,
      },
    });

    if (existingInvite && existingInvite.status === 'pending') {
      return NextResponse.json(
        { error: 'User already has a pending invite' },
        { status: 400 }
      );
    }

    // Get group details for notification
    const group = await db.userGroup.findUnique({
      where: { id: groupId },
      select: { name: true },
    });

    // Create invite - handle unique constraint race condition
    let invite;
    try {
      invite = await db.userGroupInvite.create({
        data: {
          id: await generateSnowflakeId(),
          groupId,
          invitedUserId: inviteeId,
          invitedBy: user.userId,
          status: 'pending',
        },
      });
    } catch (error: unknown) {
      // Handle unique constraint violation (race condition)
      // PostgreSQL error code 23505 is unique_violation
      if (isUniqueConstraintError(toDatabaseErrorType(error))) {
        // Check if the error is related to the groupId_invitedUserId constraint
        // PostgreSQL errors include constraint name in the error message
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorObj =
          typeof error === 'object' && error !== null
            ? (error as { constraint?: string; message?: string })
            : null;

        // Check if this is the unique constraint on (groupId, invitedUserId)
        if (
          errorMessage.includes('groupId') ||
          errorMessage.includes('invitedUserId') ||
          errorObj?.constraint?.includes('groupId') ||
          errorObj?.constraint?.includes('invitedUserId')
        ) {
          // Check if there's now a pending invite (another request created it)
          const raceConditionInvite = await db.userGroupInvite.findFirst({
            where: {
              groupId,
              invitedUserId: inviteeId,
            },
          });
          if (raceConditionInvite?.status === 'pending') {
            return NextResponse.json(
              { error: 'User already has a pending invite' },
              { status: 400 }
            );
          }
          // If it's not pending, we can retry or handle differently
          return NextResponse.json(
            { error: 'Failed to create invite due to existing record' },
            { status: 400 }
          );
        }
      }
      throw error;
    }

    // Send notification using service
    await notifyUserGroupInvite(
      inviteeId,
      user.userId,
      groupId,
      group?.name || 'a group',
      invite.id
    );

    return NextResponse.json({
      success: true,
      message: 'Invite sent',
      data: {
        inviteId: invite.id,
      },
    });
  }
);

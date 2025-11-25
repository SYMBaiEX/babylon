/**
 * User Group Member Actions API
 * 
 * @route DELETE /api/user-groups/[id]/members/[userId] - Remove member
 * @access Authenticated (admin or self)
 * 
 * @description
 * Removes a member from a group. Users can remove themselves, or admins can
 * remove others. Cannot remove the group creator. Also removes from associated
 * chat participants.
 * 
 * @openapi
 * /api/user-groups/{id}/members/{userId}:
 *   delete:
 *     tags:
 *       - User Groups
 *     summary: Remove member from group
 *     description: Removes member from group (self or admin only, cannot remove creator)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: Member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot remove group creator
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required (if removing others)
 *       404:
 *         description: User is not a member
 * 
 * @example
 * ```typescript
 * await fetch(`/api/user-groups/${groupId}/members/${userId}`, {
 *   method: 'DELETE',
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling } from '@/lib/errors/error-handler';

/**
 * DELETE /api/user-groups/[id]/members/[userId]
 * Remove a member from the group (admin only, or user removing themselves)
 */
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) => {
  const user = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: groupId, userId: targetUserId } = await context.params;

  // Users can remove themselves, or admins can remove others
  const isRemovingSelf = user.userId === targetUserId;
  
  if (!isRemovingSelf) {
    // Check if requester is admin
    const isAdmin = await db.userGroupAdmin.findFirst({
      where: {
        groupId,
        userId: user.userId,
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can remove other members' },
        { status: 403 }
      );
    }
  }

  // Check if target is a member
  const membership = await db.userGroupMember.findFirst({
    where: {
      groupId,
      userId: targetUserId,
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: 'User is not a member' },
      { status: 404 }
    );
  }

  // Don't allow removing the group creator
  const group = await db.userGroup.findUnique({
    where: { id: groupId },
    select: { createdById: true, name: true },
  });

  if (group?.createdById === targetUserId) {
    return NextResponse.json(
      { error: 'Cannot remove group creator' },
      { status: 400 }
    );
  }

  // Remove member
  await db.userGroupMember.delete({
    where: {
      groupId,
      userId: targetUserId,
    },
  });

  // Remove from admin if they are one
  await db.userGroupAdmin.deleteMany({
    where: {
      groupId,
      userId: targetUserId,
    },
  });

  // Remove from chat participants
  const chat = await db.chat.findFirst({
    where: {
      name: group?.name,
      isGroup: true,
    },
  });

  if (chat) {
    await db.chatParticipant.deleteMany({
      where: {
        chatId: chat.id,
        userId: targetUserId,
      },
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Member removed',
  });
});


/**
 * User Group Admin Actions API
 * 
 * @route DELETE /api/user-groups/[id]/admins/[userId] - Revoke admin privileges
 * @access Authenticated (admin only)
 * 
 * @description
 * Revokes admin privileges from a group member. Cannot revoke privileges from
 * the group creator. Admin only.
 * 
 * @openapi
 * /api/user-groups/{id}/admins/{userId}:
 *   delete:
 *     tags:
 *       - User Groups
 *     summary: Revoke admin privileges
 *     description: Revokes admin privileges from a group member (admin only, cannot revoke from creator)
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
 *         description: User ID to revoke admin from
 *     responses:
 *       200:
 *         description: Admin privileges revoked successfully
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
 *         description: Cannot revoke from group creator
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User is not an admin
 * 
 * @example
 * ```typescript
 * await fetch(`/api/user-groups/${groupId}/admins/${userId}`, {
 *   method: 'DELETE',
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling } from '@/lib/errors/error-handler';

/**
 * DELETE /api/user-groups/[id]/admins/[userId]
 * Revoke admin privileges (admin only, cannot remove group creator)
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

  // Check if requester is admin
  const isAdmin = await prisma.userGroupAdmin.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: user.userId,
      },
    },
  });

  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Only admins can revoke admin privileges' },
      { status: 403 }
    );
  }

  // Don't allow revoking the group creator's admin status
  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
    select: { createdById: true },
  });

  if (group?.createdById === targetUserId) {
    return NextResponse.json(
      { error: 'Cannot revoke admin privileges from group creator' },
      { status: 400 }
    );
  }

  // Check if target is admin
  const adminRecord = await prisma.userGroupAdmin.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUserId,
      },
    },
  });

  if (!adminRecord) {
    return NextResponse.json(
      { error: 'User is not an admin' },
      { status: 404 }
    );
  }

  // Revoke admin
  await prisma.userGroupAdmin.delete({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUserId,
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Admin privileges revoked',
  });
});


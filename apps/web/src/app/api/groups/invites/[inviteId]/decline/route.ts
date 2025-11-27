/**
 * Group Invite Decline API
 *
 * @route POST /api/groups/invites/[inviteId]/decline - Decline group invite
 * @access Authenticated
 *
 * @description
 * Declines a group invitation. Removes the invite. User must be the invitee.
 *
 * @openapi
 * /api/groups/invites/{inviteId}/decline:
 *   post:
 *     tags:
 *       - Groups
 *     summary: Decline group invite
 *     description: Declines a group invitation (authenticated user only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite ID
 *     responses:
 *       200:
 *         description: Invite declined successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not the invitee
 *       404:
 *         description: Invite not found
 *
 * @example
 * ```typescript
 * await fetch(`/api/groups/invites/${inviteId}/decline`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { asUser } from '@/lib/db/context';
import { ApiError } from '@/lib/errors/api-errors';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';

/**
 * POST /api/groups/invites/[inviteId]/decline
 * Decline a group invitation
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ inviteId: string }> }
  ) => {
    const user = await authenticate(request);
    const { inviteId } = await params;

    await asUser(user, async (db) => {
      // Get the invite
      const invite = await db.userGroupInvite.findUnique({
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

      // Update invite status
      await db.userGroupInvite.update({
        where: { id: inviteId },
        data: {
          status: 'declined',
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
    });

    logger.info(
      'Group invite declined',
      { userId: user.userId, inviteId },
      'POST /api/groups/invites/:inviteId/decline'
    );

    return successResponse({ success: true });
  }
);

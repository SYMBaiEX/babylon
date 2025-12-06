/**
 * User Group Invites API
 *
 * @route GET /api/user-groups/invites - Get pending invites
 * @route POST /api/user-groups/invites/[id] - Accept/decline invite
 * @access Authenticated
 *
 * @description
 * Manages group invites. GET returns all pending invites for authenticated user.
 * POST accepts or declines an invite.
 *
 * @openapi
 * /api/user-groups/invites:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get pending invites
 *     description: Returns all pending group invites for authenticated user
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Invites retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invites:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       group:
 *                         type: object
 *                       inviter:
 *                         type: object
 *                       invitedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *
 * @example
 * ```typescript
 * const { invites } = await fetch('/api/user-groups/invites', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 */

import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { db } from '@babylon/db';
import type { NextRequest } from 'next/server';

/**
 * GET /api/user-groups/invites
 * Get all pending invites for the authenticated user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Get pending invites
  const invites = await db.userGroupInvite.findMany({
    where: {
      invitedUserId: user.userId,
      status: 'pending',
    },
    orderBy: {
      invitedAt: 'desc',
    },
  });

  // Get group and inviter details for each invite
  const enrichedInvites = await Promise.all(
    invites.map(async (invite) => {
      const [group, inviter] = await Promise.all([
        db.userGroup.findUnique({
          where: { id: invite.groupId },
        }),
        db.user.findUnique({
          where: { id: invite.invitedBy },
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true,
          },
        }),
      ]);

      // Get member count separately
      const memberCount = group
        ? await db.userGroupMember.count({
            where: { groupId: group.id },
          })
        : 0;

      return {
        id: invite.id,
        groupId: invite.groupId,
        invitedAt: invite.invitedAt,
        group: group
          ? {
              id: group.id,
              name: group.name,
              description: group.description,
              memberCount,
            }
          : null,
        inviter: inviter
          ? {
              id: inviter.id,
              name: inviter.displayName || inviter.username,
              username: inviter.username,
              profileImageUrl: inviter.profileImageUrl,
            }
          : null,
      };
    })
  );

  return successResponse({
    data: {
      invites: enrichedInvites,
      total: enrichedInvites.length,
    },
  });
});

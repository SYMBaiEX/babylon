/**
 * Group Invites API
 * 
 * @route GET /api/groups/invites - Get pending group invites
 * @access Authenticated
 * 
 * @description
 * Returns all pending group invites for the authenticated user. Includes group
 * details and metadata for each invite.
 * 
 * @openapi
 * /api/groups/invites:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get pending group invites
 *     description: Returns all pending group invites for the current user
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
 *                       groupId:
 *                         type: string
 *                       group:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           memberCount:
 *                             type: integer
 *                       invitedAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                         enum: [pending, accepted, declined]
 *       401:
 *         description: Unauthorized
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api/groups/invites', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * const { invites } = await response.json();
 * ```
 * 
 * @see {@link /lib/db/context} RLS context
 */

import type { NextRequest } from 'next/server'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { logger } from '@/lib/logger'
import { asUser } from '@/lib/db/context'

/**
 * GET /api/groups/invites
 * Get all pending group invites for the current user
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)

  const invites = await asUser(user, async (db) => {
    const pendingInvites = await db.userGroupInvite.findMany({
      where: {
        invitedUserId: user.userId,
        status: 'pending',
      },
      orderBy: {
        invitedAt: 'desc',
      },
    })
    
    // Fetch group details separately
    const groupIds = pendingInvites.map(inv => inv.groupId)
    const groups = await db.userGroup.findMany({
      where: {
        id: { in: groupIds },
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: {
          select: {
            UserGroupMember: true,
          },
        },
      },
    })
    
    const groupMap = new Map(groups.map(g => [g.id, g]))

    return pendingInvites.map((invite) => {
      const group = groupMap.get(invite.groupId)
      return {
        inviteId: invite.id,
        groupId: invite.groupId,
        groupName: group?.name || 'Unknown Group',
        groupDescription: group?.description,
        memberCount: group?._count.UserGroupMember || 0,
        invitedAt: invite.invitedAt,
        invitedBy: invite.invitedBy,
      }
    })
  })

  logger.info('Group invites retrieved', { userId: user.userId, inviteCount: invites.length }, 'GET /api/groups/invites')

  return successResponse({ invites })
})


/**
 * Group Members API
 * 
 * @route GET /api/groups/[groupId]/members - Get group members
 * @route POST /api/groups/[groupId]/members - Add member to group
 * @route DELETE /api/groups/[groupId]/members - Remove member from group
 * @access Authenticated (members can view, admins can add/remove)
 * 
 * @description
 * Manages group membership. GET returns list of members. POST adds a new member
 * (admin only, sends notification). DELETE removes a member (admin only or self-remove).
 * 
 * @openapi
 * /api/groups/{groupId}/members:
 *   get:
 *     tags:
 *       - Groups
 *     summary: Get group members
 *     description: Returns list of group members
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       joinedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a group member
 *       404:
 *         description: Group not found
 *   post:
 *     tags:
 *       - Groups
 *     summary: Add member to group
 *     description: Adds a user to the group (admin only, sends notification)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
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
 *                 description: User ID to add
 *     responses:
 *       201:
 *         description: Member added successfully
 *       400:
 *         description: User already a member
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a group admin
 *       404:
 *         description: Group or user not found
 *   delete:
 *     tags:
 *       - Groups
 *     summary: Remove member from group
 *     description: Removes a member from the group (admin only or self-remove)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to remove member
 *       404:
 *         description: Group or member not found
 * 
 * @example
 * ```typescript
 * // Get members
 * const members = await fetch(`/api/groups/${groupId}/members`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * 
 * // Add member
 * await fetch(`/api/groups/${groupId}/members`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ userId: 'user_123' })
 * });
 * ```
 * 
 * @see {@link /lib/services/notification-service} Notification service
 */

import type { NextRequest } from 'next/server'
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { ApiError } from '@/lib/errors/api-errors'
import { logger } from '@/lib/logger'
import { asUser } from '@/lib/db/context'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { notifyUserGroupInvite } from '@/lib/services/notification-service'
import { Prisma } from '@prisma/client'

const AddMemberSchema = z.object({
  userId: z.string(),
})

/**
 * POST /api/groups/[groupId]/members
 * Add a member to the group (admin only)
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) => {
    const user = await authenticate(request)
    const { groupId } = await params
    const body = await request.json()
    const data = AddMemberSchema.parse(body)

    let groupName = 'Unknown'
    let inviteId = ''

    await asUser(user, async (db) => {
      // Check if user is admin
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      })

      if (!isAdmin) {
        throw new ApiError('Only group admins can add members', 403)
      }

      // Check if user is already a member
      const existingMember = await db.userGroupMember.findFirst({
        where: {
          groupId,
          userId: data.userId,
        },
      })

      if (existingMember) {
        throw new ApiError('User is already a member of this group', 400)
      }

      // Check if there's already a pending invite
      const existingInvite = await db.userGroupInvite.findFirst({
        where: {
          groupId,
          invitedUserId: data.userId,
          status: 'pending',
        },
      })

      if (existingInvite) {
        throw new ApiError('User already has a pending invite', 400)
      }

      // Get group details for notification
      const group = await db.userGroup.findUnique({
        where: { id: groupId },
        select: { name: true },
      })
      groupName = group?.name || 'Unknown'

      // Create invite - handle unique constraint race condition
      inviteId = nanoid()
      try {
        await db.userGroupInvite.create({
          data: {
            id: inviteId,
            groupId,
            invitedUserId: data.userId,
            invitedBy: user.userId,
            status: 'pending',
            invitedAt: new Date(),
          },
        })
      } catch (error: unknown) {
        // Handle unique constraint violation (race condition)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined
          if (target?.includes('groupId') && target?.includes('invitedUserId')) {
          // Check if there's now a pending invite (another request created it)
          const raceConditionInvite = await db.userGroupInvite.findUnique({
            where: {
              groupId_invitedUserId: {
                groupId,
                invitedUserId: data.userId,
              },
            },
          })
            if (raceConditionInvite?.status === 'pending') {
              inviteId = raceConditionInvite.id
              throw new ApiError('User already has a pending invite', 400)
            }
            // If it's not pending, we can retry or handle differently
            throw new ApiError('Failed to create invite due to existing record', 400)
          }
        }
        throw error
      }
    })

    // Send notification to the invited user (outside of asUser context)
    await notifyUserGroupInvite(
      data.userId,
      user.userId,
      groupId,
      groupName,
      inviteId
    )

    logger.info(
      'Member added to group',
      { userId: user.userId, groupId, newMemberId: data.userId },
      'POST /api/groups/:groupId/members'
    )

    return successResponse({ success: true })
  }
)

/**
 * DELETE /api/groups/[groupId]/members
 * Remove a member from the group (admin only or self)
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) => {
    const user = await authenticate(request)
    const { groupId } = await params
    const { searchParams } = new URL(request.url)
    const userIdToRemove = searchParams.get('userId')

    if (!userIdToRemove) {
      throw new ApiError('userId parameter is required', 400)
    }

    await asUser(user, async (db) => {
      // Check if user is admin or removing themselves
      const isAdmin = await db.userGroupAdmin.findFirst({
        where: {
          groupId,
          userId: user.userId,
        },
      })

      const isSelf = user.userId === userIdToRemove

      if (!isAdmin && !isSelf) {
        throw new ApiError('Only group admins can remove members', 403)
      }

      // Cannot remove the creator
      const group = await db.userGroup.findUnique({
        where: { id: groupId },
      })

      if (group?.createdById === userIdToRemove) {
        throw new ApiError('Cannot remove the group creator', 400)
      }

      // Remove member
      await db.userGroupMember.deleteMany({
        where: {
          groupId,
          userId: userIdToRemove,
        },
      })

      // Also remove admin status if they have it
      await db.userGroupAdmin.deleteMany({
        where: {
          groupId,
          userId: userIdToRemove,
        },
      })

      // Remove from associated chat
      const chat = await db.chat.findFirst({
        where: {
          groupId: groupId,
          isGroup: true,
        },
      })

      if (chat) {
        await db.chatParticipant.deleteMany({
          where: {
            chatId: chat.id,
            userId: userIdToRemove,
          },
        })
      }
    })

    logger.info(
      'Member removed from group',
      { userId: user.userId, groupId, removedUserId: userIdToRemove },
      'DELETE /api/groups/:groupId/members'
    )

    return successResponse({ success: true })
  }
)


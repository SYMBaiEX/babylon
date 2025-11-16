/**
 * User Block API
 * 
 * @route POST /api/users/[userId]/block - Block or unblock user
 * @route GET /api/users/[userId]/block - Check if user is blocked
 * @access Authenticated
 * 
 * @description
 * Manages user blocking/unblocking. POST blocks or unblocks a user (also removes
 * follow relationships). GET checks if the current user has blocked the target user.
 * 
 * @openapi
 * /api/users/{userId}/block:
 *   post:
 *     tags:
 *       - Users
 *     summary: Block or unblock user
 *     description: Blocks or unblocks a user and removes follow relationships
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Target user ID to block/unblock
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [block, unblock]
 *               reason:
 *                 type: string
 *                 description: Optional reason for blocking
 *     responses:
 *       200:
 *         description: Block/unblock action completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 block:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Invalid action or already blocked/unblocked
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Target user not found
 *   get:
 *     tags:
 *       - Users
 *     summary: Check if user is blocked
 *     description: Returns whether the current user has blocked the target user
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Target user ID to check
 *     responses:
 *       200:
 *         description: Block status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isBlocked:
 *                   type: boolean
 *                 block:
 *                   type: object
 *                   nullable: true
 * 
 * @example
 * ```typescript
 * // Block user
 * await fetch(`/api/users/${userId}/block`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ action: 'block', reason: 'Spam' })
 * });
 * 
 * // Check block status
 * const { isBlocked } = await fetch(`/api/users/${userId}/block`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 * 
 * @see {@link /lib/moderation/filters} Moderation filters
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { prisma } from '@/lib/prisma';
import { BlockUserSchema } from '@/lib/validation/schemas/moderation';
import { logger } from '@/lib/logger';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { generateSnowflakeId } from '@/lib/snowflake';

export const POST = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  // Authenticate the user
  const authUser = await authenticate(request);
  const { userId: targetUserId } = await context.params;

  // Parse request body
  const body = await request.json();
  const { action, reason } = BlockUserSchema.parse(body);

  logger.info(`User ${action} request`, { 
    userId: authUser.userId,
    targetUserId,
    action 
  }, 'POST /api/users/[userId]/block');

  // Cannot block yourself
  if (authUser.userId === targetUserId) {
    throw new BusinessLogicError('Cannot block yourself', 'CANNOT_BLOCK_SELF');
  }

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, displayName: true, isActor: true },
  });

  if (!targetUser) {
    throw new NotFoundError('User', targetUserId);
  }

  // Note: Blocking NPCs is allowed - it means they won't add you to group chats

  if (action === 'block') {
    // Check if already blocked
    const existingBlock = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: authUser.userId,
          blockedId: targetUserId,
        },
      },
    });

    if (existingBlock) {
      throw new BusinessLogicError('User is already blocked', 'ALREADY_BLOCKED');
    }

    // Create block
    const block = await prisma.userBlock.create({
      data: {
        id: await generateSnowflakeId(),
        blockerId: authUser.userId,
        blockedId: targetUserId,
        reason: reason || null,
      },
    });

    // Also unfollow if following
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: authUser.userId, followingId: targetUserId },
          { followerId: targetUserId, followingId: authUser.userId },
        ],
      },
    });

    logger.info(`User blocked successfully`, { 
      userId: authUser.userId,
      targetUserId,
      blockId: block.id 
    }, 'POST /api/users/[userId]/block');

    return successResponse({
      success: true,
      message: 'User blocked successfully',
      block,
    });
  } else {
    // Unblock
    const deleted = await prisma.userBlock.deleteMany({
      where: {
        blockerId: authUser.userId,
        blockedId: targetUserId,
      },
    });

    if (deleted.count === 0) {
      throw new BusinessLogicError('User is not blocked', 'NOT_BLOCKED');
    }

    logger.info(`User unblocked successfully`, { 
      userId: authUser.userId,
      targetUserId 
    }, 'POST /api/users/[userId]/block');

    return successResponse({
      success: true,
      message: 'User unblocked successfully',
    });
  }
});

/**
 * GET /api/users/[userId]/block
 * Check if current user has blocked the target user
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const authUser = await authenticate(request);
  const { userId: targetUserId } = await context.params;

  const block = await prisma.userBlock.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: authUser.userId,
        blockedId: targetUserId,
      },
    },
    select: {
      id: true,
      createdAt: true,
      reason: true,
    },
  });

  return successResponse({
    isBlocked: !!block,
    block,
  });
});



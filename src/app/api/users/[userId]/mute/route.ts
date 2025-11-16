/**
 * User Mute API
 * 
 * @route POST /api/users/[userId]/mute - Mute or unmute user
 * @route GET /api/users/[userId]/mute - Check if user is muted
 * @access Authenticated
 * 
 * @description
 * Manages user muting/unmuting. POST mutes or unmutes a user (hides their posts
 * from feed). GET checks if the current user has muted the target user. Handles
 * race conditions for concurrent mute requests.
 * 
 * @openapi
 * /api/users/{userId}/mute:
 *   post:
 *     tags:
 *       - Users
 *     summary: Mute or unmute user
 *     description: Mutes or unmutes a user (hides their posts from feed)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Target user ID to mute/unmute
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
 *                 enum: [mute, unmute]
 *               reason:
 *                 type: string
 *                 description: Optional reason for muting
 *     responses:
 *       200:
 *         description: Mute/unmute action completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 mute:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Invalid action or already muted/unmuted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Target user not found
 *   get:
 *     tags:
 *       - Users
 *     summary: Check if user is muted
 *     description: Returns whether the current user has muted the target user
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
 *         description: Mute status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isMuted:
 *                   type: boolean
 *                 mute:
 *                   type: object
 *                   nullable: true
 * 
 * @example
 * ```typescript
 * // Mute user
 * await fetch(`/api/users/${userId}/mute`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ action: 'mute' })
 * });
 * ```
 * 
 * @see {@link /lib/moderation/filters} Moderation filters
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { prisma } from '@/lib/prisma';
import { MuteUserSchema } from '@/lib/validation/schemas/moderation';
import { logger } from '@/lib/logger';
import { BusinessLogicError, NotFoundError } from '@/lib/errors';
import { generateSnowflakeId } from '@/lib/snowflake';
import { Prisma } from '@prisma/client';

export const POST = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  // Authenticate the user
  const authUser = await authenticate(request);
  const { userId: targetUserId } = await context.params;

  // Parse request body
  let body: { action: string; reason?: string }
  try {
    body = await request.json() as { action: string; reason?: string }
  } catch (error) {
    logger.error('Failed to parse request body', { error, userId: authUser.userId, targetUserId }, 'POST /api/users/[userId]/mute')
    return NextResponse.json({
      success: false,
      error: 'Invalid request body'
    }, { status: 400 })
  }
  const { action, reason } = MuteUserSchema.parse(body);

  logger.info(`User ${action} request`, { 
    userId: authUser.userId,
    targetUserId,
    action 
  }, 'POST /api/users/[userId]/mute');

  // Cannot mute yourself
  if (authUser.userId === targetUserId) {
    throw new BusinessLogicError('Cannot mute yourself', 'CANNOT_MUTE_SELF');
  }

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, displayName: true, isActor: true },
  });

  if (!targetUser) {
    throw new NotFoundError('User', targetUserId);
  }

  // Note: Muting NPCs is allowed - it hides their posts from your feed

  if (action === 'mute') {
    // Check if already muted
    const existingMute = await prisma.userMute.findUnique({
      where: {
        muterId_mutedId: {
          muterId: authUser.userId,
          mutedId: targetUserId,
        },
      },
    });

    if (existingMute) {
      throw new BusinessLogicError('User is already muted', 'ALREADY_MUTED');
    }

    // Create mute - handle race condition where mute might be created concurrently
    let mute;
    try {
      mute = await prisma.userMute.create({
        data: {
          id: await generateSnowflakeId(),
          muterId: authUser.userId,
          mutedId: targetUserId,
          reason: reason || null,
        },
      });
    } catch (error: unknown) {
      // Handle unique constraint violation (race condition)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target as string[] | undefined;
        if (target?.includes('muterId') && target?.includes('mutedId')) {
          // Race condition: mute was created by another concurrent request
          // Fetch the existing mute and return success
          const raceConditionMute = await prisma.userMute.findUnique({
            where: {
              muterId_mutedId: {
                muterId: authUser.userId,
                mutedId: targetUserId,
              },
            },
          });
          
          if (raceConditionMute) {
            logger.info(`User muted successfully (race condition handled)`, { 
              userId: authUser.userId,
              targetUserId,
              muteId: raceConditionMute.id 
            }, 'POST /api/users/[userId]/mute');
            
            return successResponse({
              success: true,
              message: 'User muted successfully',
              mute: raceConditionMute,
            });
          }
        }
        // If we can't find the mute, throw the original error
        throw error;
      }
      // Re-throw other errors
      throw error;
    }

    logger.info(`User muted successfully`, { 
      userId: authUser.userId,
      targetUserId,
      muteId: mute.id 
    }, 'POST /api/users/[userId]/mute');

    return successResponse({
      success: true,
      message: 'User muted successfully',
      mute,
    });
  } else {
    // Unmute
    const deleted = await prisma.userMute.deleteMany({
      where: {
        muterId: authUser.userId,
        mutedId: targetUserId,
      },
    });

    if (deleted.count === 0) {
      throw new BusinessLogicError('User is not muted', 'NOT_MUTED');
    }

    logger.info(`User unmuted successfully`, { 
      userId: authUser.userId,
      targetUserId 
    }, 'POST /api/users/[userId]/mute');

    return successResponse({
      success: true,
      message: 'User unmuted successfully',
    });
  }
});

/**
 * GET /api/users/[userId]/mute
 * Check if current user has muted the target user
 */
export const GET = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) => {
  const authUser = await authenticate(request);
  const { userId: targetUserId } = await context.params;

  const mute = await prisma.userMute.findUnique({
    where: {
      muterId_mutedId: {
        muterId: authUser.userId,
        mutedId: targetUserId,
      },
    },
    select: {
      id: true,
      createdAt: true,
      reason: true,
    },
  });

  return successResponse({
    isMuted: !!mute,
    mute,
  });
});



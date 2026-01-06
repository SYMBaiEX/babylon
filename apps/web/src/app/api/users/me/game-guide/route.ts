/**
 * Game Guide Completion API
 *
 * @route POST /api/users/me/game-guide
 * @access Authenticated
 *
 * @description
 * Marks the current user's game guide as completed. This endpoint is called
 * when a user finishes viewing all slides of the onboarding game guide.
 * Once completed, the game guide modal will not be shown again.
 *
 * @returns {object} Success response with updated timestamp
 * @property {boolean} success - Always true on success
 * @property {string} gameGuideCompletedAt - ISO timestamp of completion
 *
 * @throws {401} Unauthorized - authentication required
 * @throws {500} Internal server error
 */

import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);

  // privyId is always set after authenticate() - it's the Privy claims userId
  // or the agent session ID for agents
  const privyId = authUser.privyId;
  if (!privyId) {
    // This should never happen after successful auth, but guard against it
    throw new Error('Missing privyId after authentication');
  }

  logger.info(
    'Marking game guide as completed',
    { privyId, dbUserId: authUser.dbUserId },
    'POST /api/users/me/game-guide'
  );

  const now = new Date();

  const result = await db
    .update(users)
    .set({
      gameGuideCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(users.privyId, privyId))
    .returning({ id: users.id });

  if (result.length === 0) {
    logger.warn(
      'No user found with privyId - user may not exist in database yet',
      { privyId },
      'POST /api/users/me/game-guide'
    );
  }

  logger.info(
    'Game guide marked as completed',
    { privyId, completedAt: now.toISOString() },
    'POST /api/users/me/game-guide'
  );

  return successResponse({
    success: true,
    gameGuideCompletedAt: now.toISOString(),
  });
});

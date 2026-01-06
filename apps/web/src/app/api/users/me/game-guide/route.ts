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
  const canonicalUserId = authUser.dbUserId ?? authUser.userId;

  logger.info(
    'Marking game guide as completed',
    { userId: canonicalUserId },
    'POST /api/users/me/game-guide'
  );

  const now = new Date();

  await db
    .update(users)
    .set({
      gameGuideCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(users.privyId, authUser.privyId ?? authUser.userId));

  logger.info(
    'Game guide marked as completed',
    { userId: canonicalUserId, completedAt: now.toISOString() },
    'POST /api/users/me/game-guide'
  );

  return successResponse({
    success: true,
    gameGuideCompletedAt: now.toISOString(),
  });
});

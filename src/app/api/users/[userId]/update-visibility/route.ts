import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database-service';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import { BusinessLogicError, AuthorizationError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

const UpdateVisibilityRequestSchema = z.object({
  platform: z.enum(['twitter', 'farcaster', 'wallet']),
  visible: z.boolean()
});

/**
 * POST /api/users/[userId]/update-visibility
 * Update social visibility preferences
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Verify user is updating their own preferences
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only update your own visibility preferences', 'visibility-preferences', 'update');
  }

  // Parse and validate request body
  const body = await request.json();
  const { platform, visible } = UpdateVisibilityRequestSchema.parse(body);

  // Build update data based on platform
  const updateData: Record<string, boolean> = {};
  switch (platform) {
    case 'twitter':
      updateData.showTwitterPublic = visible;
      break;
    case 'farcaster':
      updateData.showFarcasterPublic = visible;
      break;
    case 'wallet':
      updateData.showWalletPublic = visible;
      break;
  }

  // Update user visibility preference
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      showTwitterPublic: true,
      showFarcasterPublic: true,
      showWalletPublic: true,
    },
  });

  logger.info(
    `User ${userId} updated ${platform} visibility to ${visible}`,
    { userId, platform, visible },
    'POST /api/users/[userId]/update-visibility'
  );

  return successResponse({
    success: true,
    visibility: {
      twitter: updatedUser.showTwitterPublic,
      farcaster: updatedUser.showFarcasterPublic,
      wallet: updatedUser.showWalletPublic,
    },
  });
});


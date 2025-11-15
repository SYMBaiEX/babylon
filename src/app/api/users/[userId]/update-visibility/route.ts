import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authenticate } from '@/lib/api/auth-middleware';
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler';
import {  AuthorizationError } from '@/lib/errors';
import { UserIdParamSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import { requireUserByIdentifier } from '@/lib/users/user-lookup';

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
  context: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await context.params;
  const { userId } = UserIdParamSchema.parse(params);
  const targetUser = await requireUserByIdentifier(userId, { id: true });
  const canonicalUserId = targetUser.id;

  // Verify user is updating their own preferences
  if (authUser.userId !== canonicalUserId) {
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
    where: { id: canonicalUserId },
    data: updateData,
    select: {
      id: true,
      showTwitterPublic: true,
      showFarcasterPublic: true,
      showWalletPublic: true,
    },
  });

  logger.info(
    `User ${canonicalUserId} updated ${platform} visibility to ${visible}`,
    { userId: canonicalUserId, platform, visible },
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

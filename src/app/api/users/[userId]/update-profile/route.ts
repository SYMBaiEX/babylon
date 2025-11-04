/**
 * API Route: /api/users/[userId]/update-profile
 * Methods: POST (update user profile)
 */

import {
  authenticate,
  successResponse
} from '@/lib/api/auth-middleware';
import { prisma } from '@/lib/database-service';
import { AuthorizationError, BusinessLogicError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { logger } from '@/lib/logger';
import { notifyProfileComplete } from '@/lib/services/notification-service';
import { PointsService } from '@/lib/services/points-service';
import { UpdateUserSchema, UserIdParamSchema } from '@/lib/validation/schemas';
import type { NextRequest } from 'next/server';

/**
 * POST /api/users/[userId]/update-profile
 * Update user profile information
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<{ userId: string }> }
) => {
  // Authenticate user
  const authUser = await authenticate(request);
  const params = await (context?.params || Promise.reject(new BusinessLogicError('Missing route context', 'MISSING_CONTEXT')));
  const { userId } = UserIdParamSchema.parse(params);

  // Ensure user can only update their own profile
  if (authUser.userId !== userId) {
    throw new AuthorizationError('You can only update your own profile', 'profile', 'update');
  }

  // Parse and validate request body
  const body = await request.json();
  const { username, displayName, bio, profileImageUrl, coverImageUrl } = UpdateUserSchema.parse(body);

  // Check if username is already taken (if provided and different)
  if (username !== undefined && username !== null && username.trim().length > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        username: username.trim(),
        id: { not: userId },
      },
    });

    if (existingUser) {
      throw new BusinessLogicError('Username is already taken', 'USERNAME_TAKEN');
    }
  }

    // Get current user state to check what changed
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        bio: true,
        profileImageUrl: true,
        coverImageUrl: true,
        hasUsername: true,
        hasBio: true,
        hasProfileImage: true,
        usernameChangedAt: true,
        pointsAwardedForProfile: true,
      },
    });

    // Check 24-hour rate limit for username changes
    const isUsernameChanging = username !== undefined &&
                               username !== null &&
                               username.trim() !== currentUser?.username;

    if (isUsernameChanging && currentUser?.usernameChangedAt) {
      const lastChangeTime = new Date(currentUser.usernameChangedAt).getTime();
      const now = Date.now();
      const hoursSinceChange = (now - lastChangeTime) / (1000 * 60 * 60);
      const hoursRemaining = 24 - hoursSinceChange;

      if (hoursSinceChange < 24) {
        const hours = Math.floor(hoursRemaining);
        const minutes = Math.floor((hoursRemaining - hours) * 60);
        throw new BusinessLogicError(
          `You can only change your username once every 24 hours. Please wait ${hours}h ${minutes}m before changing again.`,
          'RATE_LIMIT_USERNAME_CHANGE'
        );
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username !== undefined && { username: username.trim() || null }),
        ...(displayName !== undefined && { displayName: displayName.trim() || null }),
        ...(bio !== undefined && { bio: bio.trim() || null }),
        ...(profileImageUrl !== undefined && { profileImageUrl: profileImageUrl.trim() || null }),
        ...(coverImageUrl !== undefined && { coverImageUrl: coverImageUrl.trim() || null }),
        // Update username changed timestamp if username is changing
        ...(isUsernameChanging && { usernameChangedAt: new Date() }),
        // Update profile completion flags
        hasUsername: username !== undefined ? (username.trim().length > 0) : undefined,
        hasBio: bio !== undefined ? (bio.trim().length > 0) : undefined,
        hasProfileImage: profileImageUrl !== undefined ? (profileImageUrl.trim().length > 0) : undefined,
        // Mark profile as complete if all fields are present
        profileComplete: username !== undefined && displayName !== undefined && bio !== undefined && profileImageUrl !== undefined
          ? (username.trim().length > 0 && displayName.trim().length > 0 && bio.trim().length > 0 && profileImageUrl.trim().length > 0)
          : undefined,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        profileImageUrl: true,
        coverImageUrl: true,
        profileComplete: true,
        hasUsername: true,
        hasBio: true,
        hasProfileImage: true,
        reputationPoints: true,
        referralCount: true,
        referralCode: true,
        usernameChangedAt: true,
      },
    });

    // Award points for profile milestones
    const pointsAwarded: { reason: string; amount: number }[] = []

    // Award points for profile completion (username + image + bio)
    // Only award if not already awarded AND all three fields are now complete
    if (!currentUser?.pointsAwardedForProfile) {
      const hasUsername = updatedUser.username && updatedUser.username.trim().length > 0
      const hasImage = updatedUser.profileImageUrl && updatedUser.profileImageUrl.trim().length > 0
      const hasBio = updatedUser.bio && updatedUser.bio.trim().length >= 50
      
      if (hasUsername && hasImage && hasBio) {
        const result = await PointsService.awardProfileCompletion(userId)
        if (result.success && result.pointsAwarded > 0) {
          pointsAwarded.push({ reason: 'profile_completion', amount: result.pointsAwarded })
          logger.info(
            `Awarded ${result.pointsAwarded} points to user ${userId} for completing profile (username + image + bio)`,
            { userId, points: result.pointsAwarded },
            'POST /api/users/[userId]/update-profile'
          )
          
          // Send profile completion notification
          try {
            await notifyProfileComplete(userId, result.pointsAwarded)
            logger.info('Profile completion notification sent', { userId }, 'POST /api/users/[userId]/update-profile')
          } catch (notificationError) {
            logger.error('Error sending profile completion notification (non-critical):', notificationError, 'POST /api/users/[userId]/update-profile')
            // Don't fail the request if notification fails
          }
        }
      }
    }

    // Log points awarded
    if (pointsAwarded.length > 0) {
      logger.info(
        `Awarded points for profile updates: ${pointsAwarded.map(p => `${p.reason}(+${p.amount})`).join(', ')}`,
        { userId, pointsAwarded },
        'POST /api/users/[userId]/update-profile'
      )
    }

    logger.info('Profile updated successfully', { userId, pointsAwarded: pointsAwarded.length }, 'POST /api/users/[userId]/update-profile');

    return successResponse({
      user: updatedUser,
      message: 'Profile updated successfully',
      pointsAwarded,
    });
});

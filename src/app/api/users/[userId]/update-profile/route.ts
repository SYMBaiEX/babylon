/**
 * API Route: /api/users/[userId]/update-profile
 * Methods: POST (update user profile)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  authErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { WalletService } from '@/services/WalletService';

const prisma = new PrismaClient();

/**
 * POST /api/users/[userId]/update-profile
 * Update user profile information
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authUser = await authenticate(request);
    const { userId } = await params;

    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403);
    }

    const body = await request.json();
    const { username, displayName, bio, profileImageUrl } = body;

    // Validate username if provided
    if (username) {
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return errorResponse(
          'Username must be 3-20 characters, lowercase letters, numbers, and underscores only',
          400
        );
      }

      // Check if username is taken
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser && existingUser.id !== userId) {
        return errorResponse('Username already taken', 400);
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        username: username || undefined,
        displayName: displayName || undefined,
        bio: bio || undefined,
        profileImageUrl: profileImageUrl || undefined,
        hasUsername: !!username,
        hasProfileImage: !!profileImageUrl,
        hasBio: !!bio,
        profileComplete: !!username && !!displayName,
        profileSetupCompletedAt: new Date(),
      },
    });

    // Initialize wallet balance if this is first time setup
    await WalletService.initializeBalance(userId);

    return successResponse({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        bio: updatedUser.bio,
        profileImageUrl: updatedUser.profileImageUrl,
        profileComplete: updatedUser.profileComplete,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication failed') {
      return authErrorResponse('Unauthorized');
    }
    console.error('Error updating profile:', error);
    return errorResponse('Failed to update profile');
  }
}


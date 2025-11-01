/**
 * API Route: /api/users/[userId]/update-profile
 * Methods: POST (update user profile)
 */

import type { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  authenticate,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

const prisma = new PrismaClient();

/**
 * POST /api/users/[userId]/update-profile
 * Update user profile information
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  let authUser;
  try {
    authUser = await authenticate(request);
  } catch (authError) {
    const authErrorMessage = authError instanceof Error ? authError.message : 'Authentication failed';
    logger.error('Authentication error in update-profile:', { message: authErrorMessage }, 'POST /api/users/[userId]/update-profile');
    return errorResponse('Authentication required', 401);
  }

  try {
    const { userId } = await params;

    if (!userId) {
      return errorResponse('User ID is required', 400);
    }

    // Ensure user can only update their own profile
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized: You can only update your own profile', 403);
    }

    const body = await request.json();
    const { username, displayName, bio, profileImageUrl } = body;

    // Validate username format if provided
    if (username !== undefined && username !== null) {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length > 0) {
        // Username validation: alphanumeric, underscores, hyphens, 3-30 chars
        const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
        if (!usernameRegex.test(trimmedUsername)) {
          return errorResponse('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens', 400);
        }
      }
    }

    // Check if username is already taken (if provided and different)
    if (username !== undefined && username !== null && username.trim().length > 0) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username.trim(),
          id: { not: userId },
        },
      });

      if (existingUser) {
        return errorResponse('Username is already taken', 409);
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
        profileComplete: true,
        hasUsername: true,
        hasBio: true,
        hasProfileImage: true,
      },
    });

    return successResponse({
      user: updatedUser,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    // Better error logging - extract error details properly
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = {
      message: errorMessage,
      stack: errorStack,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : error,
    };
    logger.error('Error updating profile:', errorDetails, 'POST /api/users/[userId]/update-profile');
    return errorResponse('Failed to update profile', 500);
  }
}

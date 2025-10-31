/**
 * API Route: /api/users/[userId]/is-new
 * Methods: GET (check if user needs setup)
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
 * GET /api/users/[userId]/is-new
 * Check if user needs profile setup
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Optional authentication - if not authenticated, return needsSetup: false
    const authUser = await authenticate(request).catch(() => null);
    const { userId } = await params;

    if (!authUser) {
      return successResponse({ needsSetup: false });
    }

    // Ensure requesting user matches the userId in the URL
    if (authUser.userId !== userId) {
      return errorResponse('Unauthorized', 403);
    }

    // Check if user exists and needs setup
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!dbUser) {
      // User doesn't exist yet - needs setup
      return successResponse({ needsSetup: true });
    }

    // Check if profile is complete
    // User needs setup if they don't have username, displayName, or bio
    const needsSetup = !dbUser.profileComplete && (
      !dbUser.username ||
      !dbUser.displayName ||
      !dbUser.hasUsername ||
      !dbUser.hasBio
    );

    return successResponse({
      needsSetup,
      profileComplete: dbUser.profileComplete || false,
      hasUsername: dbUser.hasUsername || false,
      hasBio: dbUser.hasBio || false,
      hasProfileImage: dbUser.hasProfileImage || false,
    });
  } catch (error) {
    logger.error('Error checking new user status:', error, 'GET /api/users/[userId]/is-new');
    // Return needsSetup: false on error to prevent blocking user
    return successResponse({ needsSetup: false });
  }
}


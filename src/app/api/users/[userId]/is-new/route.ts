/**
 * API Route: /api/users/[userId]/is-new
 * Methods: GET (check if user needs profile setup)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  optionalAuth,
  successResponse,
  errorResponse,
} from '@/lib/api/auth-middleware';

const prisma = new PrismaClient();

/**
 * GET /api/users/[userId]/is-new
 * Check if user needs to complete profile setup
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const authUser = await optionalAuth(request);

    // Only show for own profile
    if (authUser?.userId !== userId) {
      return errorResponse('Unauthorized', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        profileComplete: true,
        profileSetupCompletedAt: true,
        hasUsername: true,
        hasProfileImage: true,
        hasBio: true,
        createdAt: true,
      },
    });

    if (!user) {
      return successResponse({
        isNew: true,
        needsSetup: true,
      });
    }

    const needsSetup =
      !user.profileSetupCompletedAt ||
      (!user.hasUsername && !user.hasBio);

    return successResponse({
      isNew: needsSetup,
      needsSetup,
      profile: {
        hasUsername: user.hasUsername,
        hasProfileImage: user.hasProfileImage,
        hasBio: user.hasBio,
        profileComplete: user.profileComplete,
      },
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    return errorResponse('Failed to check user status');
  }
}


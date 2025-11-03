/**
 * API Route: /api/onboarding/random-assets
 * Methods: GET (get random profile picture and banner indices)
 */

import type { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';

const TOTAL_PROFILE_PICTURES = 100;
const TOTAL_BANNERS = 100;

interface RandomAssets {
  profilePictureIndex: number;
  bannerIndex: number;
}

/**
 * GET /api/onboarding/random-assets
 * Get random profile picture and banner indices
 */
export async function GET(request: NextRequest) {
  try {
    const profilePictureIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
    const bannerIndex = Math.floor(Math.random() * TOTAL_BANNERS) + 1;

    const assets: RandomAssets = {
      profilePictureIndex,
      bannerIndex,
    };

    logger.debug('Generated random assets', assets, 'GET /api/onboarding/random-assets');

    return successResponse(assets);

  } catch (error) {
    logger.error('Error generating random assets:', error, 'GET /api/onboarding/random-assets');
    return errorResponse('Failed to generate random assets', 500);
  }
}


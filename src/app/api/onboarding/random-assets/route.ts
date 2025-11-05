/**
 * API Route: /api/onboarding/random-assets
 * Methods: GET (get random profile picture and banner indices)
 */

import { successResponse } from '@/lib/api/auth-middleware';
import { logger } from '@/lib/logger';
import type { NextRequest } from 'next/server';

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
export async function GET(_request: NextRequest) {
  const profilePictureIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
  const bannerIndex = Math.floor(Math.random() * TOTAL_BANNERS) + 1;

  const assets: RandomAssets = {
    profilePictureIndex,
    bannerIndex,
  };

  logger.debug('Generated random assets', assets, 'GET /api/onboarding/random-assets');

  return successResponse(assets);
}


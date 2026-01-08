/**
 * Game Onboarding Status API
 *
 * @route GET /api/onboarding/game-status - Get game onboarding status
 * @access Private (authenticated users only)
 *
 * @description
 * Returns the current game tutorial onboarding status for the authenticated user.
 */

import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { getOrCreateOnboarding } from '@babylon/engine';
import type { NextRequest } from 'next/server';

/**
 * GET /api/onboarding/game-status
 *
 * Returns current game onboarding status for the authenticated user.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  const onboarding = await getOrCreateOnboarding(user.userId);
  const state = onboarding.state;

  // Calculate total points earned, defensively validating each reward item
  const totalPointsEarned =
    state?.rewards?.reduce((sum: number, r: unknown) => {
      // Validate r is an object with a numeric points property
      if (
        r !== null &&
        typeof r === 'object' &&
        'points' in r &&
        typeof (r as { points: unknown }).points === 'number' &&
        !isNaN((r as { points: number }).points)
      ) {
        return sum + (r as { points: number }).points;
      }
      return sum;
    }, 0) ?? 0;

  return successResponse({
    currentStep: onboarding.currentStep,
    completedSteps: state?.completedSteps ?? [],
    totalPointsEarned,
    isComplete: onboarding.isComplete,
  });
});

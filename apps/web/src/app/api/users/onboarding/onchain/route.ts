/**
 * User On-Chain Onboarding API
 *
 * @route POST /api/users/onboarding/onchain
 * @access Authenticated
 *
 * @deprecated This endpoint is deprecated. Use POST /api/users/register-onchain instead.
 * On-chain registration is now opt-in and costs POINTS.ONCHAIN_REGISTRATION points.
 */

import { BusinessLogicError, withErrorHandling } from '@babylon/api';
import type { NextRequest } from 'next/server';

export const POST = withErrorHandling(async (_request: NextRequest) => {
  throw new BusinessLogicError(
    'This endpoint is deprecated. Use POST /api/users/register-onchain for on-chain registration.',
    'DEPRECATED'
  );
});

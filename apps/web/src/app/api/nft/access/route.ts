import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { getNftAccessStatusForAuthUser } from '@babylon/api/services/nft-access-service';
import type { NextRequest } from 'next/server';
import type { NftAccessResponse } from '@/types/nft';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  const { allowed, degraded } = await getNftAccessStatusForAuthUser(user);

  return successResponse({
    success: true,
    data: { hasAccess: allowed, degraded },
  } satisfies NftAccessResponse);
});

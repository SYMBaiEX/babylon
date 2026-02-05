import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { getNftAccessStatusForAuthUser } from '@babylon/api/services/nft-access-service';
import type { NextRequest } from 'next/server';
import type { NftAccessResponse } from '@/types/nft';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  let allowed: boolean;
  let degraded: boolean;
  try {
    ({ allowed, degraded } = await getNftAccessStatusForAuthUser(user));
  } catch (error) {
    const causeCode = (error as { cause?: { code?: string } } | null)?.cause
      ?.code;
    const code = causeCode ?? (error as { code?: string } | null)?.code;

    // Degraded mode: if the DB schema isn't present yet (e.g. missing NFT tables),
    // avoid hard-failing the waitlist host with a 500.
    if (code === '42P01' || code === '42703') {
      allowed = false;
      degraded = true;
    } else {
      throw error;
    }
  }

  return successResponse({
    success: true,
    data: { hasAccess: allowed, degraded },
  } satisfies NftAccessResponse);
});

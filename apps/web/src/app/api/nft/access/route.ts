import {
  authenticate,
  ServiceUnavailableError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { getNftAccessStatusForAuthUser } from '@babylon/api/services/nft-access-service';
import type { NextRequest } from 'next/server';
import type { NftAccessResponse } from '@/types/nft';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  if (user.isAdmin) {
    return successResponse({
      success: true,
      data: { hasAccess: true, reason: 'whitelist' },
    } satisfies NftAccessResponse);
  }

  try {
    const status = await getNftAccessStatusForAuthUser(user);
    return successResponse({
      success: true,
      data: { hasAccess: status.allowed, reason: status.reason },
    } satisfies NftAccessResponse);
  } catch (error: unknown) {
    const causeCode = (error as { cause?: { code?: string } } | null)?.cause
      ?.code;
    const code = causeCode ?? (error as { code?: string } | null)?.code;

    // Fail closed without caching: surface indexer/schema issues as 503.
    if (code === '42P01' || code === '42703') {
      throw new ServiceUnavailableError('NFT access check unavailable');
    }
    if (error && typeof error === 'object' && 'name' in error) {
      const name = (error as { name?: string }).name ?? '';
      if (name === 'NftIndexerUnavailableError') {
        throw new ServiceUnavailableError('NFT indexer unavailable');
      }
    }
    throw error;
  }
});

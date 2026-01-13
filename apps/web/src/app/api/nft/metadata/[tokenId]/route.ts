import { BadRequestError, withErrorHandling } from '@babylon/api';
import { getTokenMetadata } from '@babylon/api/services/nft-mint-service';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/nft/metadata/[tokenId]
 *
 * Returns ERC-721 compatible metadata (OpenSea standard).
 * Used by the smart contract's tokenURI function.
 * Cached for 1 hour with stale-while-revalidate.
 */
export const GET = withErrorHandling(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ tokenId: string }> }
  ) => {
    const { tokenId: tokenIdParam } = await params;
    const tokenId = parseInt(tokenIdParam, 10);

    if (Number.isNaN(tokenId) || tokenId < 1 || tokenId > 100) {
      throw new BadRequestError('Token ID must be between 1 and 100');
    }

    return NextResponse.json(await getTokenMetadata(tokenId), {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  }
);

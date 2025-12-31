/**
 * NFT Collection Gallery API
 *
 * @route GET /api/nft/collection
 * @access Public
 *
 * @description
 * Returns paginated list of NFTs in the Babylon Top 100 collection.
 * Supports filtering by claimed status, traits, and search.
 * This endpoint is public - no authentication required.
 */

import { successResponse, withErrorHandling } from '@babylon/api';
import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  ilike,
  isNull,
  nftCollection,
  nftOwnership,
  or,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import type { NftGalleryResponse, NftSummary } from '@/types/nft';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const page = Math.max(
    1,
    parseInt(searchParams.get('page') ?? String(DEFAULT_PAGE), 10)
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
    )
  );
  const sort = (searchParams.get('sort') ?? 'tokenId') as
    | 'tokenId'
    | 'name'
    | 'claimedAt';
  const order = (searchParams.get('order') ?? 'asc') as 'asc' | 'desc';
  const claimedFilter = searchParams.get('claimed');
  const searchQuery = searchParams.get('search');

  const offset = (page - 1) * limit;

  logger.info(
    'Fetching NFT collection',
    { page, limit, sort, order, claimedFilter, searchQuery },
    'GET /api/nft/collection'
  );

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [];

  // Search filter (by name or token ID)
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = `%${searchQuery.trim()}%`;
    const tokenIdSearch = parseInt(searchQuery.trim(), 10);

    if (!isNaN(tokenIdSearch)) {
      conditions.push(
        or(
          ilike(nftCollection.name, searchTerm),
          eq(nftCollection.tokenId, tokenIdSearch)
        )!
      );
    } else {
      conditions.push(ilike(nftCollection.name, searchTerm));
    }
  }

  // Get total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(nftCollection)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const totalNfts = totalResult?.count ?? 0;

  // Get claimed/unclaimed counts
  const [claimedCountResult] = await db
    .select({ count: count() })
    .from(nftCollection)
    .innerJoin(nftOwnership, eq(nftCollection.tokenId, nftOwnership.tokenId));

  const claimedCount = claimedCountResult?.count ?? 0;
  const unclaimedCount = totalNfts - claimedCount;

  // Build ORDER BY clause
  let orderByClause;
  const orderFn = order === 'desc' ? desc : asc;

  switch (sort) {
    case 'name':
      orderByClause = orderFn(nftCollection.name);
      break;
    case 'tokenId':
    default:
      orderByClause = orderFn(nftCollection.tokenId);
      break;
  }

  // Build query based on claimed filter
  // For unclaimed filter, add isNull condition; for claimed, use inner join
  const baseSelect = {
    tokenId: nftCollection.tokenId,
    name: nftCollection.name,
    thumbnailUrl: nftCollection.thumbnailUrl,
    imageUrl: nftCollection.imageUrl,
    ownerAddress: nftOwnership.ownerAddress,
    ownerUserId: nftOwnership.userId,
    ownerUsername: users.username,
    ownerDisplayName: users.displayName,
    ownerProfileImageUrl: users.profileImageUrl,
    acquiredAt: nftOwnership.acquiredAt,
    txHash: nftOwnership.txHash,
  };

  let nftsResult;

  if (claimedFilter === 'true') {
    // Only claimed NFTs - use inner join to filter
    nftsResult = await db
      .select(baseSelect)
      .from(nftCollection)
      .innerJoin(nftOwnership, eq(nftCollection.tokenId, nftOwnership.tokenId))
      .leftJoin(users, eq(nftOwnership.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);
  } else if (claimedFilter === 'false') {
    // Only unclaimed NFTs - add isNull condition
    nftsResult = await db
      .select(baseSelect)
      .from(nftCollection)
      .leftJoin(nftOwnership, eq(nftCollection.tokenId, nftOwnership.tokenId))
      .leftJoin(users, eq(nftOwnership.userId, users.id))
      .where(and(isNull(nftOwnership.tokenId), ...conditions))
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);
  } else {
    // All NFTs
    nftsResult = await db
      .select(baseSelect)
      .from(nftCollection)
      .leftJoin(nftOwnership, eq(nftCollection.tokenId, nftOwnership.tokenId))
      .leftJoin(users, eq(nftOwnership.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);
  }

  // Transform results to response format
  const nfts: NftSummary[] = nftsResult.map((nft) => ({
    tokenId: nft.tokenId,
    name: nft.name,
    thumbnailUrl: nft.thumbnailUrl ?? nft.imageUrl,
    imageUrl: nft.imageUrl,
    owner: nft.ownerAddress
      ? {
          walletAddress: nft.ownerAddress,
          user: nft.ownerUserId
            ? {
                id: nft.ownerUserId,
                username: nft.ownerUsername,
                displayName: nft.ownerDisplayName,
                profileImageUrl: nft.ownerProfileImageUrl,
              }
            : null,
          acquiredAt: nft.acquiredAt?.toISOString() ?? new Date().toISOString(),
          txHash: nft.txHash,
        }
      : null,
  }));

  // Calculate total for current filter
  const filteredTotal =
    claimedFilter === 'true'
      ? claimedCount
      : claimedFilter === 'false'
        ? unclaimedCount
        : totalNfts;

  const response: NftGalleryResponse = {
    success: true,
    data: {
      nfts,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit),
      },
      stats: {
        totalNfts,
        claimedCount,
        unclaimedCount,
      },
      filters: {
        traits: [], // Trait filtering available on detail pages
      },
    },
  };

  logger.info(
    'NFT collection fetched',
    {
      page,
      limit,
      totalNfts,
      claimedCount,
      returnedCount: nfts.length,
    },
    'GET /api/nft/collection'
  );

  return successResponse(response);
});

/**
 * NFT Eligibility Check API
 *
 * @route GET /api/nft/eligibility
 * @access Authenticated
 *
 * @description
 * Checks if the authenticated user is eligible to mint an NFT from the
 * Babylon Top 100 collection. Eligibility is based on the leaderboard
 * snapshot taken at midnight UTC.
 *
 * @returns {EligibilityResponse} User's mint eligibility status
 */

import {
  authenticate,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, nftCollection, nftSnapshot } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import type { EligibilityResponse, EligibilityStatus } from '@/types/nft';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  logger.info(
    'Checking NFT mint eligibility',
    { userId },
    'GET /api/nft/eligibility'
  );

  // Check if user is in the snapshot (Top 100)
  const [snapshotEntry] = await db
    .select({
      id: nftSnapshot.id,
      userId: nftSnapshot.userId,
      walletAddress: nftSnapshot.walletAddress,
      rank: nftSnapshot.rank,
      points: nftSnapshot.points,
      snapshotTakenAt: nftSnapshot.snapshotTakenAt,
      hasMinted: nftSnapshot.hasMinted,
      mintedTokenId: nftSnapshot.mintedTokenId,
      mintedAt: nftSnapshot.mintedAt,
      mintTxHash: nftSnapshot.mintTxHash,
    })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, userId))
    .limit(1);

  // User not in snapshot - not eligible
  if (!snapshotEntry) {
    const response: EligibilityResponse = {
      eligible: false,
      status: 'not_eligible' as EligibilityStatus,
      hasMinted: false,
      reason: 'not_in_top_100',
    };

    logger.info(
      'User not eligible - not in Top 100 snapshot',
      { userId },
      'GET /api/nft/eligibility'
    );

    return successResponse(response);
  }

  // User has already minted
  if (snapshotEntry.hasMinted && snapshotEntry.mintedTokenId !== null) {
    // Get the minted NFT details
    const [mintedNft] = await db
      .select({
        tokenId: nftCollection.tokenId,
        name: nftCollection.name,
        thumbnailUrl: nftCollection.thumbnailUrl,
      })
      .from(nftCollection)
      .where(eq(nftCollection.tokenId, snapshotEntry.mintedTokenId))
      .limit(1);

    const response: EligibilityResponse = {
      eligible: true,
      status: 'already_minted' as EligibilityStatus,
      snapshotRank: snapshotEntry.rank,
      snapshotPoints: snapshotEntry.points,
      snapshotTakenAt: snapshotEntry.snapshotTakenAt.toISOString(),
      hasMinted: true,
      mintedNft: mintedNft
        ? {
            tokenId: mintedNft.tokenId,
            name: mintedNft.name,
            thumbnailUrl: mintedNft.thumbnailUrl ?? '',
            txHash: snapshotEntry.mintTxHash ?? '',
          }
        : undefined,
    };

    logger.info(
      'User already minted their NFT',
      {
        userId,
        rank: snapshotEntry.rank,
        tokenId: snapshotEntry.mintedTokenId,
      },
      'GET /api/nft/eligibility'
    );

    return successResponse(response);
  }

  // User is eligible and hasn't minted yet
  const response: EligibilityResponse = {
    eligible: true,
    status: 'eligible' as EligibilityStatus,
    snapshotRank: snapshotEntry.rank,
    snapshotPoints: snapshotEntry.points,
    snapshotTakenAt: snapshotEntry.snapshotTakenAt.toISOString(),
    hasMinted: false,
  };

  logger.info(
    'User is eligible to mint',
    { userId, rank: snapshotEntry.rank, points: snapshotEntry.points },
    'GET /api/nft/eligibility'
  );

  return successResponse(response);
});

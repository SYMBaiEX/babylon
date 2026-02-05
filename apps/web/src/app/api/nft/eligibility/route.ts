import { authenticate, successResponse, withErrorHandling } from '@babylon/api';
import { db, eq, nftCollection, nftSnapshot } from '@babylon/db';
import type { NextRequest } from 'next/server';
import type { EligibilityApiResponse, EligibilityResponse } from '@/types/nft';

export const GET = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  let snapshotEntry:
    | {
        id: string;
        userId: string;
        walletAddress: string | null;
        rank: number;
        points: number;
        snapshotTakenAt: Date;
        hasMinted: boolean;
        mintedTokenId: number | null;
        mintedAt: Date | null;
        mintTxHash: string | null;
      }
    | undefined;

  try {
    const [entry] = await db
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
    snapshotEntry = entry;
  } catch (error) {
    const causeCode = (error as { cause?: { code?: string } } | null)?.cause
      ?.code;
    const code = causeCode ?? (error as { code?: string } | null)?.code;

    // Missing tables/columns in the DB should not surface as a hard 500 on the waitlist host.
    if (code === '42P01' || code === '42703') {
      const payload = {
        eligible: false,
        status: 'not_eligible',
        hasMinted: false,
        reason: 'snapshot_unavailable',
      } satisfies EligibilityResponse;

      return successResponse({
        success: true,
        data: payload,
      } satisfies EligibilityApiResponse);
    }
    throw error;
  }

  if (!snapshotEntry) {
    const payload = {
      eligible: false,
      status: 'not_eligible',
      hasMinted: false,
      reason: 'not_in_top_100',
    } satisfies EligibilityResponse;

    return successResponse({
      success: true,
      data: payload,
    } satisfies EligibilityApiResponse);
  }

  if (snapshotEntry.hasMinted && snapshotEntry.mintedTokenId !== null) {
    let mintedNft:
      | { tokenId: number; name: string; thumbnailUrl: string | null }
      | undefined;
    try {
      [mintedNft] = await db
        .select({
          tokenId: nftCollection.tokenId,
          name: nftCollection.name,
          thumbnailUrl: nftCollection.thumbnailUrl,
        })
        .from(nftCollection)
        .where(eq(nftCollection.tokenId, snapshotEntry.mintedTokenId))
        .limit(1);
    } catch (error) {
      const causeCode = (error as { cause?: { code?: string } } | null)?.cause
        ?.code;
      const code = causeCode ?? (error as { code?: string } | null)?.code;
      if (code !== '42P01' && code !== '42703') throw error;
      mintedNft = undefined;
    }

    const payload = {
      eligible: true,
      status: 'already_minted',
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
    } satisfies EligibilityResponse;

    return successResponse({
      success: true,
      data: payload,
    } satisfies EligibilityApiResponse);
  }

  const payload = {
    eligible: true,
    status: 'eligible',
    snapshotRank: snapshotEntry.rank,
    snapshotPoints: snapshotEntry.points,
    snapshotTakenAt: snapshotEntry.snapshotTakenAt.toISOString(),
    hasMinted: false,
  } satisfies EligibilityResponse;

  return successResponse({
    success: true,
    data: payload,
  } satisfies EligibilityApiResponse);
});

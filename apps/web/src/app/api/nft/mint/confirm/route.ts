/**
 * NFT Mint Confirm API
 *
 * @route POST /api/nft/mint/confirm
 * @access Authenticated
 *
 * @description
 * Confirms a successful mint transaction after the user has submitted
 * the transaction on-chain. Updates the database to record the mint
 * and returns the minted NFT details for the reveal animation.
 *
 * This endpoint should be called after the transaction is confirmed
 * on-chain, passing the transaction hash for verification.
 */

import {
  authenticate,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  db,
  eq,
  isNull,
  nftClaims,
  nftCollection,
  nftOwnership,
  nftSnapshot,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import type { MintConfirmRequest, MintConfirmResponse } from '@/types/nft';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  const body = (await request.json()) as MintConfirmRequest;
  const { txHash, walletAddress } = body;

  if (!txHash || typeof txHash !== 'string') {
    throw new BadRequestError('Transaction hash is required');
  }

  if (!walletAddress || typeof walletAddress !== 'string') {
    throw new BadRequestError('Wallet address is required');
  }

  logger.info(
    'Confirming NFT mint',
    { userId, txHash, walletAddress },
    'POST /api/nft/mint/confirm'
  );

  // Get user's wallet address from DB to verify
  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.walletAddress) {
    throw new BadRequestError('No wallet connected to your account');
  }

  // Verify the wallet address matches
  if (user.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ForbiddenError('Wallet address does not match your account');
  }

  // Check eligibility from snapshot
  const [snapshotEntry] = await db
    .select({
      id: nftSnapshot.id,
      userId: nftSnapshot.userId,
      rank: nftSnapshot.rank,
      points: nftSnapshot.points,
      hasMinted: nftSnapshot.hasMinted,
      mintedTokenId: nftSnapshot.mintedTokenId,
    })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, userId))
    .limit(1);

  if (!snapshotEntry) {
    throw new ForbiddenError('You are not eligible to mint');
  }

  if (snapshotEntry.hasMinted) {
    throw new ConflictError('You have already minted your NFT');
  }

  // Find an available NFT to assign (random assignment)
  // Get all unclaimed NFTs and pick one randomly
  const unclaimedNfts = await db
    .select({
      tokenId: nftCollection.tokenId,
      name: nftCollection.name,
      imageUrl: nftCollection.imageUrl,
      thumbnailUrl: nftCollection.thumbnailUrl,
      storyTitle: nftCollection.storyTitle,
    })
    .from(nftCollection)
    .leftJoin(nftOwnership, eq(nftCollection.tokenId, nftOwnership.tokenId))
    .where(isNull(nftOwnership.tokenId));

  if (unclaimedNfts.length === 0) {
    throw new InternalServerError(
      'No NFTs available for minting. Please contact support.'
    );
  }

  // Random selection - we know unclaimedNfts.length > 0 from check above
  const randomIndex = Math.floor(Math.random() * unclaimedNfts.length);
  const assignedNft = unclaimedNfts[randomIndex]!;

  const now = new Date();

  // Start a transaction to update all tables atomically
  await db.transaction(async (tx) => {
    // 1. Update snapshot to mark as minted
    await tx
      .update(nftSnapshot)
      .set({
        hasMinted: true,
        mintedTokenId: assignedNft.tokenId,
        mintedAt: now,
        mintTxHash: txHash,
      })
      .where(eq(nftSnapshot.userId, userId));

    // 2. Create ownership record
    await tx.insert(nftOwnership).values({
      id: nanoid(),
      tokenId: assignedNft.tokenId,
      ownerAddress: walletAddress.toLowerCase(),
      userId: userId,
      acquiredAt: now,
      txHash: txHash,
      updatedAt: now,
    });

    // 3. Create claim record (provenance)
    await tx.insert(nftClaims).values({
      id: nanoid(),
      tokenId: assignedNft.tokenId,
      claimerUserId: userId,
      claimerAddress: walletAddress.toLowerCase(),
      claimedAt: now,
      txHash: txHash,
      snapshotRank: snapshotEntry.rank,
      snapshotPoints: snapshotEntry.points,
    });
  });

  const response: MintConfirmResponse = {
    success: true,
    tokenId: assignedNft.tokenId,
    nft: {
      tokenId: assignedNft.tokenId,
      name: assignedNft.name,
      imageUrl: assignedNft.imageUrl,
      thumbnailUrl: assignedNft.thumbnailUrl,
      storyTitle: assignedNft.storyTitle,
    },
  };

  logger.info(
    'NFT mint confirmed successfully',
    {
      userId,
      tokenId: assignedNft.tokenId,
      name: assignedNft.name,
      rank: snapshotEntry.rank,
      txHash,
    },
    'POST /api/nft/mint/confirm'
  );

  return successResponse(response);
});

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
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import type { MintConfirmRequest, MintConfirmResponse } from '@/types/nft';

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  const body = (await request.json()) as MintConfirmRequest;
  const { txHash, walletAddress } = body;

  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    throw new BadRequestError('Invalid transaction hash');
  }

  if (!walletAddress || !ADDRESS_REGEX.test(walletAddress)) {
    throw new BadRequestError('Invalid wallet address');
  }

  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.walletAddress) {
    throw new BadRequestError('No wallet connected');
  }

  if (user.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ForbiddenError('Wallet mismatch');
  }

  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [snapshotEntry] = await tx
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
      throw new ForbiddenError('Not eligible');
    }

    if (snapshotEntry.hasMinted) {
      throw new ConflictError('Already minted');
    }

    const unclaimedNfts = await tx
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
      throw new InternalServerError('No NFTs available');
    }

    const assignedNft =
      unclaimedNfts[Math.floor(Math.random() * unclaimedNfts.length)]!;

    await tx
      .update(nftSnapshot)
      .set({
        hasMinted: true,
        mintedTokenId: assignedNft.tokenId,
        mintedAt: now,
        mintTxHash: txHash,
      })
      .where(eq(nftSnapshot.userId, userId));

    await tx.insert(nftOwnership).values({
      id: nanoid(),
      tokenId: assignedNft.tokenId,
      ownerAddress: walletAddress.toLowerCase(),
      userId: userId,
      acquiredAt: now,
      txHash: txHash,
      updatedAt: now,
    });

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

    return { assignedNft, snapshotEntry };
  });

  const { assignedNft } = result;

  return successResponse({
    success: true,
    tokenId: assignedNft.tokenId,
    nft: {
      tokenId: assignedNft.tokenId,
      name: assignedNft.name,
      imageUrl: assignedNft.imageUrl,
      thumbnailUrl: assignedNft.thumbnailUrl,
      storyTitle: assignedNft.storyTitle,
    },
  } satisfies MintConfirmResponse);
});

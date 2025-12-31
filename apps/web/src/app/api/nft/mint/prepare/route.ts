import {
  authenticate,
  BadRequestError,
  ForbiddenError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, nftSnapshot, users } from '@babylon/db';
import type { NextRequest } from 'next/server';
import type { MintPrepareResponse } from '@/types/nft';

const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;
const NFT_CHAIN_ID = parseInt(process.env.NFT_CHAIN_ID ?? '1', 10);

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  if (!NFT_CONTRACT_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(NFT_CONTRACT_ADDRESS)) {
    throw new BadRequestError('NFT minting is not available yet');
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
    throw new BadRequestError('Wallet not connected');
  }

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
    throw new ForbiddenError('Not in Top 100 snapshot');
  }

  if (snapshotEntry.hasMinted) {
    throw new ForbiddenError('Already minted');
  }

  return successResponse({
    contractAddress: NFT_CONTRACT_ADDRESS,
    chainId: NFT_CHAIN_ID,
    functionName: 'mint',
    args: [user.walletAddress],
    value: '0',
  } satisfies MintPrepareResponse);
});

/**
 * NFT Mint Prepare API
 *
 * @route POST /api/nft/mint/prepare
 * @access Authenticated
 *
 * @description
 * Prepares the mint transaction data for an eligible user.
 * Returns the contract call parameters needed to execute the mint
 * transaction on-chain.
 *
 * Prerequisites:
 * - User must be in Top 100 snapshot
 * - User must not have already minted
 * - User must have a connected wallet
 */

import {
  authenticate,
  BadRequestError,
  ForbiddenError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, nftSnapshot, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import type { MintPrepareResponse } from '@/types/nft';

// Contract configuration - will be set via environment variables
const NFT_CONTRACT_ADDRESS =
  process.env.NFT_CONTRACT_ADDRESS ??
  '0x0000000000000000000000000000000000000000';
const NFT_CHAIN_ID = parseInt(process.env.NFT_CHAIN_ID ?? '1', 10);

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.dbUserId ?? authUser.userId;

  logger.info(
    'Preparing NFT mint transaction',
    { userId },
    'POST /api/nft/mint/prepare'
  );

  // Get user's wallet address
  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.walletAddress) {
    throw new BadRequestError(
      'Wallet address not connected. Please connect your wallet first.'
    );
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
    throw new ForbiddenError(
      'You are not in the Top 100 leaderboard snapshot. You are not eligible to mint.'
    );
  }

  if (snapshotEntry.hasMinted) {
    throw new ForbiddenError('You have already minted your NFT.');
  }

  // Prepare the mint transaction
  // The actual contract ABI will determine the exact function signature
  // For now, we assume a simple mint(address to) function
  const response: MintPrepareResponse = {
    contractAddress: NFT_CONTRACT_ADDRESS,
    chainId: NFT_CHAIN_ID,
    functionName: 'mint',
    args: [user.walletAddress],
    value: '0', // Free mint
  };

  logger.info(
    'Mint transaction prepared',
    {
      userId,
      rank: snapshotEntry.rank,
      walletAddress: user.walletAddress,
      contractAddress: NFT_CONTRACT_ADDRESS,
    },
    'POST /api/nft/mint/prepare'
  );

  return successResponse(response);
});

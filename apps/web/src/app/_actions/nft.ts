'use server';

import {
  getAuthedUserContextFromPrivyToken,
  sendSponsoredEvmTransaction,
} from '@babylon/api';
import {
  type ConfirmResult,
  confirmMint,
  prepareMint,
} from '@babylon/api/services/nft-mint-service';
import { logger, ValidationError } from '@babylon/shared';
import type { Address, Hex } from 'viem';

import { requirePrivyToken } from './utils';

/**
 * Result of the NFT mint action.
 * - `status: 'confirmed'`: Transaction confirmed and NFT data available
 * - `status: 'pending'`: Transaction submitted but not yet confirmed (user can check later)
 */
export type MintNftActionResult =
  | ({ status: 'confirmed'; txHash: Hex } & ConfirmResult)
  | { status: 'pending'; txHash: Hex; message: string };

/**
 * Exponential backoff sleep with jitter for polling.
 * Starts at baseMs and increases up to maxMs with each attempt.
 */
function backoffSleep(
  attempt: number,
  baseMs = 1000,
  maxMs = 5000
): Promise<void> {
  // Exponential: 1s, 2s, 4s, 5s (capped), 5s, ...
  const exponentialDelay = Math.min(baseMs * 2 ** attempt, maxMs);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  const finalDelay = Math.round(exponentialDelay + jitter);
  return new Promise((resolve) => setTimeout(resolve, finalDelay));
}

/**
 * Mints an NFT for the authenticated user via server-side sponsored transaction.
 *
 * The function submits the transaction and polls for confirmation. If confirmation
 * takes longer than ~60 seconds (network congestion), it returns a 'pending' status
 * with the transaction hash so the user can manually verify on a block explorer.
 *
 * @returns MintNftActionResult with either 'confirmed' (includes NFT data) or 'pending' status
 */
export async function mintNftAction(input?: {
  userJwt?: string;
}): Promise<MintNftActionResult> {
  const privyToken = await requirePrivyToken(input?.userJwt);
  const ctx = await getAuthedUserContextFromPrivyToken(privyToken);

  const prepare = await prepareMint(ctx.dbUserId);
  const { hash } = await sendSponsoredEvmTransaction({
    userJwt: privyToken,
    walletId: ctx.privyWalletId,
    to: prepare.contractAddress as Address,
    data: prepare.encodedData,
    valueWei: 0n,
    caip2: `eip155:${prepare.chainId}`,
    chainId: prepare.chainId,
  });

  // Poll for transaction confirmation with exponential backoff.
  // Total timeout ~60 seconds: attempts at 0s, 1s, 3s, 7s, 12s, 17s, 22s, 27s, 32s, 37s, 42s, 47s, 52s, 57s
  const maxAttempts = 14;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const confirmed = await confirmMint(ctx.dbUserId, hash, prepare.to);
      return { status: 'confirmed', txHash: hash, ...confirmed };
    } catch (error) {
      if (
        error instanceof ValidationError &&
        error.message.startsWith('Transaction not found:')
      ) {
        await backoffSleep(attempt);
        continue;
      }
      throw error;
    }
  }

  // Transaction submitted but not yet confirmed after ~60 seconds.
  // Return pending status with txHash so user can manually verify on block explorer.
  logger.warn(
    'NFT mint transaction pending after timeout',
    { txHash: hash, userId: ctx.dbUserId, attempts: maxAttempts },
    'mintNftAction'
  );

  return {
    status: 'pending',
    txHash: hash,
    message:
      'Transaction submitted but confirmation is taking longer than expected. ' +
      'Your NFT should appear shortly. You can track the transaction on a block explorer.',
  };
}

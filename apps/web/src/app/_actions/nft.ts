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
 * - `status: 'error'`: An error occurred — message is safe to show in UI
 */
export type MintNftActionResult =
  | ({ status: 'confirmed'; txHash: Hex } & ConfirmResult)
  | { status: 'pending'; txHash: Hex; message: string }
  | { status: 'error'; error: string; step: string };

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
  // Step 1: Auth
  let privyToken: string;
  try {
    privyToken = await requirePrivyToken(input?.userJwt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Auth failed';
    return { status: 'error', error: msg, step: 'auth' };
  }

  // Step 2: User context
  let ctx: Awaited<ReturnType<typeof getAuthedUserContextFromPrivyToken>>;
  try {
    ctx = await getAuthedUserContextFromPrivyToken(privyToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'User context failed';
    return { status: 'error', error: msg, step: 'user_context' };
  }

  // Step 3: Prepare mint
  let prepare: Awaited<ReturnType<typeof prepareMint>>;
  try {
    prepare = await prepareMint(ctx.dbUserId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Prepare failed';
    return { status: 'error', error: msg, step: 'prepare' };
  }

  // Step 4: Send transaction via Privy
  let hash: Hex;
  try {
    const result = await sendSponsoredEvmTransaction({
      userJwt: privyToken,
      walletId: ctx.privyWalletId,
      to: prepare.contractAddress as Address,
      data: prepare.encodedData,
      valueWei: 0n,
      caip2: `eip155:${prepare.chainId}`,
      chainId: prepare.chainId,
    });
    hash = result.hash;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send transaction failed';
    return { status: 'error', error: msg, step: 'send_transaction' };
  }

  // Step 5: Poll for confirmation
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
      const msg = error instanceof Error ? error.message : 'Confirm failed';
      return { status: 'error', error: msg, step: 'confirm' };
    }
  }

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

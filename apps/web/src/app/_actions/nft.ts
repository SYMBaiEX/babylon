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
import { ValidationError } from '@babylon/shared';
import type { Address, Hex } from 'viem';

import { requirePrivyToken } from './utils';

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

export async function mintNftAction(input?: {
  userJwt?: string;
}): Promise<{ txHash: Hex } & ConfirmResult> {
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
      return { txHash: hash, ...confirmed };
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

  throw new Error(`Mint transaction pending. Try again later. TX: ${hash}`);
}

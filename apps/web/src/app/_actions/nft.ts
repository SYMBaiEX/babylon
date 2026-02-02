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
import { cookies } from 'next/headers';
import type { Address, Hex } from 'viem';

async function requirePrivyToken(): Promise<string> {
  const token = (await cookies()).get('privy-token')?.value;
  if (!token) throw new Error('Unauthorized');
  return token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mintNftAction(): Promise<
  { txHash: Hex } & ConfirmResult
> {
  const privyToken = await requirePrivyToken();
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

  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const confirmed = await confirmMint(ctx.dbUserId, hash, prepare.to);
      return { txHash: hash, ...confirmed };
    } catch (error) {
      if (
        error instanceof ValidationError &&
        error.message.startsWith('Transaction not found:')
      ) {
        await sleep(2000);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Mint transaction pending. Try again later. TX: ${hash}`);
}

'use server';

import {
  getAuthedUserContextFromPrivyToken,
  sendSponsoredEvmTransaction,
} from '@babylon/api';
import { getContractAddresses } from '@babylon/contracts';
import {
  CAPABILITIES_HASH,
  CHAIN,
  getIdentityRegistryAddress,
  identityRegistryAbi,
  WALLET_ERROR_MESSAGES,
} from '@babylon/shared';
import { cookies } from 'next/headers';
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddress,
  pad,
} from 'viem';
import type { AgentProfileMetadata } from '@/hooks/useUpdateAgentProfileTx';

async function requirePrivyToken(): Promise<string> {
  const token = (await cookies()).get('privy-token')?.value;
  if (!token) throw new Error('Unauthorized');
  return token;
}

function marketIdToBytes32(marketId: string): `0x${string}` {
  const bigintValue = BigInt(marketId);
  const hexValue = `0x${bigintValue.toString(16)}` as `0x${string}`;
  return pad(hexValue, { size: 32 });
}

const { diamond: DIAMOND_ADDRESS } = getContractAddresses();

const PREDICTION_MARKET_ABI = [
  {
    type: 'function',
    name: 'buyShares',
    inputs: [
      { name: '_marketId', type: 'bytes32' },
      { name: '_outcome', type: 'uint8' },
      { name: '_numShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sellShares',
    inputs: [
      { name: '_marketId', type: 'bytes32' },
      { name: '_outcome', type: 'uint8' },
      { name: '_numShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function buySharesOnchainAction(input: {
  marketId: string;
  outcome: 'YES' | 'NO';
  numShares: number;
}): Promise<{ txHash: Hex }> {
  const privyToken = await requirePrivyToken();
  const ctx = await getAuthedUserContextFromPrivyToken(privyToken);

  const marketIdBytes32 = marketIdToBytes32(input.marketId);
  const outcomeIndex = input.outcome === 'YES' ? 1 : 0;
  const sharesBigInt = BigInt(Math.floor(input.numShares * 1e18));

  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: 'buyShares',
    args: [marketIdBytes32, outcomeIndex, sharesBigInt],
  });

  const { hash } = await sendSponsoredEvmTransaction({
    userJwt: privyToken,
    walletId: ctx.privyWalletId,
    to: DIAMOND_ADDRESS as Address,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

export async function sellSharesOnchainAction(input: {
  marketId: string;
  outcome: 'YES' | 'NO';
  numShares: number;
}): Promise<{ txHash: Hex }> {
  const privyToken = await requirePrivyToken();
  const ctx = await getAuthedUserContextFromPrivyToken(privyToken);

  const marketIdBytes32 = marketIdToBytes32(input.marketId);
  const outcomeIndex = input.outcome === 'YES' ? 1 : 0;
  const sharesBigInt = BigInt(Math.floor(input.numShares * 1e18));

  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: 'sellShares',
    args: [marketIdBytes32, outcomeIndex, sharesBigInt],
  });

  const { hash } = await sendSponsoredEvmTransaction({
    userJwt: privyToken,
    walletId: ctx.privyWalletId,
    to: DIAMOND_ADDRESS as Address,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

export async function sendSponsoredEthTransferAction(input: {
  to: string;
  amountWei: string;
}): Promise<{ txHash: Hex }> {
  const privyToken = await requirePrivyToken();
  const ctx = await getAuthedUserContextFromPrivyToken(privyToken);

  if (!isAddress(input.to)) {
    throw new Error('Invalid recipient address');
  }
  const valueWei = BigInt(input.amountWei);

  const { hash } = await sendSponsoredEvmTransaction({
    userJwt: privyToken,
    walletId: ctx.privyWalletId,
    to: input.to.toLowerCase() as Address,
    valueWei,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

export async function updateAgentProfileOnchainAction(input: {
  metadata: AgentProfileMetadata;
  endpoint?: string;
}): Promise<{ txHash: Hex }> {
  const privyToken = await requirePrivyToken();
  const ctx = await getAuthedUserContextFromPrivyToken(privyToken);

  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) {
    throw new Error('Identity registry not configured for this chain');
  }
  if (!ctx.walletAddress) {
    throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
  }

  const endpoint =
    input.endpoint ??
    `https://babylon.market/agent/${ctx.walletAddress.toLowerCase()}`;
  const metadataJson = JSON.stringify({
    ...input.metadata,
    type: input.metadata.type ?? 'user',
    updated: input.metadata.updated ?? new Date().toISOString(),
  });

  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: 'updateAgent',
    args: [endpoint, CAPABILITIES_HASH, metadataJson],
  });

  const { hash } = await sendSponsoredEvmTransaction({
    userJwt: privyToken,
    walletId: ctx.privyWalletId,
    to: registryAddress,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

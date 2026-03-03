'use server';

import {
  getAuthedUserContextFromPrivyTokenBundle,
  requireFreshToken,
  sendSponsoredEvmTransaction,
} from '@babylon/api';
import { db, eq, walletTransferLimit, walletTransferLog } from '@babylon/db';
import {
  CHAIN,
  CHAIN_ID,
  ERC20_ABI,
  ERC721_TRANSFER_ABI,
  generateSnowflakeId,
  logger,
  WALLET_ERROR_MESSAGES,
} from '@babylon/shared';
import {
  type Address,
  encodeFunctionData,
  type Hex,
  isAddress,
  parseAbi,
  parseUnits,
} from 'viem';
import { wrapServerActionWithSentry } from '@/lib/sentry/server-actions';

import { requirePrivyTokenBundle } from './utils';

const erc20Abi = parseAbi(ERC20_ABI);
const erc721Abi = parseAbi(ERC721_TRANSFER_ABI);

function getTxExplorerUrl(txHash: string): string {
  switch (CHAIN_ID) {
    case 1:
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 8453:
      return `https://basescan.org/tx/${txHash}`;
    case 84532:
      return `https://sepolia.basescan.org/tx/${txHash}`;
    default:
      return '';
  }
}

/**
 * Check daily transfer limit using check-on-read pattern.
 * Resets daily counter if UTC day has rolled over.
 */
async function checkDailyLimit(
  userId: string,
  transferUsdValue: number
): Promise<{ allowed: boolean; dailySpent: number; dailyLimit: number }> {
  // Get or create limit record
  let limitRow = await db
    .select()
    .from(walletTransferLimit)
    .where(eq(walletTransferLimit.userId, userId))
    .then((rows) => rows[0]);

  if (!limitRow) {
    const [created] = await db
      .insert(walletTransferLimit)
      .values({ userId })
      .returning();
    limitRow = created!;
  }

  const now = new Date();
  const lastReset = new Date(limitRow.lastResetAt);
  const isNewDay =
    now.toISOString().slice(0, 10) !== lastReset.toISOString().slice(0, 10);

  let dailySpent = Number(limitRow.dailySpentUsd);
  if (isNewDay) {
    dailySpent = 0;
    await db
      .update(walletTransferLimit)
      .set({ dailySpentUsd: '0.00', lastResetAt: now })
      .where(eq(walletTransferLimit.userId, userId));
  }

  // Check if elevated limit applies
  let effectiveLimit = Number(limitRow.dailyLimitUsd);
  if (
    limitRow.elevatedUntil &&
    new Date(limitRow.elevatedUntil) > now &&
    limitRow.elevatedLimitUsd
  ) {
    effectiveLimit = Number(limitRow.elevatedLimitUsd);
  }

  const allowed = dailySpent + transferUsdValue <= effectiveLimit;

  return { allowed, dailySpent, dailyLimit: effectiveLimit };
}

/**
 * Record daily spending after a transfer.
 */
async function recordDailySpending(
  userId: string,
  usdValue: number
): Promise<void> {
  const limitRow = await db
    .select()
    .from(walletTransferLimit)
    .where(eq(walletTransferLimit.userId, userId))
    .then((rows) => rows[0]);

  if (limitRow) {
    const newSpent = Number(limitRow.dailySpentUsd) + usdValue;
    await db
      .update(walletTransferLimit)
      .set({ dailySpentUsd: String(newSpent) })
      .where(eq(walletTransferLimit.userId, userId));
  }
}

// ─── Send Native ETH or ERC-20 Token ─────────────────────────────────────────

async function sendTokenActionImpl(input: {
  recipientAddress: string;
  amount: string; // human-readable (e.g. "1.5")
  decimals: number;
  tokenAddress?: string; // undefined = native ETH
  tokenSymbol?: string;
  userJwt?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const bundle = await requirePrivyTokenBundle(input.userJwt);

  // Token freshness check — require recently-issued JWT for mutations
  const freshness = requireFreshToken(bundle.primary);
  if (!freshness.fresh) {
    throw new Error(
      'Your session has expired. Please re-authenticate to send assets.'
    );
  }

  const ctx = await getAuthedUserContextFromPrivyTokenBundle(bundle);

  if (!ctx.walletAddress) {
    throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
  }

  // Validate recipient
  if (!isAddress(input.recipientAddress)) {
    throw new Error('Invalid recipient address');
  }
  const recipient = input.recipientAddress.toLowerCase() as Address;
  const senderAddress = ctx.walletAddress.toLowerCase() as Address;

  if (recipient === senderAddress) {
    throw new Error('Cannot send to your own address');
  }
  if (recipient === '0x0000000000000000000000000000000000000000') {
    throw new Error('Cannot send to the zero address');
  }

  // Parse amount
  const amountWei = parseUnits(input.amount, input.decimals);
  if (amountWei <= 0n) {
    throw new Error('Amount must be positive');
  }

  // Check daily limit (using $0 for now since USD pricing isn't implemented yet)
  const limitCheck = await checkDailyLimit(ctx.dbUserId, 0);
  if (!limitCheck.allowed) {
    throw new Error(
      `Daily transfer limit reached ($${limitCheck.dailyLimit}). Try again tomorrow.`
    );
  }

  // Create audit log entry (pending)
  const logId = await generateSnowflakeId();
  await db.insert(walletTransferLog).values({
    id: logId,
    userId: ctx.dbUserId,
    fromAddress: senderAddress,
    toAddress: recipient,
    tokenAddress: input.tokenAddress ?? null,
    amount: amountWei.toString(),
    chainId: CHAIN_ID,
    status: 'pending',
    type: input.tokenAddress ? 'erc20' : 'native',
  });

  let txHash: Hex;

  if (input.tokenAddress) {
    // ERC-20 transfer
    const tokenAddr = input.tokenAddress as Address;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, amountWei],
    });

    const result = await sendSponsoredEvmTransaction({
      walletId: ctx.privyWalletId,
      to: tokenAddr,
      data,
      valueWei: 0n,
      caip2: `eip155:${CHAIN.id}`,
      chainId: CHAIN.id,
    });
    txHash = result.hash;
  } else {
    // Native ETH transfer
    const result = await sendSponsoredEvmTransaction({
      walletId: ctx.privyWalletId,
      to: recipient,
      valueWei: amountWei,
      caip2: `eip155:${CHAIN.id}`,
      chainId: CHAIN.id,
    });
    txHash = result.hash;
  }

  // Update audit log with tx hash and confirmed status
  await db
    .update(walletTransferLog)
    .set({
      txHash,
      status: 'confirmed',
      confirmedAt: new Date(),
    })
    .where(eq(walletTransferLog.id, logId));

  // Record spending (using $0 since USD pricing not yet implemented)
  await recordDailySpending(ctx.dbUserId, 0);

  const explorerUrl = getTxExplorerUrl(txHash);

  logger.info(
    'Token transfer completed',
    {
      userId: ctx.dbUserId,
      from: senderAddress,
      to: recipient,
      token: input.tokenSymbol ?? 'ETH',
      amount: input.amount,
      txHash,
    },
    'sendTokenAction'
  );

  return { txHash, explorerUrl };
}

export const sendTokenAction = wrapServerActionWithSentry(
  'sendTokenAction',
  sendTokenActionImpl
);

// ─── Send NFT (ERC-721) ──────────────────────────────────────────────────────

async function sendNftActionImpl(input: {
  recipientAddress: string;
  contractAddress: string;
  tokenId: string;
  userJwt?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const bundle = await requirePrivyTokenBundle(input.userJwt);

  // Token freshness check — require recently-issued JWT for mutations
  const freshness = requireFreshToken(bundle.primary);
  if (!freshness.fresh) {
    throw new Error(
      'Your session has expired. Please re-authenticate to send NFTs.'
    );
  }

  const ctx = await getAuthedUserContextFromPrivyTokenBundle(bundle);

  if (!ctx.walletAddress) {
    throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
  }

  // Validate addresses
  if (!isAddress(input.recipientAddress)) {
    throw new Error('Invalid recipient address');
  }
  if (!isAddress(input.contractAddress)) {
    throw new Error('Invalid contract address');
  }

  const recipient = input.recipientAddress.toLowerCase() as Address;
  const senderAddress = ctx.walletAddress.toLowerCase() as Address;
  const contractAddr = input.contractAddress as Address;

  if (recipient === senderAddress) {
    throw new Error('Cannot send to your own address');
  }
  if (recipient === '0x0000000000000000000000000000000000000000') {
    throw new Error('Cannot send to the zero address');
  }

  const tokenIdBigint = BigInt(input.tokenId);

  // Encode safeTransferFrom(from, to, tokenId)
  const data = encodeFunctionData({
    abi: erc721Abi,
    functionName: 'safeTransferFrom',
    args: [senderAddress, recipient, tokenIdBigint],
  });

  // Create audit log entry (pending)
  const logId = await generateSnowflakeId();
  await db.insert(walletTransferLog).values({
    id: logId,
    userId: ctx.dbUserId,
    fromAddress: senderAddress,
    toAddress: recipient,
    tokenAddress: contractAddr,
    tokenId: input.tokenId,
    amount: '1',
    chainId: CHAIN_ID,
    status: 'pending',
    type: 'erc721',
  });

  const result = await sendSponsoredEvmTransaction({
    walletId: ctx.privyWalletId,
    to: contractAddr,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  const txHash = result.hash;

  // Update audit log
  await db
    .update(walletTransferLog)
    .set({
      txHash,
      status: 'confirmed',
      confirmedAt: new Date(),
    })
    .where(eq(walletTransferLog.id, logId));

  const explorerUrl = getTxExplorerUrl(txHash);

  logger.info(
    'NFT transfer completed',
    {
      userId: ctx.dbUserId,
      from: senderAddress,
      to: recipient,
      contract: contractAddr,
      tokenId: input.tokenId,
      txHash,
    },
    'sendNftAction'
  );

  return { txHash, explorerUrl };
}

export const sendNftAction = wrapServerActionWithSentry(
  'sendNftAction',
  sendNftActionImpl
);

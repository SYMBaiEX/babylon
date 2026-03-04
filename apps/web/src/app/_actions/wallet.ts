'use server';

import {
  checkRateLimitAsync,
  getAuthedUserContextFromPrivyTokenBundle,
  getCache,
  getClientIp,
  RATE_LIMIT_CONFIGS,
  requireFreshToken,
  sendSponsoredEvmTransaction,
  setCache,
} from '@babylon/api';
import {
  and,
  db,
  eq,
  nftOwnership,
  walletTransferLimit,
  walletTransferLog,
} from '@babylon/db';
import {
  CHAIN,
  CHAIN_ID,
  ERC20_ABI,
  ERC721_TRANSFER_ABI,
  generateSnowflakeId,
  getTokenListForChain,
  getTxExplorerUrl,
  logger,
  WALLET_ERROR_MESSAGES,
} from '@babylon/shared';
import { headers } from 'next/headers';
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

// Stablecoin symbols that are pegged 1:1 to USD — no oracle needed.
const STABLECOIN_SYMBOLS = new Set([
  'USDC',
  'USDT',
  'DAI',
  'FRAX',
  'LUSD',
  'PYUSD',
]);

// Conservative fallback price used when the price oracle is unavailable.
// Errs on the side of over-counting so limits are never bypassed silently.
const FALLBACK_ETH_PRICE_USD = 5_000;

/**
 * Fetch a token's current USD price, caching in Redis for 5 minutes.
 * Uses CoinGecko's free simple-price endpoint (no API key required).
 * Falls back to a conservative estimate when the request fails.
 */
async function fetchTokenUsdPrice(coingeckoId: string): Promise<number> {
  const cacheKey = `price:${coingeckoId}`;
  const cached = await getCache<number>(cacheKey, { namespace: 'prices' });
  if (cached !== null && cached > 0) return cached;

  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(3_000) }
    );
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, { usd?: number }>;
      const price = data[coingeckoId]?.usd;
      if (price && price > 0) {
        void setCache(cacheKey, price, { namespace: 'prices', ttl: 300 });
        return price;
      }
    }
  } catch {
    // Network error or timeout — fall through to fallback
  }

  logger.warn(
    'CoinGecko price fetch failed, using fallback',
    { coingeckoId },
    'wallet/pricing'
  );
  return coingeckoId === 'ethereum'
    ? FALLBACK_ETH_PRICE_USD
    : FALLBACK_ETH_PRICE_USD;
}

/**
 * Compute the approximate USD value of a token transfer.
 * Stablecoins are resolved exactly (1:1). Other tokens use CoinGecko prices
 * with a Redis-backed 5-minute cache.
 */
async function getTransferUsdValue(
  amountWei: bigint,
  decimals: number,
  tokenAddress?: string
): Promise<number> {
  const amount = Number(amountWei) / 10 ** decimals;

  if (!tokenAddress) {
    // Native ETH
    const price = await fetchTokenUsdPrice('ethereum');
    return amount * price;
  }

  const token = getTokenListForChain(CHAIN_ID).find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );

  if (!token) return amount * FALLBACK_ETH_PRICE_USD;
  if (STABLECOIN_SYMBOLS.has(token.symbol)) return amount; // 1:1 USD
  if (token.coingeckoId) {
    const price = await fetchTokenUsdPrice(token.coingeckoId);
    return amount * price;
  }
  return amount * FALLBACK_ETH_PRICE_USD;
}

/**
 * Atomically check and reserve daily spending capacity for a user.
 * Uses SELECT FOR UPDATE inside a transaction to prevent race conditions
 * when concurrent transfers would otherwise bypass the limit.
 */
async function checkAndReserveDailyLimit(
  userId: string,
  transferUsdValue: number
): Promise<{ allowed: boolean; dailySpent: number; dailyLimit: number }> {
  return await db.transaction(async (tx) => {
    // Upsert so the row always exists before we lock it
    await tx
      .insert(walletTransferLimit)
      .values({ userId })
      .onConflictDoNothing();

    const [row] = await tx
      .select()
      .from(walletTransferLimit)
      .where(eq(walletTransferLimit.userId, userId))
      .for('update');

    if (!row) throw new Error('Failed to initialize limit record');

    const now = new Date();
    const isNewDay =
      now.toISOString().slice(0, 10) !==
      new Date(row.lastResetAt).toISOString().slice(0, 10);

    const dailySpent = isNewDay ? 0 : Number(row.dailySpentUsd);

    const effectiveLimit =
      row.elevatedUntil &&
      new Date(row.elevatedUntil) > now &&
      row.elevatedLimitUsd
        ? Number(row.elevatedLimitUsd)
        : Number(row.dailyLimitUsd);

    const newSpent = dailySpent + transferUsdValue;
    if (newSpent > effectiveLimit) {
      return { allowed: false, dailySpent, dailyLimit: effectiveLimit };
    }

    await tx
      .update(walletTransferLimit)
      .set({
        dailySpentUsd: newSpent.toFixed(2),
        ...(isNewDay ? { lastResetAt: now } : {}),
      })
      .where(eq(walletTransferLimit.userId, userId));

    return { allowed: true, dailySpent: newSpent, dailyLimit: effectiveLimit };
  });
}

// ─── Send Native ETH or ERC-20 Token ─────────────────────────────────────────

async function sendTokenActionImpl(input: {
  recipientAddress: string;
  amount: string; // human-readable (e.g. "1.5")
  tokenAddress?: string; // undefined = native ETH
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

  const rateLimit = await checkRateLimitAsync(
    ctx.dbUserId,
    RATE_LIMIT_CONFIGS.WALLET_TRANSFER
  );
  if (!rateLimit.allowed) {
    const retryAfterSeconds = rateLimit.retryAfter || 60;
    throw new Error(
      `Too many transfers. Please try again in ${retryAfterSeconds} seconds.`
    );
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

  const tokenAddressNormalized = input.tokenAddress
    ? input.tokenAddress.toLowerCase()
    : undefined;

  const tokenConfig = tokenAddressNormalized
    ? getTokenListForChain(CHAIN_ID).find(
        (t) => t.address.toLowerCase() === tokenAddressNormalized
      )
    : null;

  if (tokenAddressNormalized) {
    if (!isAddress(tokenAddressNormalized)) {
      throw new Error('Invalid token address');
    }
    if (!tokenConfig) {
      throw new Error('Unsupported token');
    }
  }

  const decimals = tokenConfig?.decimals ?? CHAIN.nativeCurrency.decimals;
  const tokenSymbol = tokenConfig?.symbol ?? CHAIN.nativeCurrency.symbol;

  // Parse amount using server-side decimals (never trust client-provided decimals)
  const amountWei = parseUnits(input.amount, decimals);
  if (amountWei <= 0n) {
    throw new Error('Amount must be positive');
  }

  // Compute USD value and atomically check + reserve daily limit
  const usdValue = await getTransferUsdValue(
    amountWei,
    decimals,
    tokenAddressNormalized
  );
  const limitResult = await checkAndReserveDailyLimit(ctx.dbUserId, usdValue);
  if (!limitResult.allowed) {
    throw new Error(
      `Daily transfer limit of $${limitResult.dailyLimit.toFixed(0)} reached. Try again tomorrow.`
    );
  }

  // Capture IP for audit log
  const reqHeaders = await headers();
  const ipAddress = getClientIp(reqHeaders) ?? null;

  // Create audit log entry (pending)
  const logId = await generateSnowflakeId();
  await db.insert(walletTransferLog).values({
    id: logId,
    userId: ctx.dbUserId,
    fromAddress: senderAddress,
    toAddress: recipient,
    tokenAddress: tokenAddressNormalized ?? null,
    amount: amountWei.toString(),
    chainId: CHAIN_ID,
    status: 'pending',
    type: tokenAddressNormalized ? 'erc20' : 'native',
    usdValueAtTime: usdValue.toFixed(2),
    ipAddress,
  });

  let txHash: Hex;

  try {
    if (tokenAddressNormalized) {
      // ERC-20 transfer
      const tokenAddr = tokenAddressNormalized as Address;
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
  } catch (error) {
    await db
      .update(walletTransferLog)
      .set({ status: 'failed' })
      .where(eq(walletTransferLog.id, logId));
    throw error;
  }

  // Update log with submitted tx hash. Status stays 'pending' until confirmed on-chain.
  // confirmedAt is set by a future webhook/polling job when the tx is mined.
  await db
    .update(walletTransferLog)
    .set({ txHash })
    .where(eq(walletTransferLog.id, logId));

  const explorerUrl = getTxExplorerUrl(txHash);

  logger.info(
    'Token transfer submitted',
    {
      userId: ctx.dbUserId,
      from: senderAddress,
      to: recipient,
      token: tokenSymbol,
      amount: input.amount,
      usdValue: usdValue.toFixed(2),
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

  const rateLimit = await checkRateLimitAsync(
    ctx.dbUserId,
    RATE_LIMIT_CONFIGS.WALLET_TRANSFER
  );
  if (!rateLimit.allowed) {
    const retryAfterSeconds = rateLimit.retryAfter || 60;
    throw new Error(
      `Too many transfers. Please try again in ${retryAfterSeconds} seconds.`
    );
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
  const contractAddr = input.contractAddress.toLowerCase() as Address;

  if (recipient === senderAddress) {
    throw new Error('Cannot send to your own address');
  }
  if (recipient === '0x0000000000000000000000000000000000000000') {
    throw new Error('Cannot send to the zero address');
  }

  // Best-effort ownership check against our DB index before submitting.
  //
  // Design decision: this is NOT a security gate — it is a UX guard that
  // saves the user a rate-limit slot and a failed-log entry when the
  // transfer is obviously invalid. True ownership enforcement happens on-chain:
  // the EVM will revert `safeTransferFrom` if the caller doesn't own the token,
  // regardless of what our DB says.
  //
  // The race condition (NFT transferred away between this check and on-chain
  // execution) is intentionally accepted: the window is sub-second, the
  // blockchain is the authoritative source, and the on-chain revert is the
  // safety net. The resulting 'failed' log entry is correct audit behavior.
  const tokenIdNum = Number(input.tokenId);
  const owned = await db
    .select({ tokenId: nftOwnership.tokenId })
    .from(nftOwnership)
    .where(
      and(
        eq(nftOwnership.tokenId, tokenIdNum),
        eq(nftOwnership.ownerAddress, senderAddress)
      )
    )
    .limit(1);

  if (!owned.length) {
    throw new Error('You do not own this NFT');
  }

  const tokenIdBigint = BigInt(input.tokenId);

  // Encode safeTransferFrom(from, to, tokenId)
  const data = encodeFunctionData({
    abi: erc721Abi,
    functionName: 'safeTransferFrom',
    args: [senderAddress, recipient, tokenIdBigint],
  });

  // Capture IP for audit log
  const reqHeaders = await headers();
  const ipAddress = getClientIp(reqHeaders) ?? null;

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
    ipAddress,
  });

  let txHash: Hex;
  try {
    const result = await sendSponsoredEvmTransaction({
      walletId: ctx.privyWalletId,
      to: contractAddr,
      data,
      valueWei: 0n,
      caip2: `eip155:${CHAIN.id}`,
      chainId: CHAIN.id,
    });

    txHash = result.hash;
  } catch (error) {
    await db
      .update(walletTransferLog)
      .set({ status: 'failed' })
      .where(eq(walletTransferLog.id, logId));
    throw error;
  }

  // Update log with submitted tx hash. Status stays 'pending' until confirmed on-chain.
  await db
    .update(walletTransferLog)
    .set({ txHash })
    .where(eq(walletTransferLog.id, logId));

  const explorerUrl = getTxExplorerUrl(txHash);

  logger.info(
    'NFT transfer submitted',
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

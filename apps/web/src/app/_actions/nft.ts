'use server';

import { getAuthedUserContextFromPrivyTokenBundle } from '@babylon/api';
import {
  type ConfirmResult,
  confirmMint,
  prepareMint,
} from '@babylon/api/services/nft-mint-service';
import { logger, ValidationError } from '@babylon/shared';
import type { Address, Hex } from 'viem';

import { requirePrivyTokenBundle } from './utils';

// ============================================================================
// Types
// ============================================================================

type MintStep =
  | 'auth'
  | 'user_context'
  | 'prepare'
  | 'send_transaction'
  | 'confirm';

/**
 * Result of the prepare-mint server action.
 * Returns transaction data that the client submits via its embedded wallet.
 */
export type PrepareMintActionResult =
  | {
      status: 'prepared';
      /** Contract address to call */
      to: Address;
      /** ABI-encoded mint(…) calldata */
      data: Hex;
      /** Numeric chain ID the tx should target */
      chainId: number;
      /** Wallet address the NFT will be minted to */
      mintTo: Address;
    }
  | { status: 'error'; error: string; step: MintStep; errorId: string };

/**
 * Result of the confirm-mint server action.
 */
export type ConfirmMintActionResult =
  | ({ status: 'confirmed'; txHash: Hex } & ConfirmResult)
  | { status: 'pending'; txHash: Hex; message: string }
  | { status: 'error'; error: string; step: MintStep; errorId: string };

// ============================================================================
// Helpers
// ============================================================================

function redactJwtLikeTokens(text: string): string {
  const jwtLike =
    /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})(?![A-Za-z0-9_-])/g;
  return text.replace(jwtLike, '[REDACTED_JWT]');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}

function toSafeLogError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactJwtLikeTokens(error.message),
      stack: error.stack ? redactJwtLikeTokens(error.stack) : undefined,
    };
  }
  return { message: redactJwtLikeTokens(errorMessage(error)) };
}

function backoffSleep(
  attempt: number,
  baseMs = 1000,
  maxMs = 5000
): Promise<void> {
  const exponentialDelay = Math.min(baseMs * 2 ** attempt, maxMs);
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  const finalDelay = Math.round(exponentialDelay + jitter);
  return new Promise((resolve) => setTimeout(resolve, finalDelay));
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Step 1: Prepare the mint transaction (server-side).
 *
 * Authenticates the user, checks eligibility, generates the contract signature,
 * and returns the encoded transaction data for the client to submit via its
 * embedded wallet.
 *
 * This avoids the server needing to send transactions on behalf of the user,
 * which fails for TEE wallets without signers configured in the Privy dashboard.
 */
export async function prepareMintAction(input?: {
  userJwt?: string;
}): Promise<PrepareMintActionResult> {
  // Auth
  let privyToken: string;
  let fallbackPrivyToken: string | undefined;
  try {
    const bundle = await requirePrivyTokenBundle(input?.userJwt);
    privyToken = bundle.primary;
    fallbackPrivyToken = bundle.fallback;
  } catch (e) {
    const step: MintStep = 'auth';
    const errorId = crypto.randomUUID();
    logger.warn(
      'NFT mint auth failed',
      { errorId, step, error: toSafeLogError(e) },
      'prepareMintAction'
    );
    return { status: 'error', error: errorMessage(e), step, errorId };
  }

  // User context
  let ctx: Awaited<ReturnType<typeof getAuthedUserContextFromPrivyTokenBundle>>;
  try {
    ctx = await getAuthedUserContextFromPrivyTokenBundle({
      primary: privyToken,
      fallback: fallbackPrivyToken,
    });
  } catch (e) {
    const step: MintStep = 'user_context';
    const errorId = crypto.randomUUID();
    logger.warn(
      'NFT mint user context failed',
      { errorId, step, error: toSafeLogError(e) },
      'prepareMintAction'
    );
    return { status: 'error', error: errorMessage(e), step, errorId };
  }

  // Prepare mint (eligibility check + signature generation)
  try {
    const prepare = await prepareMint(ctx.dbUserId);
    return {
      status: 'prepared',
      to: prepare.contractAddress as Address,
      data: prepare.encodedData,
      chainId: prepare.chainId,
      mintTo: prepare.to as Address,
    };
  } catch (e) {
    const step: MintStep = 'prepare';
    const errorId = crypto.randomUUID();
    logger.error(
      'NFT mint prepare failed',
      { errorId, step, userId: ctx.dbUserId, error: toSafeLogError(e) },
      'prepareMintAction'
    );
    return { status: 'error', error: errorMessage(e), step, errorId };
  }
}

/**
 * Step 2: Confirm the mint after the client has submitted the transaction.
 *
 * Polls the chain for the receipt, extracts the minted token ID,
 * and updates the database with ownership records.
 */
export async function confirmMintAction(input: {
  userJwt?: string;
  txHash: Hex;
}): Promise<ConfirmMintActionResult> {
  // Auth
  let privyToken: string;
  let fallbackPrivyToken: string | undefined;
  try {
    const bundle = await requirePrivyTokenBundle(input.userJwt);
    privyToken = bundle.primary;
    fallbackPrivyToken = bundle.fallback;
  } catch (e) {
    const step: MintStep = 'auth';
    const errorId = crypto.randomUUID();
    return { status: 'error', error: errorMessage(e), step, errorId };
  }

  // User context
  let ctx: Awaited<ReturnType<typeof getAuthedUserContextFromPrivyTokenBundle>>;
  try {
    ctx = await getAuthedUserContextFromPrivyTokenBundle({
      primary: privyToken,
      fallback: fallbackPrivyToken,
    });
  } catch (e) {
    const step: MintStep = 'user_context';
    const errorId = crypto.randomUUID();
    return { status: 'error', error: errorMessage(e), step, errorId };
  }

  if (!ctx.walletAddress) {
    return {
      status: 'error',
      error: 'Wallet address not found for user',
      step: 'user_context',
      errorId: crypto.randomUUID(),
    };
  }

  // Poll for confirmation
  const maxAttempts = 14;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const confirmed = await confirmMint(
        ctx.dbUserId,
        input.txHash,
        ctx.walletAddress as Address
      );
      return { status: 'confirmed', txHash: input.txHash, ...confirmed };
    } catch (error) {
      if (
        error instanceof ValidationError &&
        error.message.startsWith('Transaction not found:')
      ) {
        await backoffSleep(attempt);
        continue;
      }
      const step: MintStep = 'confirm';
      const errorId = crypto.randomUUID();
      logger.error(
        'NFT mint confirm failed',
        {
          errorId,
          step,
          userId: ctx.dbUserId,
          txHash: input.txHash,
          error: toSafeLogError(error),
        },
        'confirmMintAction'
      );
      return { status: 'error', error: errorMessage(error), step, errorId };
    }
  }

  logger.warn(
    'NFT mint transaction pending after timeout',
    { txHash: input.txHash, userId: ctx.dbUserId, attempts: maxAttempts },
    'confirmMintAction'
  );

  return {
    status: 'pending',
    txHash: input.txHash,
    message:
      'Transaction submitted but confirmation is taking longer than expected. ' +
      'Your NFT should appear shortly. You can track the transaction on a block explorer.',
  };
}

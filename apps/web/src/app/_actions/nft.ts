'use server';

import {
  getAuthedUserContextFromPrivyTokenBundle,
  sendSponsoredEvmTransaction,
} from '@babylon/api';
import {
  type ConfirmResult,
  confirmMint,
  prepareMint,
} from '@babylon/api/services/nft-mint-service';
import { logger, ValidationError } from '@babylon/shared';
import type { Address, Hex } from 'viem';

import { requirePrivyTokenBundle } from './utils';

type MintStep =
  | 'auth'
  | 'user_context'
  | 'prepare'
  | 'send_transaction'
  | 'confirm';

function redactJwtLikeTokens(text: string): string {
  // Redact JWT-like strings (base64url.base64url.base64url).
  // This avoids accidentally logging auth tokens if they show up in an error message/stack.
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

function toUserSafeMintError(step: MintStep, error: unknown): string {
  const msg = errorMessage(error).toLowerCase();

  // Wallet + auth errors: keep messaging user-friendly (no internal details).
  const isAuthy =
    msg.includes('invalid jwt token provided') ||
    msg.includes('expired') ||
    msg.includes('missing privy token') ||
    msg.includes('authentication required');
  if (isAuthy || step === 'auth' || step === 'user_context') {
    return 'Your session has expired. Please sign in again and try minting.';
  }

  if (msg.includes('embedded wallet not ready')) {
    return 'Your wallet is still initializing. Please wait a few seconds and try again.';
  }

  if (step === 'prepare') {
    return 'Mint is temporarily unavailable. Please try again shortly.';
  }

  if (step === 'send_transaction') {
    return 'We could not submit the transaction. Please try again.';
  }

  if (step === 'confirm') {
    return 'Transaction submitted, but confirmation is taking longer than expected. Please check again shortly.';
  }

  return 'Mint failed. Please try again.';
}

/**
 * Result of the NFT mint action.
 * - `status: 'confirmed'`: Transaction confirmed and NFT data available
 * - `status: 'pending'`: Transaction submitted but not yet confirmed (user can check later)
 * - `status: 'error'`: An error occurred — message is safe to show in UI
 */
export type MintNftActionResult =
  | ({ status: 'confirmed'; txHash: Hex } & ConfirmResult)
  | { status: 'pending'; txHash: Hex; message: string }
  | { status: 'error'; error: string; step: MintStep; errorId: string };

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
      'mintNftAction'
    );
    return {
      status: 'error',
      error: toUserSafeMintError(step, e),
      step,
      errorId,
    };
  }

  // Step 2: User context
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
      'mintNftAction'
    );
    return {
      status: 'error',
      error: toUserSafeMintError(step, e),
      step,
      errorId,
    };
  }

  // Step 3: Prepare mint
  let prepare: Awaited<ReturnType<typeof prepareMint>>;
  try {
    prepare = await prepareMint(ctx.dbUserId);
  } catch (e) {
    const step: MintStep = 'prepare';
    const errorId = crypto.randomUUID();
    logger.error(
      'NFT mint prepare failed',
      { errorId, step, userId: ctx.dbUserId, error: toSafeLogError(e) },
      'mintNftAction'
    );
    return {
      status: 'error',
      error: toUserSafeMintError(step, e),
      step,
      errorId,
    };
  }

  // Step 4: Send transaction via Privy
  let hash: Hex;
  try {
    const result = await sendSponsoredEvmTransaction({
      userJwt: privyToken,
      userJwtFallbacks: fallbackPrivyToken ? [fallbackPrivyToken] : [],
      expectedPrivyUserId: ctx.privyId,
      walletId: ctx.privyWalletId,
      to: prepare.contractAddress as Address,
      data: prepare.encodedData,
      valueWei: 0n,
      caip2: `eip155:${prepare.chainId}`,
      chainId: prepare.chainId,
    });
    hash = result.hash;
  } catch (e) {
    const step: MintStep = 'send_transaction';
    const errorId = crypto.randomUUID();
    logger.error(
      'NFT mint send transaction failed',
      {
        errorId,
        step,
        userId: ctx.dbUserId,
        privyId: ctx.privyId,
        walletId: ctx.privyWalletId,
        error: toSafeLogError(e),
      },
      'mintNftAction'
    );
    return {
      status: 'error',
      error: toUserSafeMintError(step, e),
      step,
      errorId,
    };
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
      const step: MintStep = 'confirm';
      const errorId = crypto.randomUUID();
      logger.error(
        'NFT mint confirm failed',
        {
          errorId,
          step,
          userId: ctx.dbUserId,
          txHash: hash,
          error: toSafeLogError(error),
        },
        'mintNftAction'
      );
      return {
        status: 'error',
        error: toUserSafeMintError(step, error),
        step,
        errorId,
      };
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

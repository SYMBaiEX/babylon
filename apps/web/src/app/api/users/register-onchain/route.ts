/**
 * Opt-In On-Chain Registration API
 *
 * @route POST /api/users/register-onchain
 * @access Authenticated
 *
 * Registers a user on-chain via Agent0 SDK (ERC-8004 on Ethereum mainnet).
 * Costs POINTS.ONCHAIN_REGISTRATION (100) points from the user's virtual balance.
 * Points are refunded if registration fails.
 */

import {
  applyRateLimit,
  authenticate,
  BusinessLogicError,
  ensureOfflineWalletReady,
  processOnchainRegistration,
  RATE_LIMIT_CONFIGS,
  rateLimitError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { and, balanceTransactions, db, eq, sql, users } from '@babylon/db';
import { generateSnowflakeId, logger, POINTS } from '@babylon/shared';
import type { NextRequest } from 'next/server';

interface RegisterOnchainRequestBody {
  referralCode?: string | null;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const privyId = authUser.privyId ?? authUser.userId;
  const canonicalUserId = authUser.dbUserId ?? authUser.userId;

  const rl = applyRateLimit(
    canonicalUserId,
    RATE_LIMIT_CONFIGS.ONCHAIN_REGISTRATION
  );
  if (!rl.allowed) return rateLimitError(rl.retryAfter);

  const body = (await request
    .json()
    .catch(() => ({}))) as RegisterOnchainRequestBody;
  const referralCode =
    typeof body.referralCode === 'string'
      ? body.referralCode.trim() || null
      : null;

  const [dbUser] = await db
    .select({
      id: users.id,
      privyId: users.privyId,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      coverImageUrl: users.coverImageUrl,
      privyWalletId: users.privyWalletId,
      walletAddress: users.walletAddress,
      onChainRegistered: users.onChainRegistered,
      agent0TokenId: users.agent0TokenId,
      virtualBalance: users.virtualBalance,
      profileComplete: users.profileComplete,
    })
    .from(users)
    .where(eq(users.id, canonicalUserId))
    .limit(1);

  if (!dbUser) {
    throw new BusinessLogicError(
      'User not found. Complete signup first.',
      'USER_NOT_FOUND'
    );
  }

  if (!dbUser.profileComplete) {
    throw new BusinessLogicError(
      'Complete your profile before registering on-chain.',
      'PROFILE_INCOMPLETE'
    );
  }

  if (dbUser.onChainRegistered && dbUser.agent0TokenId) {
    return successResponse(
      {
        message: 'Already registered on-chain',
        alreadyRegistered: true,
        agent0TokenId: dbUser.agent0TokenId,
      },
      200
    );
  }

  const cost = POINTS.ONCHAIN_REGISTRATION;

  const agent0Configured =
    process.env.AGENT0_RPC_URL &&
    process.env.AGENT0_PRIVATE_KEY &&
    process.env.PINATA_JWT &&
    process.env.BABYLON_GAME_WALLET_ADDRESS;

  if (!agent0Configured) {
    throw new BusinessLogicError(
      'On-chain registration is currently unavailable. Please try again later.',
      'REGISTRATION_UNAVAILABLE'
    );
  }

  // Atomic balance check + deduct: single UPDATE with WHERE guard prevents double-spend
  const [deducted] = await db
    .update(users)
    .set({
      virtualBalance: sql`(${users.virtualBalance})::numeric - ${cost}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, canonicalUserId),
        sql`(${users.virtualBalance})::numeric >= ${cost}`
      )
    )
    .returning({ virtualBalance: users.virtualBalance });

  if (!deducted) {
    const currentBalance = Number(dbUser.virtualBalance ?? '0');
    throw new BusinessLogicError(
      `Insufficient balance. On-chain registration costs ${cost} points. You have ${Math.floor(currentBalance)} points.`,
      'INSUFFICIENT_BALANCE'
    );
  }

  const balanceAfterDeduct = Number(deducted.virtualBalance);
  const balanceBeforeDeduct = balanceAfterDeduct + cost;

  const deductionId = await generateSnowflakeId();
  await db.insert(balanceTransactions).values({
    id: deductionId,
    userId: canonicalUserId,
    type: 'withdrawal',
    amount: String(cost),
    balanceBefore: String(balanceBeforeDeduct),
    balanceAfter: String(balanceAfterDeduct),
    description: 'On-chain ERC-8004 registration',
    createdAt: new Date(),
  });

  logger.info(
    'Deducted registration cost',
    { userId: canonicalUserId, cost, balanceBefore: balanceBeforeDeduct },
    'POST /api/users/register-onchain'
  );

  try {
    const offlineWallet = await ensureOfflineWalletReady({
      privyId: dbUser.privyId ?? privyId,
    });
    const walletAddress = offlineWallet.walletAddress.toLowerCase();

    if (
      dbUser.privyWalletId !== offlineWallet.privyWalletId ||
      dbUser.walletAddress?.toLowerCase() !== walletAddress
    ) {
      await db
        .update(users)
        .set({
          privyWalletId: offlineWallet.privyWalletId,
          walletAddress,
          offlineWalletReady: true,
          offlineWalletReadyAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, canonicalUserId));
    }

    const onchainResult = await processOnchainRegistration({
      user: authUser,
      walletAddress,
      username: dbUser.username,
      displayName: dbUser.displayName,
      bio: dbUser.bio ?? undefined,
      profileImageUrl: dbUser.profileImageUrl ?? undefined,
      coverImageUrl: dbUser.coverImageUrl ?? undefined,
      referralCode,
    });

    const [refreshedUser] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        walletAddress: users.walletAddress,
        onChainRegistered: users.onChainRegistered,
        agent0TokenId: users.agent0TokenId,
        virtualBalance: users.virtualBalance,
        reputationPoints: users.reputationPoints,
      })
      .from(users)
      .where(eq(users.id, canonicalUserId))
      .limit(1);

    logger.info(
      'User completed opt-in on-chain registration',
      {
        userId: canonicalUserId,
        agent0TokenId: onchainResult.tokenId,
        cost,
      },
      'POST /api/users/register-onchain'
    );

    return successResponse(
      {
        onchain: onchainResult,
        user: refreshedUser ?? null,
        cost,
      },
      200
    );
  } catch (registrationError) {
    // Refund points on failure using atomic update + RETURNING for accurate audit
    const [refunded] = await db
      .update(users)
      .set({
        virtualBalance: sql`(${users.virtualBalance})::numeric + ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, canonicalUserId))
      .returning({ virtualBalance: users.virtualBalance });

    const refundBalanceAfter = Number(refunded?.virtualBalance ?? '0');
    const refundBalanceBefore = refundBalanceAfter - cost;

    const refundId = await generateSnowflakeId();
    await db.insert(balanceTransactions).values({
      id: refundId,
      userId: canonicalUserId,
      type: 'deposit',
      amount: String(cost),
      balanceBefore: String(refundBalanceBefore),
      balanceAfter: String(refundBalanceAfter),
      description: 'Refund - on-chain registration failed',
      createdAt: new Date(),
    });

    logger.warn(
      'Refunded registration cost after failure',
      {
        userId: canonicalUserId,
        cost,
        error:
          registrationError instanceof Error
            ? registrationError.message
            : String(registrationError),
      },
      'POST /api/users/register-onchain'
    );

    throw registrationError;
  }
});

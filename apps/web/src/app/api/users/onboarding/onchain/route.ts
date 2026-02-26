/**
 * User On-Chain Onboarding API
 *
 * @route POST /api/users/onboarding/onchain - Register user on-chain
 * @access Authenticated
 *
 * @description
 * Triggers on-chain registration for a user. Registers user to EIP-8004
 * Identity Registry on Base Sepolia. Supports referral codes.
 *
 * @openapi
 * /api/users/onboarding/onchain:
 *   post:
 *     tags:
 *       - Users
 *     summary: Register user on-chain
 *     description: Registers user to EIP-8004 Identity Registry (authenticated user only)
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               referralCode:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Registration completed successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Already registered
 *
 * @example
 * ```typescript
 * await fetch('/api/users/onboarding/onchain', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     referralCode: 'REF123'
 *   })
 * });
 * ```
 */

import type { JsonValue } from '@babylon/api';
import {
  authenticate,
  BusinessLogicError,
  ConflictError,
  ensureOfflineWalletReady,
  processOnchainRegistration,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

interface OnchainRequestBody {
  referralCode?: string | null;
}

/**
 * @deprecated This endpoint is deprecated. Use POST /api/users/register-onchain instead.
 * On-chain registration is now opt-in and costs POINTS.ONCHAIN_REGISTRATION points.
 */
export const POST = withErrorHandling(async (_request: NextRequest) => {
  throw new BusinessLogicError(
    'This endpoint is deprecated. Use POST /api/users/register-onchain for on-chain registration.',
    'DEPRECATED'
  );

  // Original implementation kept below for reference — unreachable code.
  const authUser = await authenticate(_request);
  const privyId = authUser.privyId ?? authUser.userId;
  const body = (await request.json()) as
    | OnchainRequestBody
    | Record<string, JsonValue>;

  const referralCode =
    typeof (body as OnchainRequestBody).referralCode === 'string'
      ? (body as OnchainRequestBody).referralCode?.trim() || null
      : null;

  const canonicalUserId = authUser.dbUserId ?? authUser.userId;

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
      offlineWalletReady: users.offlineWalletReady,
      walletAddress: users.walletAddress,
      onChainRegistered: users.onChainRegistered,
      nftTokenId: users.nftTokenId,
      referredBy: users.referredBy,
    })
    .from(users)
    .where(eq(users.id, canonicalUserId))
    .limit(1);

  if (!dbUser) {
    throw new ConflictError(
      'User record not found. Complete signup before on-chain registration.',
      'User'
    );
  }

  if (!dbUser.username || !dbUser.displayName) {
    throw new BusinessLogicError(
      'User profile incomplete. Finish signup before on-chain registration.',
      'PROFILE_INCOMPLETE'
    );
  }

  const offlineWallet = await ensureOfflineWalletReady({
    privyId: dbUser.privyId ?? privyId,
  });
  const walletAddress = offlineWallet.walletAddress.toLowerCase();

  if (
    dbUser.privyWalletId !== offlineWallet.privyWalletId ||
    dbUser.walletAddress?.toLowerCase() !== walletAddress ||
    !dbUser.offlineWalletReady
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
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      coverImageUrl: users.coverImageUrl,
      walletAddress: users.walletAddress,
      onChainRegistered: users.onChainRegistered,
      nftTokenId: users.nftTokenId,
      reputationPoints: users.reputationPoints,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, canonicalUserId))
    .limit(1);

  logger.info(
    'User completed on-chain onboarding',
    {
      userId: canonicalUserId,
      alreadyRegistered: onchainResult.alreadyRegistered,
      tokenId: onchainResult.tokenId,
    },
    'POST /api/users/onboarding/onchain'
  );

  return successResponse(
    {
      onchain: onchainResult,
      user: refreshedUser
        ? {
            ...refreshedUser,
            updatedAt: refreshedUser.updatedAt.toISOString(),
          }
        : null,
    },
    200
  );
});

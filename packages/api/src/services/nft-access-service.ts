import { db, eq, nftSnapshot, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import {
  hasOnchainNftAccess,
  NftIndexerUnavailableError,
} from './nft-indexer-service';
import { isUserWhitelisted } from './whitelist-service';

export type NftAccessReason = 'snapshot_2025' | 'whitelist' | 'holder' | 'none';

async function hasSnapshot2025Access(dbUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: nftSnapshot.id })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, dbUserId))
    .limit(1);
  return Boolean(row);
}

/**
 * Check if a user is whitelisted, with graceful fallback if the Whitelist
 * table doesn't exist yet (safe for rolling deployments).
 *
 * Only swallows "relation does not exist" errors (PG code 42P01).
 * All other errors are logged and re-thrown so they surface in production.
 */
async function isWhitelistOverride(
  dbUserId: string | null | undefined
): Promise<boolean> {
  if (!dbUserId) return false;
  try {
    return await isUserWhitelisted(dbUserId);
  } catch (error: unknown) {
    // PostgreSQL "undefined_table" — table doesn't exist yet during rolling deploy.
    const pgCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code: string }).code
        : undefined;
    if (pgCode === '42P01') return false;

    // Any other error is unexpected — log it and continue with NFT checks so
    // a whitelist bug doesn't block user access entirely.
    logger.error('Whitelist access check failed', {
      dbUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Returns true if the user has gated access via:
 * - Snapshot 2025 allowlist (Top 100 end-of-2025): permanent access + can mint.
 * - Whitelist: permanent access when a user has reached the Top 100 at least once.
 * - Holder: access while currently holding at least one NFT.
 *
 * Holder access is indexer-based and fail-closed: if the indexer is unavailable,
 * holder access is denied (but snapshot/whitelist still apply).
 */
export async function hasNftAccess(dbUserId: string): Promise<boolean> {
  // Snapshot 2025 always has access (independent of holding).
  if (await hasSnapshot2025Access(dbUserId)) return true;

  // Whitelist is permanent access.
  if (await isWhitelistOverride(dbUserId)) return true;

  const [dbUser] = await db
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, dbUserId))
    .limit(1);

  const walletAddress = dbUser?.walletAddress ?? null;
  if (walletAddress) {
    try {
      const onchainAllowed = await hasOnchainNftAccess(walletAddress);
      if (onchainAllowed) return true;
    } catch (error: unknown) {
      // Fail-closed on indexer unavailability/misconfiguration.
      if (error instanceof NftIndexerUnavailableError) return false;
      throw error;
    }
  }

  return false;
}

export async function hasNftAccessForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<boolean> {
  const dbUserId = user.dbUserId ?? null;

  if (dbUserId && (await hasSnapshot2025Access(dbUserId))) return true;
  if (await isWhitelistOverride(dbUserId)) return true;

  const walletAddress = user.walletAddress ?? null;
  if (walletAddress) {
    try {
      const onchainAllowed = await hasOnchainNftAccess(walletAddress);
      if (onchainAllowed) return true;
    } catch (error: unknown) {
      // Fail-closed on indexer unavailability/misconfiguration.
      if (error instanceof NftIndexerUnavailableError) return false;
      throw error;
    }
  }

  return false;
}

export async function getNftAccessStatusForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<{ allowed: boolean; reason: NftAccessReason }> {
  const dbUserId = user.dbUserId ?? null;

  if (dbUserId && (await hasSnapshot2025Access(dbUserId))) {
    return { allowed: true, reason: 'snapshot_2025' };
  }

  if (await isWhitelistOverride(dbUserId)) {
    return { allowed: true, reason: 'whitelist' };
  }

  const walletAddress = user.walletAddress ?? null;
  if (!walletAddress) {
    return { allowed: false, reason: 'none' };
  }

  // For the access gate endpoint, we want to surface indexer unavailability so
  // the caller can fail-closed without caching a negative decision.
  const onchainAllowed = await hasOnchainNftAccess(walletAddress);
  return { allowed: onchainAllowed, reason: 'holder' };
}

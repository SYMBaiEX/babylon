import { db, eq, nftOwnership, nftSnapshot, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import {
  hasOnchainNftAccess,
  NftIndexerUnavailableError,
} from './nft-indexer-service';
import { checkWhitelistAccess } from './whitelist-service';

async function hasDbNftOrClaimAccessFallback(
  dbUserId: string
): Promise<boolean> {
  const [owned] = await db
    .select({ tokenId: nftOwnership.tokenId })
    .from(nftOwnership)
    .where(eq(nftOwnership.userId, dbUserId))
    .limit(1);
  if (owned) return true;

  const [row] = await db
    .select({ id: nftSnapshot.id })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, dbUserId))
    .limit(1);

  // A snapshot row indicates the user is eligible to claim (and includes minted users too).
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
    const wl = await checkWhitelistAccess(dbUserId);
    return wl.allowed;
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
 * Returns true if the user currently holds at least one NFT from the configured
 * Top 100 collection.
 *
 * Primary source of truth: Envio indexer (secondary transfers supported).
 * Fallback (best-effort): DB ownership/snapshot (keeps local/dev behavior and
 * avoids hard failures if the indexer is temporarily unavailable).
 */
export async function hasNftAccess(dbUserId: string): Promise<boolean> {
  // Check whitelist first (fastest path for whitelisted users).
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
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }
  }

  // Degraded/best-effort mode: allow if eligible to claim or present in DB ownership.
  return hasDbNftOrClaimAccessFallback(dbUserId);
}

export async function hasNftAccessForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<boolean> {
  if (await isWhitelistOverride(user.dbUserId)) return true;

  const walletAddress = user.walletAddress ?? null;
  if (walletAddress) {
    try {
      const onchainAllowed = await hasOnchainNftAccess(walletAddress);
      if (onchainAllowed) return true;
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }
  }

  if (!user.dbUserId) return false;
  // Allow claimable users (Top 100 snapshot) and minted users even if they don't currently hold.
  return hasDbNftOrClaimAccessFallback(user.dbUserId);
}

export async function getNftAccessStatusForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<{ allowed: boolean; degraded: boolean }> {
  if (await isWhitelistOverride(user.dbUserId))
    return { allowed: true, degraded: false };

  const walletAddress = user.walletAddress ?? null;
  if (walletAddress) {
    try {
      const onchainAllowed = await hasOnchainNftAccess(walletAddress);
      if (onchainAllowed) return { allowed: true, degraded: false };
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }

    // Indexer is available but the user doesn't currently hold. Still allow if claimable.
    if (!user.dbUserId) return { allowed: false, degraded: false };
    const allowed = await hasDbNftOrClaimAccessFallback(user.dbUserId);
    return { allowed, degraded: false };
  }

  if (!user.dbUserId) return { allowed: false, degraded: true };
  const allowed = await hasDbNftOrClaimAccessFallback(user.dbUserId);
  return { allowed, degraded: true };
}

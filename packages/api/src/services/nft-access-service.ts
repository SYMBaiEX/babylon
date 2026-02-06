import { db, eq, nftOwnership, nftSnapshot, users } from '@babylon/db';
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
 * Returns true if the user currently holds at least one NFT from the configured
 * Top 100 collection.
 *
 * Primary source of truth: Envio indexer (secondary transfers supported).
 * Fallback (best-effort): DB ownership/snapshot (keeps local/dev behavior and
 * avoids hard failures if the indexer is temporarily unavailable).
 */
export async function hasNftAccess(dbUserId: string): Promise<boolean> {
  // Check whitelist first (fastest path for whitelisted users).
  // Wrapped in try-catch so a missing Whitelist table doesn't block NFT checks.
  try {
    const wl = await checkWhitelistAccess(dbUserId);
    if (wl.allowed) return true;
  } catch {
    // Whitelist table may not exist yet — continue with NFT checks
  }

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
  // Check whitelist first.
  // Wrapped in try-catch so a missing Whitelist table doesn't block NFT checks.
  if (user.dbUserId) {
    try {
      const wl = await checkWhitelistAccess(user.dbUserId);
      if (wl.allowed) return true;
    } catch {
      // Whitelist table may not exist yet — continue with NFT checks
    }
  }

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
  // Check whitelist first — whitelisted users bypass all NFT checks.
  // Wrapped in try-catch so a missing Whitelist table doesn't block NFT checks.
  if (user.dbUserId) {
    try {
      const wl = await checkWhitelistAccess(user.dbUserId);
      if (wl.allowed) return { allowed: true, degraded: false };
    } catch {
      // Whitelist table may not exist yet — continue with NFT checks
    }
  }

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

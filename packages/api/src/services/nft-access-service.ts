import { db, eq, nftOwnership, nftSnapshot, users } from '@babylon/db';
import {
  hasOnchainNftAccess,
  NftIndexerUnavailableError,
} from './nft-indexer-service';

async function hasDbNftAccessFallback(dbUserId: string): Promise<boolean> {
  const [owned] = await db
    .select({ tokenId: nftOwnership.tokenId })
    .from(nftOwnership)
    .where(eq(nftOwnership.userId, dbUserId))
    .limit(1);
  if (owned) return true;

  const [row] = await db
    .select({ hasMinted: nftSnapshot.hasMinted })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, dbUserId))
    .limit(1);

  return row?.hasMinted === true;
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
  const [dbUser] = await db
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, dbUserId))
    .limit(1);

  const walletAddress = dbUser?.walletAddress ?? null;
  if (walletAddress) {
    try {
      return await hasOnchainNftAccess(walletAddress);
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }
  }

  // Degraded mode: keep existing behavior (minted or DB ownership).
  return hasDbNftAccessFallback(dbUserId);
}

export async function hasNftAccessForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<boolean> {
  const walletAddress = user.walletAddress ?? null;
  if (walletAddress) {
    try {
      return await hasOnchainNftAccess(walletAddress);
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }
  }

  if (!user.dbUserId) return false;
  return hasNftAccess(user.dbUserId);
}

export async function getNftAccessStatusForAuthUser(user: {
  dbUserId?: string | null;
  walletAddress?: string | null;
}): Promise<{ allowed: boolean; degraded: boolean }> {
  const walletAddress = user.walletAddress ?? null;
  if (walletAddress) {
    try {
      const allowed = await hasOnchainNftAccess(walletAddress);
      return { allowed, degraded: false };
    } catch (error) {
      if (!(error instanceof NftIndexerUnavailableError)) throw error;
    }
  }

  if (!user.dbUserId) return { allowed: false, degraded: true };
  const allowed = await hasDbNftAccessFallback(user.dbUserId);
  return { allowed, degraded: true };
}

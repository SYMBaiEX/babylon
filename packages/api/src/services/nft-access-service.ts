import { db, eq, nftSnapshot } from '@babylon/db';

/**
 * Returns true if the user has minted via our Top 100 claim flow.
 * (Secondary ownership / on-chain indexing is handled in a later PR.)
 */
export async function hasNftAccess(dbUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ hasMinted: nftSnapshot.hasMinted })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, dbUserId))
    .limit(1);

  return row?.hasMinted === true;
}

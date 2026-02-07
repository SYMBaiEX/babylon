import {
  and,
  db,
  desc,
  eq,
  isNull,
  nftSnapshot,
  sql,
  users,
  whitelist,
  whitelistConfig,
} from '@babylon/db';
import { nanoid } from 'nanoid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhitelistSource =
  | 'snapshot_first_100'
  | 'admin_manual'
  | 'leaderboard';

interface AddToWhitelistParams {
  userId: string;
  source: WhitelistSource;
  reason?: string;
  grantedBy?: string;
}

interface UpdateWhitelistConfigParams {
  leaderboardRankThreshold: number | null;
  leaderboardCategory?: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Access checks
// ---------------------------------------------------------------------------

/**
 * Check if a user has an active (non-revoked) entry in the Whitelist table.
 */
export async function isUserWhitelisted(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: whitelist.id })
    .from(whitelist)
    .where(and(eq(whitelist.userId, userId), isNull(whitelist.revokedAt)))
    .limit(1);

  return Boolean(row);
}

/**
 * Check if a user qualifies for whitelist access via the leaderboard
 * rank threshold configured in WhitelistConfig.
 *
 * Computes the user's rank on-the-fly by counting users with higher
 * reputation points. Returns false if the threshold is disabled (null).
 */
export async function isUserWhitelistedByLeaderboard(
  userId: string
): Promise<boolean> {
  const config = await getWhitelistConfig();
  if (!config?.leaderboardRankThreshold) return false;

  const threshold = config.leaderboardRankThreshold;

  // Get the user's reputation points
  const [user] = await db
    .select({ reputationPoints: users.reputationPoints })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return false;

  // Count how many non-actor, non-agent users have strictly more points
  const [result] = await db
    .select({ rank: sql<number>`count(*) + 1` })
    .from(users)
    .where(
      and(
        sql`${users.reputationPoints} > ${user.reputationPoints}`,
        eq(users.isActor, false),
        eq(users.isAgent, false)
      )
    );

  const rank = Number(result?.rank ?? 0);
  return rank <= threshold;
}

/**
 * Combined whitelist access check: direct whitelist entry OR leaderboard rank.
 */
export async function checkWhitelistAccess(
  userId: string
): Promise<{ allowed: boolean; source: string | null }> {
  // 1. Check direct whitelist entry first (fast)
  const [directEntry] = await db
    .select({ source: whitelist.source })
    .from(whitelist)
    .where(and(eq(whitelist.userId, userId), isNull(whitelist.revokedAt)))
    .limit(1);

  if (directEntry) return { allowed: true, source: directEntry.source };

  // 2. Check leaderboard rank threshold
  const leaderboardAllowed = await isUserWhitelistedByLeaderboard(userId);
  if (leaderboardAllowed) return { allowed: true, source: 'leaderboard' };

  return { allowed: false, source: null };
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Add a user to the whitelist. Uses INSERT ... ON CONFLICT for idempotency.
 *
 * If the user has an active (non-revoked) entry, returns alreadyExists: true.
 * If the user has a revoked entry, replaces it with a fresh active entry.
 */
export async function addToWhitelist({
  userId,
  source,
  reason,
  grantedBy,
}: AddToWhitelistParams): Promise<{ id: string; alreadyExists: boolean }> {
  const id = nanoid();
  const now = new Date();
  const nowISO = now.toISOString();

  const [result] = await db
    .insert(whitelist)
    .values({
      id,
      userId,
      source,
      reason: reason ?? null,
      grantedBy: grantedBy ?? null,
      grantedAt: now,
    })
    .onConflictDoUpdate({
      target: whitelist.userId,
      // Only overwrite if the existing row is revoked; otherwise leave it.
      set: {
        id: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${id} ELSE ${whitelist.id} END`,
        source: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${source} ELSE ${whitelist.source} END`,
        reason: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${reason ?? null} ELSE ${whitelist.reason} END`,
        grantedBy: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${grantedBy ?? null} ELSE ${whitelist.grantedBy} END`,
        grantedAt: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${nowISO}::timestamp ELSE ${whitelist.grantedAt} END`,
        revokedAt: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN NULL ELSE ${whitelist.revokedAt} END`,
      },
    })
    .returning({ id: whitelist.id });

  // An upsert always returns a row — but guard just in case.
  if (!result) throw new Error('Whitelist upsert returned no rows');

  // If the returned id matches what we tried to insert, it's a new/replaced row.
  // If it doesn't match, the row was already active and untouched.
  return { id: result.id, alreadyExists: result.id !== id };
}

/**
 * Soft-revoke a user from the whitelist by setting revokedAt.
 */
export async function removeFromWhitelist(
  userId: string
): Promise<{ removed: boolean }> {
  const [entry] = await db
    .select({ id: whitelist.id, revokedAt: whitelist.revokedAt })
    .from(whitelist)
    .where(eq(whitelist.userId, userId))
    .limit(1);

  if (!entry) return { removed: false };
  if (entry.revokedAt) return { removed: false }; // already revoked

  await db
    .update(whitelist)
    .set({ revokedAt: new Date() })
    .where(eq(whitelist.id, entry.id));

  return { removed: true };
}

/**
 * List all whitelist entries, optionally filtered by source.
 * Includes user info (username, walletAddress, displayName).
 */
export async function listWhitelistEntries(options?: {
  source?: WhitelistSource;
  includeRevoked?: boolean;
  search?: string;
}) {
  const conditions = [];

  if (options?.source) {
    conditions.push(eq(whitelist.source, options.source));
  }

  if (!options?.includeRevoked) {
    conditions.push(isNull(whitelist.revokedAt));
  }

  let query = db
    .select({
      id: whitelist.id,
      userId: whitelist.userId,
      source: whitelist.source,
      reason: whitelist.reason,
      grantedBy: whitelist.grantedBy,
      grantedAt: whitelist.grantedAt,
      revokedAt: whitelist.revokedAt,
      username: users.username,
      displayName: users.displayName,
      walletAddress: users.walletAddress,
      profileImageUrl: users.profileImageUrl,
    })
    .from(whitelist)
    .leftJoin(users, eq(whitelist.userId, users.id))
    .$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const results = await query.orderBy(desc(whitelist.grantedAt));

  // Apply search filter in-memory (username, userId, walletAddress)
  if (options?.search) {
    const q = options.search.toLowerCase();
    return results.filter(
      (r) =>
        r.username?.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q) ||
        r.walletAddress?.toLowerCase().includes(q) ||
        r.displayName?.toLowerCase().includes(q)
    );
  }

  return results;
}

/**
 * Get whitelist stats grouped by source.
 */
export async function getWhitelistStats() {
  const entries = await db
    .select({
      source: whitelist.source,
      count: sql<number>`count(*)`,
    })
    .from(whitelist)
    .where(isNull(whitelist.revokedAt))
    .groupBy(whitelist.source);

  const stats = {
    total: 0,
    snapshot_first_100: 0,
    admin_manual: 0,
    leaderboard: 0,
  };

  for (const entry of entries) {
    const count = Number(entry.count);
    stats.total += count;
    if (entry.source in stats) {
      stats[entry.source as WhitelistSource] = count;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_ID = 'default';

/**
 * Get the whitelist configuration (leaderboard threshold, etc.).
 */
export async function getWhitelistConfig() {
  const [config] = await db
    .select()
    .from(whitelistConfig)
    .where(eq(whitelistConfig.id, CONFIG_ID))
    .limit(1);

  return config ?? null;
}

/**
 * Upsert the whitelist configuration.
 */
export async function updateWhitelistConfig({
  leaderboardRankThreshold,
  leaderboardCategory,
  updatedBy,
}: UpdateWhitelistConfigParams) {
  const now = new Date();

  await db
    .insert(whitelistConfig)
    .values({
      id: CONFIG_ID,
      leaderboardRankThreshold,
      leaderboardCategory: leaderboardCategory ?? 'all',
      updatedAt: now,
      updatedBy: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: whitelistConfig.id,
      set: {
        leaderboardRankThreshold,
        ...(leaderboardCategory !== undefined && { leaderboardCategory }),
        updatedAt: now,
        updatedBy: updatedBy ?? null,
      },
    });
}

// ---------------------------------------------------------------------------
// Import First 100
// ---------------------------------------------------------------------------

/**
 * Import users from the NftSnapshot table as 'snapshot_first_100' whitelist entries.
 * Runs inside a transaction for atomicity — either all entries are imported or none.
 * Skips users who are already whitelisted (active).
 */
export async function importFirst100FromSnapshot(grantedBy?: string) {
  const snapshotEntries = await db
    .select({
      userId: nftSnapshot.userId,
      rank: nftSnapshot.rank,
    })
    .from(nftSnapshot)
    .orderBy(nftSnapshot.rank);

  if (snapshotEntries.length === 0) {
    return { imported: 0, skipped: 0, total: 0 };
  }

  const result = await db.transaction(async (tx) => {
    let imported = 0;
    let skipped = 0;

    for (const entry of snapshotEntries) {
      const id = nanoid();
      const now = new Date();
      const nowISO = now.toISOString();

      const [row] = await tx
        .insert(whitelist)
        .values({
          id,
          userId: entry.userId,
          source: 'snapshot_first_100' as WhitelistSource,
          reason: `Imported from NFT snapshot (rank #${entry.rank})`,
          grantedBy: grantedBy ?? null,
          grantedAt: now,
        })
        .onConflictDoUpdate({
          target: whitelist.userId,
          // Only overwrite revoked entries; leave active entries untouched.
          set: {
            id: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${id} ELSE ${whitelist.id} END`,
            source: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN 'snapshot_first_100' ELSE ${whitelist.source} END`,
            reason: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${'Imported from NFT snapshot (rank #' + entry.rank + ')'} ELSE ${whitelist.reason} END`,
            grantedBy: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${grantedBy ?? null} ELSE ${whitelist.grantedBy} END`,
            grantedAt: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN ${nowISO}::timestamp ELSE ${whitelist.grantedAt} END`,
            revokedAt: sql`CASE WHEN ${whitelist.revokedAt} IS NOT NULL THEN NULL ELSE ${whitelist.revokedAt} END`,
          },
        })
        .returning({ id: whitelist.id });

      if (!row) throw new Error('Whitelist upsert returned no rows');

      if (row.id === id) {
        imported++;
      } else {
        skipped++;
      }
    }

    return { imported, skipped };
  });

  return {
    imported: result.imported,
    skipped: result.skipped,
    total: snapshotEntries.length,
  };
}

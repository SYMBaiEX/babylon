/**
 * NFT Leaderboard Snapshot Cron Job
 *
 * @route POST /api/cron/nft-snapshot
 * @access Cron (CRON_SECRET required)
 *
 * @description
 * Scheduled cron job that takes a snapshot of the top 100 leaderboard users
 * for NFT mint eligibility. Runs at midnight UTC daily. Users in the snapshot
 * become eligible to mint from the Babylon Top 100 NFT collection.
 *
 * **Snapshot Logic:**
 * - Fetches top 100 users by total reputation points (min 500 points)
 * - Creates/updates NftSnapshot records for eligible users
 * - Preserves existing mint status for users who have already minted
 * - Removes users who drop out of top 100 (unless they've already minted)
 *
 * @openapi
 * /api/cron/nft-snapshot:
 *   post:
 *     tags:
 *       - Cron
 *     summary: Take NFT eligibility snapshot
 *     description: Snapshots top 100 leaderboard for NFT mint eligibility
 *     security:
 *       - CronSecret: []
 *     responses:
 *       200:
 *         description: Snapshot completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 snapshotTakenAt:
 *                   type: string
 *                 usersInSnapshot:
 *                   type: integer
 *                 newlyEligible:
 *                   type: integer
 *                 alreadyMinted:
 *                   type: integer
 *       401:
 *         description: Invalid or missing CRON_SECRET
 */

import {
  PointsService,
  requireCronAuth,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, nftSnapshot, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';

export const maxDuration = 60;

const TOP_100_LIMIT = 100;
const MIN_POINTS = 0;

export const POST = withErrorHandling(async (request: NextRequest) => {
  requireCronAuth(request, { jobName: 'NftSnapshotCron' });

  const startTime = Date.now();
  const snapshotTime = new Date();

  logger.info(
    '📸 Starting NFT leaderboard snapshot',
    { snapshotTime: snapshotTime.toISOString() },
    'NftSnapshotCron'
  );

  // Fetch top 100 users by reputation points
  const leaderboardResult = await PointsService.getLeaderboard(
    1,
    TOP_100_LIMIT,
    MIN_POINTS,
    'all'
  );

  const topUsers = leaderboardResult.users;

  logger.info(
    `Found ${topUsers.length} users for snapshot`,
    { totalCount: leaderboardResult.totalCount },
    'NftSnapshotCron'
  );

  // Get existing snapshot entries to preserve mint status
  const existingSnapshots = await db
    .select({
      userId: nftSnapshot.userId,
      hasMinted: nftSnapshot.hasMinted,
      mintedTokenId: nftSnapshot.mintedTokenId,
      mintedAt: nftSnapshot.mintedAt,
      mintTxHash: nftSnapshot.mintTxHash,
    })
    .from(nftSnapshot);

  const existingMap = new Map(existingSnapshots.map((s) => [s.userId, s]));

  // Build wallet lookup map for the top 100 users
  // We use a Set for O(1) lookups when filtering
  const userIdSet = new Set(topUsers.map((u) => u.id));
  const walletMap = new Map<string, string | null>();

  if (userIdSet.size > 0) {
    const walletResults = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users);

    for (const w of walletResults) {
      if (userIdSet.has(w.id)) {
        walletMap.set(w.id, w.walletAddress);
      }
    }
  }

  let newlyEligible = 0;
  let updated = 0;
  let alreadyMinted = 0;

  // Process each user in the top 100
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i]!;
    const rank = i + 1;
    const existing = existingMap.get(user.id);
    const walletAddress = walletMap.get(user.id);

    if (existing) {
      // User already in snapshot - update rank/points but preserve mint status
      if (existing.hasMinted) {
        alreadyMinted++;
      }

      await db
        .update(nftSnapshot)
        .set({
          rank,
          points: user.allPoints,
          walletAddress: walletAddress ?? null,
          snapshotTakenAt: snapshotTime,
        })
        .where(eq(nftSnapshot.userId, user.id));

      updated++;
    } else {
      // New user in top 100 - create snapshot entry
      await db.insert(nftSnapshot).values({
        id: nanoid(),
        userId: user.id,
        walletAddress: walletAddress ?? null,
        rank,
        points: user.allPoints,
        snapshotTakenAt: snapshotTime,
        hasMinted: false,
      });

      newlyEligible++;
    }

    // Remove from map to track who dropped out
    existingMap.delete(user.id);
  }

  // Users remaining in existingMap have dropped out of top 100
  // Remove them ONLY if they haven't minted yet
  let removedCount = 0;
  for (const [userId, snapshot] of existingMap) {
    if (!snapshot.hasMinted) {
      await db.delete(nftSnapshot).where(eq(nftSnapshot.userId, userId));
      removedCount++;
    }
  }

  const duration = Date.now() - startTime;

  logger.info(
    '✅ NFT leaderboard snapshot completed',
    {
      snapshotTime: snapshotTime.toISOString(),
      usersInSnapshot: topUsers.length,
      newlyEligible,
      updated,
      alreadyMinted,
      removedFromSnapshot: removedCount,
      durationMs: duration,
    },
    'NftSnapshotCron'
  );

  return successResponse({
    success: true,
    snapshotTakenAt: snapshotTime.toISOString(),
    usersInSnapshot: topUsers.length,
    newlyEligible,
    updated,
    alreadyMinted,
    removedFromSnapshot: removedCount,
    durationMs: duration,
  });
});

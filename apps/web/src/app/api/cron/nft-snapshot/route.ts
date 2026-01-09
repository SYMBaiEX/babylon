import {
  PointsService,
  requireCronAuth,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, inArray, nftSnapshot, users } from '@babylon/db';
import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';

export const maxDuration = 60;

export const POST = withErrorHandling(async (request: NextRequest) => {
  requireCronAuth(request, { jobName: 'NftSnapshotCron' });

  const snapshotTime = new Date();
  const { users: topUsers } = await PointsService.getLeaderboard(
    1,
    100,
    0,
    'all'
  );

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

  const userIds = topUsers.map((u) => u.id);
  const walletMap = new Map<string, string | null>();

  if (userIds.length > 0) {
    const wallets = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(inArray(users.id, userIds));

    for (const w of wallets) {
      walletMap.set(w.id, w.walletAddress);
    }
  }

  let newlyEligible = 0;
  let updated = 0;

  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i]!;
    const rank = i + 1;
    const existing = existingMap.get(user.id);
    const walletAddress = walletMap.get(user.id) ?? null;

    if (existing) {
      await db
        .update(nftSnapshot)
        .set({
          rank,
          points: user.allPoints,
          walletAddress,
          snapshotTakenAt: snapshotTime,
        })
        .where(eq(nftSnapshot.userId, user.id));
      updated++;
    } else {
      await db.insert(nftSnapshot).values({
        id: nanoid(),
        userId: user.id,
        walletAddress,
        rank,
        points: user.allPoints,
        snapshotTakenAt: snapshotTime,
        hasMinted: false,
      });
      newlyEligible++;
    }

    existingMap.delete(user.id);
  }

  let removed = 0;
  for (const [userId, snapshot] of existingMap) {
    if (!snapshot.hasMinted) {
      await db.delete(nftSnapshot).where(eq(nftSnapshot.userId, userId));
      removed++;
    }
  }

  return successResponse({
    success: true,
    snapshotTakenAt: snapshotTime.toISOString(),
    usersInSnapshot: topUsers.length,
    newlyEligible,
    updated,
    removed,
  });
});

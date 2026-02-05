/**
 * Admin NFT Snapshot Management API
 *
 * @route GET /api/admin/nft-snapshot - List all snapshot entries
 * @route POST /api/admin/nft-snapshot - Add a user to the snapshot
 * @route DELETE /api/admin/nft-snapshot - Remove a user from the snapshot
 * @access Admin
 */

import {
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api'
import { db, eq, nftSnapshot, users } from '@babylon/db'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request)

  const snapshots = await db
    .select({
      id: nftSnapshot.id,
      userId: nftSnapshot.userId,
      walletAddress: nftSnapshot.walletAddress,
      rank: nftSnapshot.rank,
      points: nftSnapshot.points,
      snapshotTakenAt: nftSnapshot.snapshotTakenAt,
      hasMinted: nftSnapshot.hasMinted,
      mintedTokenId: nftSnapshot.mintedTokenId,
      mintedAt: nftSnapshot.mintedAt,
      mintTxHash: nftSnapshot.mintTxHash,
      username: users.username,
    })
    .from(nftSnapshot)
    .leftJoin(users, eq(nftSnapshot.userId, users.id))
    .orderBy(nftSnapshot.rank)

  const totalEligible = snapshots.length
  const totalMinted = snapshots.filter((s) => s.hasMinted).length

  return successResponse({
    snapshots,
    stats: {
      totalEligible,
      totalMinted,
      remaining: totalEligible - totalMinted,
    },
  })
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request)

  const body = await request.json()
  const { userId, rank, points } = body as {
    userId: string
    rank?: number
    points?: number
  }

  if (!userId || typeof userId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'userId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check if user exists
  const [user] = await db
    .select({ id: users.id, username: users.username, walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check if user is already in snapshot
  const [existing] = await db
    .select({ id: nftSnapshot.id })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, userId))
    .limit(1)

  if (existing) {
    return new Response(
      JSON.stringify({ error: 'User is already in the snapshot' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get current max rank for default
  const allSnapshots = await db
    .select({ rank: nftSnapshot.rank })
    .from(nftSnapshot)
    .orderBy(nftSnapshot.rank)

  const maxRank = allSnapshots.length > 0
    ? Math.max(...allSnapshots.map((s) => s.rank))
    : 0

  const newEntry = {
    id: nanoid(),
    userId,
    walletAddress: user.walletAddress ?? null,
    rank: rank ?? maxRank + 1,
    points: points ?? 0,
    snapshotTakenAt: new Date(),
    hasMinted: false,
  }

  await db.insert(nftSnapshot).values(newEntry)

  return successResponse({
    success: true,
    entry: { ...newEntry, username: user.username },
  })
})

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request)

  const body = await request.json()
  const { userId } = body as { userId: string }

  if (!userId || typeof userId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'userId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check if entry exists and hasn't minted
  const [existing] = await db
    .select({ id: nftSnapshot.id, hasMinted: nftSnapshot.hasMinted })
    .from(nftSnapshot)
    .where(eq(nftSnapshot.userId, userId))
    .limit(1)

  if (!existing) {
    return new Response(
      JSON.stringify({ error: 'User not found in snapshot' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (existing.hasMinted) {
    return new Response(
      JSON.stringify({ error: 'Cannot remove a user who has already minted' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  await db.delete(nftSnapshot).where(eq(nftSnapshot.userId, userId))

  return successResponse({ success: true, removedUserId: userId })
})

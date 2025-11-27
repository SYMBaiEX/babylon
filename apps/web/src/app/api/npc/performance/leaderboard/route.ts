/**
 * NPC Performance Leaderboard API
 *
 * @route GET /api/npc/performance/leaderboard - Get NPC leaderboard
 * @access Public
 *
 * @description
 * Returns ranked list of NPC actors by portfolio performance. Includes
 * filtering options for minimum portfolio value and result limit.
 *
 * @openapi
 * /api/npc/performance/leaderboard:
 *   get:
 *     tags:
 *       - NPC
 *     summary: Get NPC performance leaderboard
 *     description: Returns ranked NPC actors by portfolio performance
 *     parameters:
 *       - in: query
 *         name: minValue
 *         schema:
 *           type: number
 *         description: Minimum portfolio value filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum results to return
 *     responses:
 *       200:
 *         description: Leaderboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 leaderboard:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       actorId:
 *                         type: string
 *                       totalValue:
 *                         type: number
 *                       pnl:
 *                         type: number
 *
 * @example
 * ```typescript
 * const { leaderboard } = await fetch('/api/npc/performance/leaderboard?limit=10')
 *   .then(r => r.json());
 * ```
 */

import { NextResponse } from 'next/server';
import {
  actors,
  and,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  poolPositions,
  pools,
} from '@babylon/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get('limit');
  const minValueParam = searchParams.get('minValue');

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  const minValue = minValueParam ? Number.parseFloat(minValueParam) : 0;

  // Fetch pools with filter
  const poolsList = await db
    .select()
    .from(pools)
    .where(
      and(eq(pools.isActive, true), gte(pools.totalValue, String(minValue)))
    )
    .orderBy(desc(pools.totalValue))
    .limit(limit);

  // Fetch actors for all pools
  const actorIds = poolsList.map((p) => p.npcActorId);
  const actorsList =
    actorIds.length > 0
      ? await db
          .select({
            id: actors.id,
            name: actors.name,
            profileImageUrl: actors.profileImageUrl,
            personality: actors.personality,
          })
          .from(actors)
          .where(inArray(actors.id, actorIds))
      : [];
  const actorsMap = new Map(actorsList.map((a) => [a.id, a]));

  // Fetch open positions for all pools
  const poolIds = poolsList.map((p) => p.id);
  const positionsList =
    poolIds.length > 0
      ? await db
          .select({
            poolId: poolPositions.poolId,
            unrealizedPnL: poolPositions.unrealizedPnL,
          })
          .from(poolPositions)
          .where(
            and(
              inArray(poolPositions.poolId, poolIds),
              isNull(poolPositions.closedAt)
            )
          )
      : [];
  const positionsByPool = new Map<string, typeof positionsList>();
  for (const pos of positionsList) {
    const existing = positionsByPool.get(pos.poolId) || [];
    existing.push(pos);
    positionsByPool.set(pos.poolId, existing);
  }

  const leaderboard = poolsList.map((pool, index) => {
    const totalValue = Number.parseFloat(pool.totalValue?.toString() || '0');
    const availableBalance = Number.parseFloat(
      pool.availableBalance?.toString() || '0'
    );
    const initialValue = Number.parseFloat(
      pool.totalDeposits?.toString() || '0'
    );

    const poolPositionsList = positionsByPool.get(pool.id) || [];
    const unrealizedPnL = poolPositionsList.reduce((sum: number, pos) => {
      return sum + Number.parseFloat(pos.unrealizedPnL?.toString() || '0');
    }, 0);

    const roi =
      initialValue > 0 ? ((totalValue - initialValue) / initialValue) * 100 : 0;

    const invested = totalValue - availableBalance;
    const utilization = totalValue > 0 ? (invested / totalValue) * 100 : 0;

    const actor = actorsMap.get(pool.npcActorId);

    return {
      rank: index + 1,
      actorId: actor?.id || pool.npcActorId,
      actorName: actor?.name || 'Unknown',
      personality: actor?.personality || null,
      profileImageUrl: actor?.profileImageUrl || null,
      poolId: pool.id,
      performance: {
        totalValue: Math.round(totalValue),
        roi: Number.parseFloat(roi.toFixed(2)),
        unrealizedPnL: Math.round(unrealizedPnL),
        positionCount: poolPositionsList.length,
        utilization: Number.parseFloat(utilization.toFixed(1)),
      },
    };
  });

  return NextResponse.json({
    success: true,
    leaderboard,
    metadata: {
      count: leaderboard.length,
      limit,
      minValue,
    },
  });
}

/**
 * NPC Portfolio API
 * 
 * @route GET /api/npc/[actorId]/portfolio - Get NPC portfolio
 * @access Public
 * 
 * @description
 * Returns comprehensive portfolio data for an NPC actor including total
 * portfolio value, PnL, position count, and risk metrics.
 * 
 * @openapi
 * /api/npc/{actorId}/portfolio:
 *   get:
 *     tags:
 *       - NPC
 *     summary: Get NPC portfolio
 *     description: Returns comprehensive portfolio data for NPC actor
 *     parameters:
 *       - in: path
 *         name: actorId
 *         required: true
 *         schema:
 *           type: string
 *         description: NPC actor ID
 *     responses:
 *       200:
 *         description: Portfolio retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalValue:
 *                   type: number
 *                 unrealizedPnl:
 *                   type: number
 *                 realizedPnl:
 *                   type: number
 *                 positionCount:
 *                   type: integer
 *                 riskScore:
 *                   type: number
 *       404:
 *         description: NPC actor not found
 * 
 * @example
 * ```typescript
 * const portfolio = await fetch(`/api/npc/${actorId}/portfolio`)
 *   .then(r => r.json());
 * ```
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserByIdentifier } from '@/lib/users/user-lookup'
import { NPCInvestmentManager } from '@/lib/npc/npc-investment-manager'

interface RouteParams {
  params: Promise<{
    actorId: string
  }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { actorId } = await params

  const actor = await requireUserByIdentifier(actorId)

  const pool = await prisma.pool.findFirst({
    where: {
      npcActorId: actor.id,
      isActive: true,
    },
  })

  const metrics = await NPCInvestmentManager.getPortfolioMetrics(pool!.id)

  const positions = await prisma.poolPosition.findMany({
    where: {
      poolId: pool!.id,
      closedAt: null,
    },
    select: {
      id: true,
      marketType: true,
      ticker: true,
      marketId: true,
      side: true,
      size: true,
      entryPrice: true,
      currentPrice: true,
      unrealizedPnL: true,
      leverage: true,
      openedAt: true,
    },
    orderBy: {
      openedAt: 'desc',
    },
  })

  const formattedPositions = positions.map((pos) => ({
    id: pos.id,
    marketType: pos.marketType,
    ticker: pos.ticker,
    marketId: pos.marketId,
    side: pos.side,
    size: parseFloat(pos.size!.toString()),
    entryPrice: parseFloat(pos.entryPrice!.toString()),
    currentPrice: parseFloat(pos.currentPrice!.toString()),
    unrealizedPnL: parseFloat(pos.unrealizedPnL!.toString()),
    leverage: pos.leverage,
    createdAt: pos.openedAt.toISOString(),
  }))

  return NextResponse.json({
    success: true,
    actorId: actor.id,
    actorName: actor.displayName!,
    poolId: pool!.id,
    portfolio: {
      totalValue: metrics.totalValue,
      availableBalance: metrics.availableBalance,
      unrealizedPnL: metrics.unrealizedPnL,
      realizedPnL: metrics.realizedPnL,
      positionCount: metrics.positionCount,
      utilization: metrics.utilization,
      riskScore: metrics.riskScore,
    },
    positions: formattedPositions,
  })
}

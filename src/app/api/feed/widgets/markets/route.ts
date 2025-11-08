/**
 * Markets Widget API
 *
 * GET /api/feed/widgets/markets - Get trending prediction markets for sidebar widget
 */

import { db } from '@/lib/database-service'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import { asUser } from '@/lib/db/context'
import { NextResponse } from 'next/server'

export async function GET() {
  const questions = await db.getActiveQuestions()

  if (questions.length === 0) {
    return NextResponse.json({
      success: true,
      markets: [],
    })
  }

  // Optional auth - markets are public but RLS still applies
  // No request available in this route, so auth is not possible
  const authUser: AuthenticatedUser | null = null

  const marketIds = questions.map(q => String(q.id))
  const markets = await asUser(authUser, async (dbPrisma) => {
    return await dbPrisma.market.findMany({
      where: {
        id: { in: marketIds },
        resolved: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  })

  const marketMap = new Map(markets.map(m => [m.id, m]))

  const formattedMarkets = questions
    .filter(q => marketMap.has(String(q.id)))
    .map(q => {
      const market = marketMap.get(String(q.id))!
      const yesShares = Number(market.yesShares)
      const noShares = Number(market.noShares)
      const totalShares = yesShares + noShares

      const yesPrice = totalShares > 0 ? yesShares / totalShares : 0.5
      const noPrice = totalShares > 0 ? noShares / totalShares : 0.5

      return {
        id: String(q.id),
        question: q.text,
        yesPrice,
        noPrice,
        volume: totalShares,
        endDate: q.resolutionDate,
      }
    })
    .sort((a, b) => {
      const aTime = a.endDate ? new Date(a.endDate).getTime() : Date.now()
      const bTime = b.endDate ? new Date(b.endDate).getTime() : Date.now()
      const now = Date.now()

      const aRecency = Math.max(0, 1 - (aTime - now) / (30 * 24 * 60 * 60 * 1000))
      const bRecency = Math.max(0, 1 - (bTime - now) / (30 * 24 * 60 * 60 * 1000))

      const aScore = (a.volume * 0.7) + (aRecency * 1000 * 0.3)
      const bScore = (b.volume * 0.7) + (bRecency * 1000 * 0.3)

      return bScore - aScore
    })
    .slice(0, 5)

  return NextResponse.json({
    success: true,
    markets: formattedMarkets,
  })
}

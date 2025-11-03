/**
 * Markets Widget API
 * 
 * GET /api/feed/widgets/markets
 * Returns top gainers (perps & pools) and highest volume questions
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { db } from '@/lib/database-service'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

interface PerpMarket {
  ticker: string
  organizationId: string
  name: string
  currentPrice: number
  changePercent24h: number
  volume24h: number
}

interface PoolData {
  id: string
  name: string
  npcActorName: string
  totalReturn: number
  totalValue: number
}

interface QuestionData {
  id: number
  text: string
  totalVolume: number
  yesPrice: number
  timeWeightedScore: number
}

export interface MarketsWidgetData {
  topPerpGainers: PerpMarket[]
  topPoolGainers: PoolData[]
  topVolumeQuestions: QuestionData[]
  lastUpdated: string
}

export async function GET() {
  try {
    // Fetch from cache table first
    const cached = await prisma.widgetCache.findFirst({
      where: { widget: 'markets' },
      orderBy: { updatedAt: 'desc' },
    })

    // Return cached data if fresh (< 2 minutes old)
    if (cached && Date.now() - cached.updatedAt.getTime() < 120000) {
      const cachedData = cached.data as unknown as MarketsWidgetData
      return NextResponse.json({
        success: true,
        ...cachedData,
        cached: true,
      })
    }

    // Generate fresh data
    const data = await generateMarketsData()

    // Update cache
    await prisma.widgetCache.upsert({
      where: { widget: 'markets' },
      create: {
        widget: 'markets',
        data: data as unknown as Prisma.InputJsonValue,
      },
      update: {
        data: data as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      ...data,
      cached: false,
    })
  } catch (error) {
    logger.error('Error fetching markets widget:', error, 'MarketsWidget')
    return NextResponse.json(
      { success: false, error: 'Failed to load markets data' },
      { status: 500 }
    )
  }
}

async function generateMarketsData(): Promise<MarketsWidgetData> {
  // 1. Get top 3 perp gainers by % change
  const companies = await db.getCompanies()
  
  const perpMarketsWithStats = await Promise.all(
    companies.map(async (company) => {
      const currentPrice = company.currentPrice || company.initialPrice || 100
      
      // Get last 24 hours of price history
      const priceHistory = await db.getPriceHistory(company.id, 1440)
      
      let changePercent24h = 0
      
      if (priceHistory.length > 0) {
        const price24hAgo = priceHistory[priceHistory.length - 1]
        if (price24hAgo) {
          const change24h = currentPrice - price24hAgo.price
          changePercent24h = (change24h / price24hAgo.price) * 100
        }
      }
      
      // TODO: Track actual volume from trades
      const volume24h = 0
      
      return {
        ticker: company.id.toUpperCase().replace(/-/g, ''),
        organizationId: company.id,
        name: company.name,
        currentPrice,
        changePercent24h,
        volume24h,
      }
    })
  )

  // Sort by % change (absolute value for biggest movers) and take top 3
  const topPerpGainers = perpMarketsWithStats
    .sort((a, b) => Math.abs(b.changePercent24h) - Math.abs(a.changePercent24h))
    .slice(0, 3)

  // 2. Get top 3 pool gainers by total return
  const pools = await prisma.pool.findMany({
    where: {
      isActive: true,
    },
    include: {
      npcActor: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      totalValue: 'desc',
    },
  })

  const poolsWithReturn = pools.map((pool) => {
    const totalDeposits = parseFloat(pool.totalDeposits.toString())
    const totalValue = parseFloat(pool.totalValue.toString())
    const totalReturn = totalDeposits > 0 
      ? ((totalValue - totalDeposits) / totalDeposits) * 100 
      : 0

    return {
      id: pool.id,
      name: pool.name,
      npcActorName: pool.npcActor?.name || 'Unknown',
      totalReturn,
      totalValue,
    }
  })

  const topPoolGainers = poolsWithReturn
    .sort((a, b) => b.totalReturn - a.totalReturn)
    .slice(0, 3)

  // 3. Get top 3 highest volume questions (time-weighted)
  // More recent volume counts more heavily
  const activeMarkets = await prisma.market.findMany({
    where: {
      resolved: false,
      endDate: {
        gte: new Date(),
      },
    },
    select: {
      id: true,
      question: true,
      yesShares: true,
      noShares: true,
      createdAt: true,
    },
  })

    const marketsWithTimeWeightedVolume = activeMarkets.map((market) => {
      const yesShares = market.yesShares ? Number(market.yesShares) : 0
      const noShares = market.noShares ? Number(market.noShares) : 0
      const totalShares = yesShares + noShares
      const totalVolume = totalShares * 0.5 // Approximate volume (shares * avg price)
    
    // Time weight: more recent markets get higher multiplier
    // Markets created within last 24h get 2x weight, then decay to 1x over 7 days
    const ageInHours = (Date.now() - market.createdAt.getTime()) / (1000 * 60 * 60)
    const timeWeight = ageInHours < 24 
      ? 2.0 
      : Math.max(1.0, 2.0 - (ageInHours - 24) / (6 * 24))
    
    const timeWeightedScore = totalVolume * timeWeight
    
      const yesPrice = totalShares > 0 
        ? yesShares / totalShares 
        : 0.5

    return {
      id: parseInt(market.id) || 0,
      text: market.question || 'Unknown Question',
      totalVolume,
      yesPrice,
      timeWeightedScore,
    }
  })

  const topVolumeQuestions = marketsWithTimeWeightedVolume
    .sort((a, b) => b.timeWeightedScore - a.timeWeightedScore)
    .slice(0, 3)

  return {
    topPerpGainers,
    topPoolGainers,
    topVolumeQuestions,
    lastUpdated: new Date().toISOString(),
  }
}


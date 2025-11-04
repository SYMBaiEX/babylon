/**
 * Trade Repository
 * 
 * Centralized trading queries and market operations.
 */

import { BaseRepository, CacheTTL } from './base.repository'
import type { Position, Market, Prisma, PrismaClient } from '@prisma/client'
import { Prisma as PrismaNamespace } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export class TradeRepository extends BaseRepository<Position, Prisma.PositionCreateInput, Prisma.PositionUpdateInput> {
  constructor(prismaClient?: PrismaClient) {
    super(prismaClient || prisma, 'position', {
      defaultTTL: CacheTTL.SHORT,
      enableCache: true
    })
  }
  
  /**
   * Get user's positions for a specific market
   */
  async getUserMarketPosition(
    userId: string,
    marketId: string
  ): Promise<Position | null> {
    const cacheKey = this.getCacheKey(`user:${userId}:market:${marketId}`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.position.findFirst({
        where: { userId, marketId }
      })
    })
  }
  
  /**
   * Get all positions for a user
   */
  async getUserPositions(
    userId: string,
    options?: {
      marketId?: string
      side?: boolean
      limit?: number
    }
  ): Promise<(Position & { market: Market })[]> {
    const where: Prisma.PositionWhereInput = { userId }
    
    if (options?.marketId) {
      where.marketId = options.marketId
    }
    
    if (options?.side !== undefined) {
      where.side = options.side
    }
    
    return this.prisma.position.findMany({
      where,
      include: { market: true },
      take: options?.limit || 100,
      orderBy: { createdAt: 'desc' }
    })
  }
  
  /**
   * Get open positions (markets not resolved)
   */
  async getOpenPositions(userId: string): Promise<(Position & { market: Market })[]> {
    return this.prisma.position.findMany({
      where: {
        userId,
        market: {
          resolved: false
        }
      },
      include: { market: true },
      orderBy: { createdAt: 'desc' }
    })
  }
  
  /**
   * Get positions for a market (all users)
   */
  async getMarketPositions(marketId: string): Promise<Position[]> {
    const cacheKey = this.getCacheKey(`market:${marketId}:positions`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.position.findMany({
        where: { marketId },
        orderBy: { shares: 'desc' }
      })
    }, 30) // 30 second cache
  }
  
  /**
   * Create or update position (upsert)
   */
  async upsertPosition(data: {
    userId: string
    marketId: string
    side: boolean
    shares: number
    avgPrice: number
  }): Promise<Position> {
    const existing = await this.getUserMarketPosition(data.userId, data.marketId)
    
    let position: Position
    
    if (existing) {
      // Update existing position (average price)
      const existingShares = Number(existing.shares)
      const existingAvgPrice = Number(existing.avgPrice)
      const newShares = existingShares + data.shares
      const newAvgPrice = 
        ((existingShares * existingAvgPrice) + (data.shares * data.avgPrice)) / newShares
      
      position = await this.prisma.position.update({
        where: { id: existing.id },
        data: {
          shares: newShares,
          avgPrice: newAvgPrice
        }
      })
    } else {
      // Create new position
      position = await this.prisma.position.create({
        data: {
          userId: data.userId,
          marketId: data.marketId,
          side: data.side,
          shares: data.shares,
          avgPrice: data.avgPrice
        }
      })
    }
    
    // Invalidate caches
    await this.invalidatePositionCaches(position.id, data.userId, data.marketId)
    
    logger.info(`Position upserted for user ${data.userId} in market ${data.marketId}`, 
      { shares: position.shares }, 'TradeRepository')
    
    return position
  }
  
  /**
   * Close position (reduce shares)
   */
  async reducePosition(
    positionId: string,
    sharesToSell: number
  ): Promise<Position> {
    const position = await this.findById(positionId)
    
    if (!position) {
      throw new Error(`Position ${positionId} not found`)
    }
    
    const currentShares = Number(position.shares)
    
    if (sharesToSell > currentShares) {
      throw new Error(`Cannot sell ${sharesToSell} shares, only ${currentShares} available`)
    }
    
    const newShares = currentShares - sharesToSell
    
    let updated: Position
    
    if (newShares === 0) {
      // Delete position if fully closed
      await this.prisma.position.delete({
        where: { id: positionId }
      })
      updated = { ...position, shares: new PrismaNamespace.Decimal(0) }
    } else {
      // Update shares
      updated = await this.prisma.position.update({
        where: { id: positionId },
        data: { shares: new PrismaNamespace.Decimal(newShares) }
      })
    }
    
    // Invalidate caches
    await this.invalidatePositionCaches(positionId, position.userId, position.marketId)
    
    logger.info(`Position reduced: ${sharesToSell} shares sold from ${positionId}`,
      { remaining: newShares }, 'TradeRepository')
    
    return updated
  }
  
  /**
   * Get position value
   */
  async getPositionValue(positionId: string): Promise<number> {
    const position = await this.findById(positionId)
    
    if (!position) {
      return 0
    }
    
    const market = await this.prisma.market.findUnique({
      where: { id: position.marketId }
    })
    
    if (!market || market.resolved) {
      return 0
    }
    
    // Calculate current value using AMM formula
    const yesShares = Number(market.yesShares)
    const noShares = Number(market.noShares)
    const totalShares = yesShares + noShares
    
    // Guard against division by zero for new markets
    const currentPrice = totalShares === 0 
      ? 0.5 
      : position.side 
        ? yesShares / totalShares
        : noShares / totalShares
    
    return Number(position.shares) * currentPrice
  }
  
  /**
   * Get total position value for user
   */
  async getUserTotalPositionValue(userId: string): Promise<number> {
    const positions = await this.getOpenPositions(userId)
    
    let total = 0
    for (const position of positions) {
      const value = await this.getPositionValue(position.id)
      total += value
    }
    
    return total
  }
  
  /**
   * Get leaderboard (top performers)
   */
  async getLeaderboard(limit: number = 50): Promise<Array<{
    userId: string
    username: string | null
    displayName: string | null
    lifetimePnL: number
    totalTrades: number
  }>> {
    const cacheKey = this.getCacheKey(`leaderboard:${limit}`)
    
    return this.withCache(cacheKey, async () => {
      // Get top users by PnL
      const users = await this.prisma.user.findMany({
        where: {
          isActor: false
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          lifetimePnL: true,
          _count: {
            select: { positions: true }
          }
        },
        orderBy: { lifetimePnL: 'desc' },
        take: limit
      })
      
      return users.map(u => ({
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        lifetimePnL: Number(u.lifetimePnL),
        totalTrades: u._count.positions
      }))
    }, 60) // 1 minute cache
  }
  
  /**
   * Helper to invalidate position-related caches
   */
  private async invalidatePositionCaches(
    positionId: string,
    userId: string,
    marketId: string
  ): Promise<void> {
    this.cache?.delete(this.getCacheKey(positionId))
    this.cache?.delete(this.getCacheKey(`user:${userId}:market:${marketId}`))
    this.cache?.delete(this.getCacheKey(`market:${marketId}:positions`))
  }
}

/**
 * Singleton instance
 */
let tradeRepositoryInstance: TradeRepository | null = null

export function getTradeRepository(): TradeRepository {
  if (!tradeRepositoryInstance) {
    tradeRepositoryInstance = new TradeRepository()
  }
  return tradeRepositoryInstance
}


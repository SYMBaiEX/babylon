/**
 * User Repository
 * 
 * Centralized user queries and management operations.
 */

import { BaseRepository, CacheTTL } from './base.repository'
import type { User, Prisma, PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export class UserRepository extends BaseRepository<User, Prisma.UserCreateInput, Prisma.UserUpdateInput> {
  constructor(prismaClient?: PrismaClient) {
    super(prismaClient || prisma, 'user', {
      defaultTTL: CacheTTL.MEDIUM,
      enableCache: true
    })
  }
  
  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const cacheKey = this.getCacheKey(`username:${username}`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.user.findUnique({
        where: { username }
      })
    })
  }
  
  /**
   * Find user by wallet address
   */
  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    const normalizedAddress = walletAddress.toLowerCase()
    const cacheKey = this.getCacheKey(`wallet:${normalizedAddress}`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.user.findFirst({
        where: { walletAddress: normalizedAddress }
      })
    })
  }
  
  /**
   * Find user by NFT token ID
   */
  async findByTokenId(tokenId: number): Promise<User | null> {
    const cacheKey = this.getCacheKey(`token:${tokenId}`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.user.findFirst({
        where: { nftTokenId: tokenId }
      })
    })
  }
  
  /**
   * Find user by Agent0 metadata CID
   */
  async findByAgent0CID(metadataCID: string): Promise<User | null> {
    const cacheKey = this.getCacheKey(`agent0:${metadataCID}`)
    
    return this.withCache(cacheKey, async () => {
      return this.prisma.user.findFirst({
        where: { agent0MetadataCID: metadataCID }
      })
    })
  }
  
  /**
   * Get all agents (users with agent metadata)
   * Agents are identified by having agent0MetadataCID or onChainRegistered
   */
  async getAllAgents(options?: {
    onChainOnly?: boolean
    limit?: number
    offset?: number
  }): Promise<User[]> {
    const where: Prisma.UserWhereInput = {
      OR: [
        { onChainRegistered: true },
        { agent0MetadataCID: { not: null } }
      ],
      isActor: false // Exclude NPCs
    }
    
    if (options?.onChainOnly) {
      delete where.OR
      where.onChainRegistered = true
    }
    
    return this.prisma.user.findMany({
      where,
      take: options?.limit || 50,
      skip: options?.offset || 0,
      orderBy: { createdAt: 'desc' }
    })
  }
  
  /**
   * Get all human users (isAgent=false, isActor=false)
   */
  async getAllHumans(options?: {
    limit?: number
    offset?: number
  }): Promise<User[]> {
    // Get all users that are NOT NPCs and NOT registered agents
    return this.prisma.user.findMany({
      where: {
        isActor: false,
        AND: [
          { onChainRegistered: false },
          { agent0MetadataCID: null }
        ]
      },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      orderBy: { createdAt: 'desc' }
    })
  }
  
  /**
   * Update user balance (atomic)
   */
  async updateBalance(
    userId: string,
    delta: number,
    description: string
  ): Promise<User> {
    const user = await this.findById(userId)
    
    if (!user) {
      throw new Error(`User ${userId} not found`)
    }
    
    const currentBalance = Number(user.virtualBalance)
    const newBalance = currentBalance + delta
    
    if (newBalance < 0) {
      throw new Error('Insufficient funds')
    }
    
    // Update user and create transaction record
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          virtualBalance: newBalance,
          totalDeposited: delta > 0 ? Number(user.totalDeposited) + delta : user.totalDeposited,
          totalWithdrawn: delta < 0 ? Number(user.totalWithdrawn) + Math.abs(delta) : user.totalWithdrawn,
          lifetimePnL: Number(user.lifetimePnL) + delta
        }
      })
      
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: delta > 0 ? 'deposit' : 'withdraw',
          amount: Math.abs(delta),
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description
        }
      })
      
      return updatedUser
    })
    
    // Invalidate cache
    await this.invalidateUserCache(userId)
    
    logger.info(`Updated balance for user ${userId}: ${delta > 0 ? '+' : ''}${delta}`, { newBalance }, 'UserRepository')
    
    return updated
  }
  
  /**
   * Update Agent0 sync data
   */
  async updateAgent0Sync(
    userId: string,
    data: {
      metadataCID?: string
      lastSync?: Date
      trustScore?: number
      feedbackCount?: number
    }
  ): Promise<User> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        agent0MetadataCID: data.metadataCID,
        agent0LastSync: data.lastSync,
        agent0TrustScore: data.trustScore,
        agent0FeedbackCount: data.feedbackCount
      }
    })
    
    await this.invalidateCache(userId)
    
    return updated
  }
  
  /**
   * Get users with recent activity
   */
  async getActiveUsers(days: number = 7, limit: number = 50): Promise<User[]> {
    const since = new Date()
    since.setDate(since.getDate() - days)
    
    return this.prisma.user.findMany({
      where: {
        updatedAt: {
          gte: since
        },
        isActor: false
      },
      take: limit,
      orderBy: { updatedAt: 'desc' }
    })
  }
  
  /**
   * Search users by username or display name
   */
  async search(query: string, limit: number = 20): Promise<User[]> {
    const searchTerm = `%${query.toLowerCase()}%`
    
    return this.prisma.$queryRaw<User[]>`
      SELECT * FROM "User"
      WHERE 
        LOWER(username) LIKE ${searchTerm}
        OR LOWER("displayName") LIKE ${searchTerm}
      LIMIT ${limit}
    `
  }
  
  /**
   * Get user statistics
   */
  async getStatistics(userId: string): Promise<{
    totalTrades: number
    totalPnL: number
    winRate: number
    reputation: number
  }> {
    const user = await this.findById(userId)
    
    if (!user) {
      throw new Error(`User ${userId} not found`)
    }
    
    // Get position count
    const positions = await this.prisma.position.findMany({
      where: { userId },
      select: { shares: true, avgPrice: true, side: true }
    })
    
    const totalTrades = positions.length
    const totalPnL = Number(user.lifetimePnL)
    const winningTrades = positions.filter(p => {
      // Simplified: positions with positive value
      return Number(p.shares) * Number(p.avgPrice) > 0
    }).length
    
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
    const reputation = user.onChainRegistered && user.nftTokenId
      ? user.agent0TrustScore || 0
      : 0
    
    return {
      totalTrades,
      totalPnL,
      winRate,
      reputation
    }
  }
  
  /**
   * Helper to invalidate user-specific cache
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    this.cache?.delete(this.getCacheKey(userId))
  }
}

/**
 * Singleton instance
 */
let userRepositoryInstance: UserRepository | null = null

export function getUserRepository(): UserRepository {
  if (!userRepositoryInstance) {
    userRepositoryInstance = new UserRepository()
  }
  return userRepositoryInstance
}


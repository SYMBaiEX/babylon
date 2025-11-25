/**
 * Cached Server-Side Data Fetchers
 * 
 * These functions use Next.js 16 'use cache' directives to enable
 * efficient caching at the component level.
 */

import dbService from '@/lib/database-service'
import { gameService } from '@/lib/game-service'
import { db, balanceTransactions, perpPositions, markets, users, actors, chats, messages, eq, inArray, desc, asc, and, gte, sql, count } from '@/db'
import { logger } from '@/lib/logger'
import { cacheTag, cacheLife } from './cache-polyfill'
import { cacheMonitoring } from './cache-monitoring'
import { ReputationService } from '@/lib/services/reputation-service'

/**
 * Calculate 24h trading volume for an organization
 */
async function calculateVolume24h(organizationId: string): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  
  const volumeTransactions = await db.select({ amount: balanceTransactions.amount })
    .from(balanceTransactions)
    .where(
      and(
        inArray(balanceTransactions.type, ['PERP_OPEN', 'PERP_CLOSE']),
        gte(balanceTransactions.createdAt, twentyFourHoursAgo),
        sql`${balanceTransactions.description} LIKE ${`%${organizationId}%`}`
      )
    )
  
  return volumeTransactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)
}

/**
 * Get perpetual markets data (shared across all users)
 * Uses 'use cache' for build-time prerendering and runtime caching
 * Cache tag: 'markets:perps' for granular invalidation
 * Cache life: 5 minutes (300 seconds)
 */
export async function getCachedPerpMarkets() {
  'use cache'
  
  const cacheKey = 'markets:perps'
  const startTime = Date.now()
  
  cacheTag(cacheKey)
  cacheLife({ expire: 300 })
  
  try {
    const companies = await dbService().getCompanies()
    
    const marketsData = await Promise.all(
      companies.map(async (company) => {
        // Use ticker from company if available, otherwise generate from ID
        const ticker = company.ticker || company.id.toUpperCase().replace(/-/g, '').substring(0, 12)
        
        const currentPrice = company.currentPrice || company.initialPrice || 100
        const priceHistory = await dbService().getPriceHistory(company.id, 1440)
        
        let change24h = 0
        let changePercent24h = 0
        let high24h = currentPrice
        let low24h = currentPrice
        
        if (priceHistory.length > 0) {
          const price24hAgo = priceHistory[priceHistory.length - 1]
          if (price24hAgo) {
            change24h = currentPrice - price24hAgo.price
            changePercent24h = (change24h / price24hAgo.price) * 100
          }
          
          high24h = Math.max(...priceHistory.map(p => p.price), currentPrice)
          low24h = Math.min(...priceHistory.map(p => p.price), currentPrice)
        }
        
        // Get open positions for open interest calculation
        const positions = await db.select({
          side: perpPositions.side,
          size: perpPositions.size,
          leverage: perpPositions.leverage,
        })
          .from(perpPositions)
          .where(
            and(
              eq(perpPositions.organizationId, company.id),
              sql`${perpPositions.closedAt} IS NULL`
            )
          )
        
        const openInterest = positions.reduce(
          (sum, p) => sum + (Number(p.size) * Number(p.leverage)),
          0
        )
        
        const longs = positions.filter(p => p.side === 'long')
        const shorts = positions.filter(p => p.side === 'short')
        const longSize = longs.reduce((sum, p) => sum + Number(p.size), 0)
        const shortSize = shorts.reduce((sum, p) => sum + Number(p.size), 0)
        const totalSize = longSize + shortSize
        
        let fundingRate = 0.01
        if (totalSize > 0) {
          const imbalance = (longSize - shortSize) / totalSize
          fundingRate = 0.01 + (imbalance * 0.05)
        }
        
        return {
          ticker,
          organizationId: company.id,
          name: company.name,
          currentPrice,
          change24h,
          changePercent24h,
          high24h,
          low24h,
          volume24h: await calculateVolume24h(company.id),
          openInterest,
          fundingRate: {
            rate: fundingRate,
            nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            predictedRate: fundingRate,
          },
          maxLeverage: 100,
          minOrderSize: 10,
        }
      })
    )
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return {
      success: true,
      markets: marketsData,
      count: marketsData.length,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached perp markets:', error, 'getCachedPerpMarkets')
    return {
      success: false,
      markets: [],
      count: 0,
    }
  }
}

/**
 * Get prediction market stats (shared across all users)
 * Uses 'use cache' for build-time prerendering
 * Cache tag: 'stats' for granular invalidation
 * Cache life: 1 minute (60 seconds) - stats change frequently
 */
export async function getCachedStats() {
  'use cache'
  
  const cacheKey = 'stats'
  const startTime = Date.now()
  
  cacheTag(cacheKey)
  // Cache life: 1 minute - stats change frequently
  cacheLife({ expire: 60 })
  
  try {
    const stats = await gameService.getStats()
    const status = gameService.getStatus()
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return {
      success: true,
      stats,
      engineStatus: status,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached stats:', error, 'getCachedStats')
    return {
      success: false,
      stats: null,
      engineStatus: null,
    }
  }
}

/**
 * Get active prediction questions (shared, but can include user positions)
 * Uses 'use cache: remote' for dynamic context caching
 * Cache tag: 'markets:predictions' for granular invalidation
 * Cache life: 2 minutes (120 seconds) - predictions update frequently
 */
export async function getCachedPredictions(userId?: string, timeframe?: string) {
  'use cache: remote'
  
  const cacheKey = `markets:predictions${userId ? `:${userId}` : ''}`
  const startTime = Date.now()
  
  cacheTag('markets:predictions')
  // Cache life: 2 minutes - predictions update frequently
  cacheLife({ expire: 120 })
  
  try {
    const questions = await dbService().getActiveQuestions(timeframe)
    const marketIds = questions.map(q => String(q.id)) // Convert to string array
    
    const marketsResult = await db.select()
      .from(markets)
      .where(inArray(markets.id, marketIds))
    const marketMap = new Map(marketsResult.map(m => [m.id, m]))
    
    // Get user positions if userId provided
    const userPositionsMap = new Map()
    if (userId) {
      // Import positions table
      const { positions } = await import('@/db/schema/markets')
      
      const userPositions = await db.select()
        .from(positions)
        .where(
          and(
            eq(positions.userId, userId),
            inArray(positions.marketId, marketIds)
          )
        )
      
      for (const p of userPositions) {
        const market = marketMap.get(p.marketId)
        if (!market) continue
        const totalShares = Number(market.yesShares) + Number(market.noShares)
        const currentYesPrice = totalShares > 0 ? Number(market.yesShares) / totalShares : 0.5
        const currentNoPrice = totalShares > 0 ? Number(market.noShares) / totalShares : 0.5
        
        userPositionsMap.set(p.marketId, {
          id: p.id,
          side: p.side ? 'YES' : 'NO',
          shares: Number(p.shares),
          avgPrice: Number(p.avgPrice),
          currentPrice: p.side ? currentYesPrice : currentNoPrice,
          currentValue: Number(p.shares) * (p.side ? currentYesPrice : currentNoPrice),
          costBasis: Number(p.shares) * Number(p.avgPrice),
          unrealizedPnL: (Number(p.shares) * (p.side ? currentYesPrice : currentNoPrice)) - (Number(p.shares) * Number(p.avgPrice)),
        })
      }
    }
    
    return {
      success: true,
      questions: questions.map(q => {
        const marketId = String(q.id)
        const market = marketMap.get(marketId)
        const userPosition = userPositionsMap.get(marketId)
        
        return {
          id: marketId, // Ensure id is string
          questionNumber: q.questionNumber,
          text: q.text,
          status: q.status,
          timeframe: q.timeframe,
          createdDate: q.createdDate,
          resolutionDate: q.resolutionDate,
          resolvedOutcome: q.resolvedOutcome,
          scenario: q.scenarioId,
          yesShares: market ? Number(market.yesShares) : 0,
          noShares: market ? Number(market.noShares) : 0,
          userPosition: userPosition || null,
        }
      }),
      count: questions.length,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached predictions:', error, 'getCachedPredictions')
    return {
      success: false,
      questions: [],
      count: 0,
    }
  }
}

/**
 * Get latest posts (shared feed)
 * Uses 'use cache: remote' for dynamic context caching
 * Cache tag: 'posts:latest' for granular invalidation
 * Cache life: 30 seconds - posts are very dynamic
 */
export async function getCachedLatestPosts(limit: number = 100, offset: number = 0, actorId?: string) {
  'use cache: remote'
  
  const cacheKey = `posts:latest:${limit}:${offset}:${actorId || 'all'}`
  const startTime = Date.now()
  
  cacheTag('posts:latest')
  // Cache life: 30 seconds - posts are very dynamic
  cacheLife({ expire: 30 })
  
  try {
    // Prefer realtime history when available
    const realtimeResult = await gameService.getRealtimePosts(limit, offset, actorId || undefined)
    if (realtimeResult && realtimeResult.posts.length > 0) {
      const result = {
        success: true,
        posts: realtimeResult.posts,
        total: realtimeResult.total,
        limit,
        offset,
        source: 'realtime',
      }
      
      const responseTime = Date.now() - startTime
      cacheMonitoring.recordHit(cacheKey, responseTime)
      
      return result
    }
    
    let posts
    if (actorId) {
      posts = await gameService.getPostsByActor(actorId, limit)
    } else {
      posts = await gameService.getRecentPosts(limit, offset)
    }
    
    const result = {
      success: true,
      posts,
      total: posts.length,
      limit,
      offset,
    }
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached latest posts:', error, 'getCachedLatestPosts')
    return {
      success: false,
      posts: [],
      total: 0,
      limit,
      offset,
    }
  }
}

/**
 * Get registry users (shared, but can be filtered)
 * Uses 'use cache: remote' for dynamic filtering caching
 * Cache tag: 'registry' for granular invalidation
 * Cache life: 3 minutes (180 seconds) - registry changes less frequently
 */
export async function getCachedRegistry(filters: {
  onChainOnly?: boolean
  sortBy?: 'username' | 'createdAt' | 'nftTokenId'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}) {
  'use cache: remote'
  
  const cacheKey = `registry:${JSON.stringify(filters)}`
  const startTime = Date.now()
  
  cacheTag('registry')
  // Cache life: 3 minutes - registry changes less frequently
  cacheLife({ expire: 180 })
  
  try {
    // Import positions, comments, reactions tables
    const { positions } = await import('@/db/schema/markets')
    const { comments, reactions } = await import('@/db/schema/posts')
    
    // Build where condition
    const whereCondition = filters.onChainOnly ? eq(users.onChainRegistered, true) : undefined
    
    // Build order by
    let orderByField
    if (filters.sortBy === 'username') {
      orderByField = filters.sortOrder === 'asc' ? asc(users.username) : desc(users.username)
    } else if (filters.sortBy === 'nftTokenId') {
      orderByField = filters.sortOrder === 'asc' ? asc(users.nftTokenId) : desc(users.nftTokenId)
    } else {
      orderByField = filters.sortOrder === 'asc' ? asc(users.createdAt) : desc(users.createdAt)
    }
    
    // Fetch users
    const usersResult = whereCondition 
      ? await db.select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          profileImageUrl: users.profileImageUrl,
          walletAddress: users.walletAddress,
          isActor: users.isActor,
          onChainRegistered: users.onChainRegistered,
          nftTokenId: users.nftTokenId,
          registrationTxHash: users.registrationTxHash,
          createdAt: users.createdAt,
          virtualBalance: users.virtualBalance,
          lifetimePnL: users.lifetimePnL,
        })
        .from(users)
        .where(whereCondition)
        .orderBy(orderByField)
        .limit(filters.limit || 100)
        .offset(filters.offset || 0)
      : await db.select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          profileImageUrl: users.profileImageUrl,
          walletAddress: users.walletAddress,
          isActor: users.isActor,
          onChainRegistered: users.onChainRegistered,
          nftTokenId: users.nftTokenId,
          registrationTxHash: users.registrationTxHash,
          createdAt: users.createdAt,
          virtualBalance: users.virtualBalance,
          lifetimePnL: users.lifetimePnL,
        })
        .from(users)
        .orderBy(orderByField)
        .limit(filters.limit || 100)
        .offset(filters.offset || 0)
    
    // Get total count
    const countResult = whereCondition
      ? await db.select({ count: count() }).from(users).where(whereCondition)
      : await db.select({ count: count() }).from(users)
    const totalCount = countResult[0]?.count || 0
    
    // Get counts for each user
    const usersWithReputation = await Promise.all(
      usersResult.map(async (user) => {
        let reputation: number | null = null
        if (user.onChainRegistered && user.nftTokenId) {
          try {
            reputation = await ReputationService.getOnChainReputation(user.id)
          } catch (error) {
            logger.error(`Failed to fetch reputation for user ${user.id}:`, error, 'getCachedRegistry')
          }
        }
        
        // Get counts
        const positionCount = await db.select({ count: count() }).from(positions).where(eq(positions.userId, user.id))
        const commentCount = await db.select({ count: count() }).from(comments).where(eq(comments.authorId, user.id))
        const reactionCount = await db.select({ count: count() }).from(reactions).where(eq(reactions.userId, user.id))
        
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          walletAddress: user.walletAddress,
          isActor: user.isActor,
          onChainRegistered: user.onChainRegistered,
          nftTokenId: user.nftTokenId,
          registrationTxHash: user.registrationTxHash,
          createdAt: user.createdAt,
          virtualBalance: user.virtualBalance?.toString() || '0',
          lifetimePnL: user.lifetimePnL?.toString() || '0',
          reputation,
          stats: {
            positions: positionCount[0]?.count || 0,
            comments: commentCount[0]?.count || 0,
            reactions: reactionCount[0]?.count || 0,
          },
        }
      })
    )
    
    const result = {
      success: true,
      users: usersWithReputation,
      pagination: {
        total: totalCount,
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        hasMore: (filters.offset || 0) + usersResult.length < totalCount,
      },
    }
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached registry:', error, 'getCachedRegistry')
    return {
      success: false,
      users: [],
      pagination: {
        total: 0,
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        hasMore: false,
      },
    }
  }
}

/**
 * Get all prediction markets (shared)
 * Uses 'use cache' for build-time prerendering
 * Cache tag: 'markets:list' for granular invalidation
 * Cache life: 5 minutes (300 seconds)
 */
export async function getCachedMarkets() {
  'use cache'
  
  const cacheKey = 'markets:list'
  const startTime = Date.now()
  
  cacheTag(cacheKey)
  // Cache life: 5 minutes
  cacheLife({ expire: 300 })
  
  try {
    const marketsData = await gameService.getAllGames()
    
    const result = {
      success: true,
      markets: marketsData,
      count: marketsData.length,
    }
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached markets:', error, 'getCachedMarkets')
    return {
      success: false,
      markets: [],
      count: 0,
    }
  }
}

/**
 * Get actor information (shared, but dynamic per actor)
 * Uses 'use cache: remote' for dynamic context caching
 * Cache tag: 'actors' for granular invalidation
 * Cache life: 5 minutes (300 seconds) - actor info changes infrequently
 */
export async function getCachedActor(actorId: string) {
  'use cache: remote'
  
  const cacheKey = `actors:${actorId}`
  const startTime = Date.now()
  
  cacheTag('actors', `actor:${actorId}`)
  // Cache life: 5 minutes - actor info changes infrequently
  cacheLife({ expire: 300 })
  
  try {
    const actorResult = await db.select({
      id: actors.id,
      name: actors.name,
      description: actors.description,
      domain: actors.domain,
      personality: actors.personality,
      tier: actors.tier,
      role: actors.role,
      initialMood: actors.initialMood,
      initialLuck: actors.initialLuck,
      postStyle: actors.postStyle,
    })
      .from(actors)
      .where(eq(actors.id, actorId))
      .limit(1)
    
    const actor = actorResult[0]
    
    if (!actor) {
      return {
        success: false,
        actor: null,
      }
    }
    
    const result = {
      success: true,
      actor: {
        id: actor.id,
        name: actor.name,
        description: actor.description,
        domain: actor.domain,
        personality: actor.personality,
        tier: actor.tier,
        role: actor.role,
        mood: actor.initialMood,
        luck: actor.initialLuck,
        postStyle: actor.postStyle,
      },
    }
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached actor:', error, 'getCachedActor')
    return {
      success: false,
      actor: null,
    }
  }
}

/**
 * Get all prediction market chats (shared)
 * Uses 'use cache: remote' for dynamic context caching
 * Cache tag: 'chats:markets' for granular invalidation
 * Cache life: 1 minute (60 seconds) - chat lists change frequently
 */
export async function getCachedMarketChats() {
  'use cache: remote'
  
  const cacheKey = 'chats:markets'
  const startTime = Date.now()
  
  cacheTag(cacheKey)
  // Cache life: 1 minute - chat lists change frequently
  cacheLife({ expire: 60 })
  
  try {
    // Get market chats
    const marketChats = await db.select({
      id: chats.id,
      name: chats.name,
      isGroup: chats.isGroup,
      updatedAt: chats.updatedAt,
    })
      .from(chats)
      .where(
        and(
          eq(chats.isGroup, true),
          eq(chats.gameId, 'continuous')
        )
      )
      .orderBy(asc(chats.createdAt))
    
    // Get message counts and last messages for each chat
    const chatsWithDetails = await Promise.all(
      marketChats.map(async (chat) => {
        // Get message count
        const countResult = await db.select({ count: count() })
          .from(messages)
          .where(eq(messages.chatId, chat.id))
        const messageCount = countResult[0]?.count || 0
        
        // Get last message
        const lastMessageResult = await db.select()
          .from(messages)
          .where(eq(messages.chatId, chat.id))
          .orderBy(desc(messages.createdAt))
          .limit(1)
        const lastMessage = lastMessageResult[0] || null
        
        return {
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup,
          messageCount,
          lastMessage,
        }
      })
    )
    
    const result = {
      success: true,
      chats: chatsWithDetails,
    }
    
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordHit(cacheKey, responseTime)
    
    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    cacheMonitoring.recordMiss(cacheKey, responseTime)
    
    logger.error('Error fetching cached market chats:', error, 'getCachedMarketChats')
    return {
      success: false,
      chats: [],
    }
  }
}

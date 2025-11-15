/**
 * A2A Message Router
 * Routes JSON-RPC 2.0 messages to appropriate handlers
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  A2AServerConfig,
  AgentConnection,
  AgentProfile,
  MarketData
} from '@/types/a2a';
import {
  A2AMethod,
  ErrorCode
} from '@/types/a2a'
import type { JsonRpcResult } from '@/types/common'
import type { PaymentVerificationParams, PaymentVerificationResult } from '@/types/payments'
import type { RegistryClient } from '@/types/a2a-server'
import type { X402Manager } from '@/types/a2a-server'
import type { IAgent0Client } from '@/agents/agent0/types'
import type { IUnifiedDiscoveryService } from '@/agents/agent0/types'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  DiscoverParamsSchema,
  GetAgentInfoParamsSchema,
  GetMarketDataParamsSchema,
  GetMarketPricesParamsSchema,
  SubscribeMarketParamsSchema,
  PaymentRequestParamsSchema,
  PaymentReceiptParamsSchema,
} from './validation'
import * as handlers from './handlers'

// Typed parameter interfaces for each method
// Note: These types are inferred from schemas but kept for potential future use

export class MessageRouter {
  private config: A2AServerConfig
  private registryClient?: RegistryClient
  private x402Manager?: X402Manager
  private agent0Client?: IAgent0Client
  private unifiedDiscovery?: IUnifiedDiscoveryService
  private marketSubscriptions: Map<string, Set<string>> = new Map() // marketId -> Set of agentIds

  constructor(
    config: A2AServerConfig | Partial<A2AServerConfig>,
    registryClient?: RegistryClient,
    x402Manager?: X402Manager,
    agent0Client?: IAgent0Client,
    unifiedDiscovery?: IUnifiedDiscoveryService
  ) {
    // Set defaults for missing config
    this.config = {
      port: config.port ?? 0,
      host: config.host ?? '0.0.0.0',
      maxConnections: config.maxConnections ?? 1000,
      messageRateLimit: config.messageRateLimit ?? 100,
      authTimeout: config.authTimeout ?? 30000,
      enableX402: config.enableX402 ?? false,
      enableCoalitions: config.enableCoalitions ?? true,
      logLevel: config.logLevel ?? 'info',
      registryClient: registryClient,
      agent0Client: agent0Client,
      unifiedDiscovery: unifiedDiscovery
    }
    this.registryClient = registryClient
    this.x402Manager = x402Manager
    this.agent0Client = agent0Client
    this.unifiedDiscovery = unifiedDiscovery
  }

  /**
   * Route incoming JSON-RPC message to appropriate handler
   */
  async route(
    agentId: string,
    request: JsonRpcRequest,
    connection: AgentConnection
  ): Promise<JsonRpcResponse> {
    if (!connection.authenticated) {
      return this.errorResponse(
        request.id,
        ErrorCode.NOT_AUTHENTICATED,
        'Connection not authenticated'
      )
    }

    switch (request.method) {
      // Agent Discovery
      case A2AMethod.DISCOVER_AGENTS:
      case 'a2a.discover':
        return await this.handleDiscover(agentId, request)
      case A2AMethod.GET_AGENT_INFO:
      case 'a2a.getInfo':
        return await this.handleGetAgentInfo(agentId, request)
      
      // Market Data
      case A2AMethod.GET_MARKET_DATA:
      case 'a2a.getMarketData':
        return await this.handleGetMarketData(agentId, request)
      case A2AMethod.GET_MARKET_PRICES:
      case 'a2a.getMarketPrices':
        return await this.handleGetMarketPrices(agentId, request)
      case A2AMethod.GET_PREDICTIONS:
      case 'a2a.getPredictions':
        return await handlers.handleGetPredictions(agentId, request)
      case A2AMethod.GET_PERPETUALS:
      case 'a2a.getPerpetuals':
        return await handlers.handleGetPerpetuals(agentId, request)
      case A2AMethod.SUBSCRIBE_MARKET:
      case 'a2a.subscribeMarket':
        return await this.handleSubscribeMarket(agentId, request)
      
      // Portfolio
      case A2AMethod.GET_BALANCE:
      case 'a2a.getBalance':
        return await this.handleGetBalance(agentId, request)
      case A2AMethod.GET_POSITIONS:
      case 'a2a.getPositions':
        return await this.handleGetPositions(agentId, request)
      case A2AMethod.GET_USER_WALLET:
      case 'a2a.getUserWallet':
        return await this.handleGetUserWallet(agentId, request)
      
      // Trading Actions
      case A2AMethod.BUY_SHARES:
      case 'a2a.buyShares':
        return await handlers.handleBuyShares(agentId, request)
      case A2AMethod.SELL_SHARES:
      case 'a2a.sellShares':
        return await handlers.handleSellShares(agentId, request)
      case A2AMethod.OPEN_POSITION:
      case 'a2a.openPosition':
        return await handlers.handleOpenPosition(agentId, request)
      case A2AMethod.CLOSE_POSITION:
      case 'a2a.closePosition':
        return await handlers.handleClosePosition(agentId, request)
      
      // Trade History
      case A2AMethod.GET_TRADES:
      case 'a2a.getTrades':
        return await handlers.handleGetTrades(agentId, request)
      case A2AMethod.GET_TRADE_HISTORY:
      case 'a2a.getTradeHistory':
        return await handlers.handleGetTradeHistory(agentId, request)
      
      // Social Features
      case A2AMethod.GET_FEED:
      case 'a2a.getFeed':
        return await handlers.handleGetFeed(agentId, request)
      case A2AMethod.GET_POST:
      case 'a2a.getPost':
        return await handlers.handleGetPost(agentId, request)
      case A2AMethod.CREATE_POST:
      case 'a2a.createPost':
        return await handlers.handleCreatePost(agentId, request)
      case A2AMethod.DELETE_POST:
      case 'a2a.deletePost':
        return await handlers.handleDeletePost(agentId, request)
      case A2AMethod.LIKE_POST:
      case 'a2a.likePost':
        return await handlers.handleLikePost(agentId, request)
      case A2AMethod.UNLIKE_POST:
      case 'a2a.unlikePost':
        return await handlers.handleUnlikePost(agentId, request)
      case A2AMethod.SHARE_POST:
      case 'a2a.sharePost':
        return await handlers.handleSharePost(agentId, request)
      case A2AMethod.GET_COMMENTS:
      case 'a2a.getComments':
        return await handlers.handleGetComments(agentId, request)
      case A2AMethod.CREATE_COMMENT:
      case 'a2a.createComment':
        return await handlers.handleCreateComment(agentId, request)
      case A2AMethod.DELETE_COMMENT:
      case 'a2a.deleteComment':
        return await handlers.handleDeleteComment(agentId, request)
      case A2AMethod.LIKE_COMMENT:
      case 'a2a.likeComment':
        return await handlers.handleLikeComment(agentId, request)
      
      // User Management
      case A2AMethod.GET_USER_PROFILE:
      case 'a2a.getUserProfile':
        return await handlers.handleGetUserProfile(agentId, request)
      case A2AMethod.UPDATE_PROFILE:
      case 'a2a.updateProfile':
        return await handlers.handleUpdateProfile(agentId, request)
      case A2AMethod.FOLLOW_USER:
      case 'a2a.followUser':
        return await handlers.handleFollowUser(agentId, request)
      case A2AMethod.UNFOLLOW_USER:
      case 'a2a.unfollowUser':
        return await handlers.handleUnfollowUser(agentId, request)
      case A2AMethod.GET_FOLLOWERS:
      case 'a2a.getFollowers':
        return await handlers.handleGetFollowers(agentId, request)
      case A2AMethod.GET_FOLLOWING:
      case 'a2a.getFollowing':
        return await handlers.handleGetFollowing(agentId, request)
      case A2AMethod.SEARCH_USERS:
      case 'a2a.searchUsers':
        return await handlers.handleSearchUsers(agentId, request)
      
      // Messaging
      case A2AMethod.GET_CHATS:
      case 'a2a.getChats':
        return await handlers.handleGetChats(agentId, request)
      case A2AMethod.GET_CHAT_MESSAGES:
      case 'a2a.getChatMessages':
        return await handlers.handleGetChatMessages(agentId, request)
      case A2AMethod.SEND_MESSAGE:
      case 'a2a.sendMessage':
        return await handlers.handleSendMessage(agentId, request)
      case A2AMethod.CREATE_GROUP:
      case 'a2a.createGroup':
        return await handlers.handleCreateGroup(agentId, request)
      case A2AMethod.LEAVE_CHAT:
      case 'a2a.leaveChat':
        return await handlers.handleLeaveChat(agentId, request)
      case A2AMethod.GET_UNREAD_COUNT:
      case 'a2a.getUnreadCount':
        return await handlers.handleGetUnreadCount(agentId, request)
      
      // Notifications
      case A2AMethod.GET_NOTIFICATIONS:
      case 'a2a.getNotifications':
        return await handlers.handleGetNotifications(agentId, request)
      case A2AMethod.MARK_NOTIFICATIONS_READ:
      case 'a2a.markNotificationsRead':
        return await handlers.handleMarkNotificationsRead(agentId, request)
      case A2AMethod.GET_GROUP_INVITES:
      case 'a2a.getGroupInvites':
        return await handlers.handleGetGroupInvites(agentId, request)
      case A2AMethod.ACCEPT_GROUP_INVITE:
      case 'a2a.acceptGroupInvite':
        return await handlers.handleAcceptGroupInvite(agentId, request)
      case A2AMethod.DECLINE_GROUP_INVITE:
      case 'a2a.declineGroupInvite':
        return await handlers.handleDeclineGroupInvite(agentId, request)
      
      // Stats & Leaderboard
      case A2AMethod.GET_LEADERBOARD:
      case 'a2a.getLeaderboard':
        return await handlers.handleGetLeaderboard(agentId, request)
      case A2AMethod.GET_USER_STATS:
      case 'a2a.getUserStats':
        return await handlers.handleGetUserStats(agentId, request)
      case A2AMethod.GET_SYSTEM_STATS:
      case 'a2a.getSystemStats':
        return await handlers.handleGetSystemStats(agentId, request)
      case A2AMethod.GET_REFERRALS:
      case 'a2a.getReferrals':
        return await handlers.handleGetReferrals(agentId, request)
      case A2AMethod.GET_REFERRAL_STATS:
      case 'a2a.getReferralStats':
        return await handlers.handleGetReferralStats(agentId, request)
      case A2AMethod.GET_REFERRAL_CODE:
      case 'a2a.getReferralCode':
        return await handlers.handleGetReferralCode(agentId, request)
      case A2AMethod.GET_REPUTATION:
      case 'a2a.getReputation':
        return await handlers.handleGetReputation(agentId, request)
      case A2AMethod.GET_REPUTATION_BREAKDOWN:
      case 'a2a.getReputationBreakdown':
        return await handlers.handleGetReputationBreakdown(agentId, request)
      case A2AMethod.GET_TRENDING_TAGS:
      case 'a2a.getTrendingTags':
        return await handlers.handleGetTrendingTags(agentId, request)
      case A2AMethod.GET_POSTS_BY_TAG:
      case 'a2a.getPostsByTag':
        return await handlers.handleGetPostsByTag(agentId, request)
      case A2AMethod.GET_ORGANIZATIONS:
      case 'a2a.getOrganizations':
        return await handlers.handleGetOrganizations(agentId, request)
      
      // Payments
      case A2AMethod.PAYMENT_REQUEST:
      case 'a2a.paymentRequest':
        return await this.handlePaymentRequest(agentId, request)
      case A2AMethod.PAYMENT_RECEIPT:
      case 'a2a.paymentReceipt':
        return await this.handlePaymentReceipt(agentId, request)
      
      // Moderation
      case A2AMethod.BLOCK_USER:
      case 'a2a.blockUser':
        return await handlers.handleBlockUser(agentId, request)
      case A2AMethod.UNBLOCK_USER:
      case 'a2a.unblockUser':
        return await handlers.handleUnblockUser(agentId, request)
      case A2AMethod.MUTE_USER:
      case 'a2a.muteUser':
        return await handlers.handleMuteUser(agentId, request)
      case A2AMethod.UNMUTE_USER:
      case 'a2a.unmuteUser':
        return await handlers.handleUnmuteUser(agentId, request)
      case A2AMethod.REPORT_USER:
      case 'a2a.reportUser':
        return await handlers.handleReportUser(agentId, request)
      case A2AMethod.REPORT_POST:
      case 'a2a.reportPost':
        return await handlers.handleReportPost(agentId, request)
      case A2AMethod.GET_BLOCKS:
      case 'a2a.getBlocks':
        return await handlers.handleGetBlocks(agentId, request)
      case A2AMethod.GET_MUTES:
      case 'a2a.getMutes':
        return await handlers.handleGetMutes(agentId, request)
      case A2AMethod.CHECK_BLOCK_STATUS:
      case 'a2a.checkBlockStatus':
        return await handlers.handleCheckBlockStatus(agentId, request)
      case A2AMethod.CHECK_MUTE_STATUS:
      case 'a2a.checkMuteStatus':
        return await handlers.handleCheckMuteStatus(agentId, request)
      
      // Points Transfer
      case A2AMethod.TRANSFER_POINTS:
      case 'a2a.transferPoints':
        return await handlers.handleTransferPoints(agentId, request)
      
      // Favorites
      case A2AMethod.FAVORITE_PROFILE:
      case 'a2a.favoriteProfile':
        return await handlers.handleFavoriteProfile(agentId, request)
      case A2AMethod.UNFAVORITE_PROFILE:
      case 'a2a.unfavoriteProfile':
        return await handlers.handleUnfavoriteProfile(agentId, request)
      case A2AMethod.GET_FAVORITES:
      case 'a2a.getFavorites':
        return await handlers.handleGetFavorites(agentId, request)
      case A2AMethod.GET_FAVORITE_POSTS:
      case 'a2a.getFavoritePosts':
        return await handlers.handleGetFavoritePosts(agentId, request)
      
      default:
        return this.errorResponse(
          request.id,
          ErrorCode.METHOD_NOT_FOUND,
          `Method ${request.method} not found`
        )
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Log request for tracking and debugging
   */
  private logRequest(agentId: string, method: string): void {
    logger.debug(`Agent ${agentId} -> ${method}`)
  }

  // ==================== Agent Discovery ====================

  private async handleDiscover(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.DISCOVER_AGENTS)
    
    const parseResult = DiscoverParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for discoverAgents');
    }
    const discoverRequest = parseResult.data;

    let agents: AgentProfile[] = []

    if (this.unifiedDiscovery) {
      const filters = {
        strategies: discoverRequest.filters?.strategies,
        markets: discoverRequest.filters?.markets,
        minReputation: discoverRequest.filters?.minReputation,
        includeExternal: process.env.AGENT0_ENABLED === 'true'
      }
      
      agents = await this.unifiedDiscovery.discoverAgents(filters)
      logger.debug(`UnifiedDiscovery found ${agents.length} agents`)
    }

    if (agents.length === 0 && this.registryClient?.discoverAgents) {
      agents = await this.registryClient.discoverAgents(discoverRequest.filters ?? undefined)
      logger.debug(`Local registry found ${agents.length} agents`)
    }

    // Apply limit if specified
    if (discoverRequest.limit && discoverRequest.limit > 0) {
      agents = agents.slice(0, discoverRequest.limit)
    }

    return {
      jsonrpc: '2.0',
      result: {
        agents,
        total: agents.length
      } as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleGetAgentInfo(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_AGENT_INFO)
    
    const parseResult = GetAgentInfoParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for getAgentInfo');
    }
    const agentInfo = parseResult.data;
    
    // Check if it's an external agent (agent0-{tokenId} format)
    if (agentInfo.agentId.startsWith('agent0-')) {
      const tokenId = parseInt(agentInfo.agentId.replace('agent0-', ''), 10)
      
      if (!isNaN(tokenId)) {
        if (this.agent0Client) {
          const profile = await this.agent0Client.getAgentProfile(tokenId)
          if (profile) {
            const agentProfile: AgentProfile = {
              agentId: agentInfo.agentId,
              tokenId: profile.tokenId,
              address: profile.walletAddress,
              name: profile.name,
              endpoint: profile.capabilities?.actions?.includes('a2a') ? '' : '',
              capabilities: profile.capabilities ?? {
                strategies: [],
                markets: [],
                actions: [],
                version: '1.0.0'
              },
              reputation: {
                totalBets: 0,
                winningBets: 0,
                accuracyScore: profile.reputation?.accuracyScore || 0,
                trustScore: profile.reputation?.trustScore || 0,
                totalVolume: '0',
                profitLoss: 0,
                isBanned: false
              },
              isActive: true
            }
            
            return {
              jsonrpc: '2.0',
              result: agentProfile as unknown as JsonRpcResult,
              id: request.id
            }
          }
        }
        
        if (this.unifiedDiscovery) {
          const profile = await this.unifiedDiscovery.getAgent(agentInfo.agentId)
          if (profile) {
            return {
              jsonrpc: '2.0',
              result: profile as unknown as JsonRpcResult,
              id: request.id
            }
          }
        }
      }
    }
    
    // Query ERC-8004 registry (local agents)
    if (this.registryClient) {
      // Extract token ID from agentId (format: "agent-{tokenId}")
      const tokenId = parseInt(agentInfo.agentId.replace('agent-', ''), 10)
      if (!isNaN(tokenId)) {
        const profile = this.registryClient?.getAgentProfile 
          ? await this.registryClient.getAgentProfile(tokenId)
          : null
        if (profile) {
          return {
            jsonrpc: '2.0',
            result: profile as unknown as JsonRpcResult,
            id: request.id
          }
        }
      }
    }

    return this.errorResponse(
      request.id,
      ErrorCode.AGENT_NOT_FOUND,
        `Agent ${agentInfo.agentId} not found`
    )
  }

  // ==================== Market Operations ====================

  private async handleGetMarketData(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_MARKET_DATA)
    
    const parseResult = GetMarketDataParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for getMarketData');
    }
    const marketRequest = parseResult.data;

    const market = await prisma.market.findUnique({
      where: { id: marketRequest.marketId }
    })
    
    if (!market) {
      return this.errorResponse(
        request.id,
        ErrorCode.MARKET_NOT_FOUND,
        `Market ${marketRequest.marketId} not found`
      )
    }
    
    const yesShares = Number(market.yesShares)
    const noShares = Number(market.noShares)
    const liquidity = Number(market.liquidity)
    
    const totalShares = yesShares + noShares
    const yesPrice = totalShares === 0 ? 0.5 : yesShares / totalShares
    const noPrice = totalShares === 0 ? 0.5 : noShares / totalShares
    
    const marketData: MarketData = {
      marketId: market.id,
      question: market.question,
      outcomes: ['YES', 'NO'],
      prices: [yesPrice, noPrice],
      volume: '0',
      liquidity: liquidity.toString(),
      resolveAt: market.endDate.getTime(),
      resolved: market.resolved
    }

    return {
      jsonrpc: '2.0',
      result: marketData as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleGetMarketPrices(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.GET_MARKET_PRICES)
    
    const parseResult = GetMarketPricesParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for getMarketPrices');
    }
    const pricesRequest = parseResult.data;

    const market = await prisma.market.findUnique({
      where: { id: pricesRequest.marketId }
    })
    
    if (!market) {
      return this.errorResponse(
        request.id,
        ErrorCode.MARKET_NOT_FOUND,
        `Market ${pricesRequest.marketId} not found`
      )
    }
    
    const yesShares = Number(market.yesShares)
    const noShares = Number(market.noShares)
    
    const totalShares = yesShares + noShares
    const yesPrice = totalShares === 0 ? 0.5 : yesShares / totalShares
    const noPrice = totalShares === 0 ? 0.5 : noShares / totalShares
    
    return {
      jsonrpc: '2.0',
      result: {
        marketId: market.id,
        prices: [
          { outcome: 'YES', price: yesPrice },
          { outcome: 'NO', price: noPrice }
        ],
        timestamp: Date.now()
      } as unknown as JsonRpcResult,
      id: request.id
    }
  }

  private async handleSubscribeMarket(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.SUBSCRIBE_MARKET)
    
    const parseResult = SubscribeMarketParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for subscribeMarket');
    }
    const subscriptionRequest = parseResult.data;

    // Add agent to subscription set for this market
    if (!this.marketSubscriptions.has(subscriptionRequest.marketId)) {
      this.marketSubscriptions.set(subscriptionRequest.marketId, new Set())
    }
    this.marketSubscriptions.get(subscriptionRequest.marketId)?.add(agentId)
    return {
      jsonrpc: '2.0',
      result: {
        subscribed: true,
        marketId: subscriptionRequest.marketId
      },
      id: request.id
    }
  }

  // ==================== User Data Operations ====================

  private async handleGetBalance(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, 'a2a.getBalance')
    
    try {
      // Get userId from params or use agentId
      const params = request.params as { userId?: string } | undefined
      const userId = params?.userId || agentId
      
      // Fetch balance from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          virtualBalance: true,
          totalDeposited: true,
          totalWithdrawn: true,
          lifetimePnL: true,
          reputationPoints: true,
        }
      })
      
      if (!user) {
        return this.errorResponse(
          request.id,
          ErrorCode.AGENT_NOT_FOUND,
          `User ${userId} not found`
        )
      }
      
      return {
        jsonrpc: '2.0',
        result: {
          balance: Number(user.virtualBalance),
          totalDeposited: Number(user.totalDeposited),
          totalWithdrawn: Number(user.totalWithdrawn),
          lifetimePnL: Number(user.lifetimePnL),
          reputationPoints: user.reputationPoints || 0
        } as unknown as JsonRpcResult,
        id: request.id
      }
    } catch (error) {
      logger.error('Error fetching balance', error)
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Failed to fetch balance'
      )
    }
  }

  private async handleGetPositions(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, 'a2a.getPositions')
    
    try {
      const params = request.params as { userId?: string } | undefined
      const userId = params?.userId || agentId
      
      // Fetch positions from database
      const [perpPositions, predictionPositions] = await Promise.all([
        prisma.perpPosition.findMany({
          where: {
            userId,
            closedAt: null,
          },
          select: {
            id: true,
            ticker: true,
            side: true,
            entryPrice: true,
            currentPrice: true,
            size: true,
            leverage: true,
            unrealizedPnL: true,
            liquidationPrice: true,
          }
        }),
        prisma.position.findMany({
          where: {
            userId,
          },
          include: {
            Market: {
              select: {
                id: true,
                question: true,
                yesShares: true,
                noShares: true,
                resolved: true,
                resolution: true,
              }
            }
          }
        })
      ])
      
      // Format perp positions
      const formattedPerpPositions = perpPositions.map(p => ({
        id: p.id,
        ticker: p.ticker,
        side: p.side,
        size: Number(p.size),
        entryPrice: Number(p.entryPrice),
        currentPrice: Number(p.currentPrice),
        leverage: p.leverage,
        unrealizedPnL: Number(p.unrealizedPnL),
        liquidationPrice: Number(p.liquidationPrice),
      }))
      
      // Format prediction positions
      const formattedMarketPositions = predictionPositions.map(p => {
        const yesShares = Number(p.Market.yesShares)
        const noShares = Number(p.Market.noShares)
        const totalShares = yesShares + noShares
        const currentPrice = totalShares === 0 ? 0.5 : (String(p.side) === 'YES' ? yesShares / totalShares : noShares / totalShares)
        const avgPrice = Number(p.avgPrice)
        const shares = Number(p.shares)
        const unrealizedPnL = (currentPrice * shares) - (avgPrice * shares)
        
        return {
          id: p.id,
          marketId: p.Market.id,
          question: p.Market.question,
          side: p.side,
          shares,
          avgPrice,
          currentPrice,
          unrealizedPnL,
        }
      })
      
      return {
        jsonrpc: '2.0',
        result: {
          perpPositions: formattedPerpPositions,
          marketPositions: formattedMarketPositions,
        } as unknown as JsonRpcResult,
        id: request.id
      }
    } catch (error) {
      logger.error('Error fetching positions', error)
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Failed to fetch positions'
      )
    }
  }

  private async handleGetUserWallet(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, 'a2a.getUserWallet')
    
    try {
      const params = request.params as { userId: string } | undefined
      if (!params?.userId) {
        return this.errorResponse(
          request.id,
          ErrorCode.INVALID_PARAMS,
          'userId is required'
        )
      }
      
      const userId = params.userId
      
      // Fetch both balance and positions
      const [balanceResponse, positionsResponse] = await Promise.all([
        this.handleGetBalance(agentId, { ...request, params: { userId } }),
        this.handleGetPositions(agentId, { ...request, params: { userId } })
      ])
      
      if (balanceResponse.error || positionsResponse.error) {
        return this.errorResponse(
          request.id,
          ErrorCode.INTERNAL_ERROR,
          'Failed to fetch wallet data'
        )
      }
      
      return {
        jsonrpc: '2.0',
        result: {
          balance: balanceResponse.result,
          positions: positionsResponse.result,
        } as unknown as JsonRpcResult,
        id: request.id
      }
    } catch (error) {
      logger.error('Error fetching user wallet', error)
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Failed to fetch user wallet'
      )
    }
  }

  // ==================== x402 Micropayments ====================

  private async handlePaymentRequest(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.PAYMENT_REQUEST)
    
    const parseResult = PaymentRequestParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
        return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for payment request');
    }
    const paymentRequest = parseResult.data;

    if (!paymentRequest.to || !paymentRequest.amount || !paymentRequest.service) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: to, amount, and service are required'
      )
    }
    if (!this.config.enableX402) {
      return this.errorResponse(
        request.id,
        ErrorCode.METHOD_NOT_FOUND,
        'x402 payments not enabled'
      )
    }

    if (!this.x402Manager) {
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Payment system not configured'
      )
    }

    const from = paymentRequest.from || ''

    const createdPaymentRequest = await this.x402Manager.createPaymentRequest(
      from,
      paymentRequest.to,
      paymentRequest.amount,
      paymentRequest.service,
      paymentRequest.metadata as Record<string, string | number | boolean | null> | undefined
    )

    return {
      jsonrpc: '2.0',
      result: {
        requestId: createdPaymentRequest.requestId,
        amount: createdPaymentRequest.amount,
        expiresAt: createdPaymentRequest.expiresAt
      },
      id: request.id
    }
  }

  private async handlePaymentReceipt(agentId: string, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.logRequest(agentId, A2AMethod.PAYMENT_RECEIPT)
    
    const parseResult = PaymentReceiptParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
        return this.errorResponse(request.id, ErrorCode.INVALID_PARAMS, 'Invalid params for payment receipt');
    }
    const receipt = parseResult.data;

    if (!receipt.requestId || !receipt.txHash) {
      return this.errorResponse(
        request.id,
        ErrorCode.INVALID_PARAMS,
        'Invalid params: requestId and txHash are required'
      )
    }
    if (!this.config.enableX402) {
      return this.errorResponse(
        request.id,
        ErrorCode.METHOD_NOT_FOUND,
        'x402 payments not enabled'
      )
    }

    if (!this.x402Manager) {
      return this.errorResponse(
        request.id,
        ErrorCode.INTERNAL_ERROR,
        'Payment system not configured'
      )
    }

    const storedPaymentRequest = await this.x402Manager.getPaymentRequest(receipt.requestId)
    if (!storedPaymentRequest) {
      return this.errorResponse(
        request.id,
        ErrorCode.PAYMENT_FAILED,
        'Payment request not found or expired'
      )
    }

    const verificationData: PaymentVerificationParams = {
      requestId: receipt.requestId,
      txHash: receipt.txHash,
      from: storedPaymentRequest.from,
      to: storedPaymentRequest.to,
      amount: storedPaymentRequest.amount,
      timestamp: Date.now(),
      confirmed: false
    }
    const verificationResult: PaymentVerificationResult = await this.x402Manager.verifyPayment(verificationData)

    if (!verificationResult.verified) {
      return {
        jsonrpc: '2.0',
        result: {
          verified: false,
          message: verificationResult.error || 'Payment verification failed'
        },
        id: request.id
      }
    }

    return {
      jsonrpc: '2.0',
      result: {
        verified: true,
        message: 'Payment verified successfully'
      },
      id: request.id
    }
  }

  // ==================== Utility Methods ====================

  private errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      error: {
        code,
        message
      },
      id
    }
  }

  /**
   * Get subscribers for a market (used by server for notifications)
   */
  getMarketSubscribers(marketId: string): string[] {
    const subscribers = this.marketSubscriptions.get(marketId)
    return subscribers ? Array.from(subscribers) : []
  }
}

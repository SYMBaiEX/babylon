/**
 * MCP (Model Context Protocol) Server Endpoint
 * 
 * Exposes Babylon's capabilities as MCP tools for agent discovery.
 * Agents can query this endpoint to discover available tools.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { verifyAgentSession } from '@/lib/auth/agent-auth'
import { verifyMessage } from 'ethers'
import { prisma } from '@/lib/database-service'
import { getMCPToolRegistry } from '@/lib/mcp/tool-registry'
import { verifyMCPToken } from '@/lib/auth/mcp-auth'
import { getAgentLifecycleManager } from '@/lib/agents/lifecycle/AgentLifecycleManager'
import { getCache, setCache } from '@/lib/cache-service'
import { getProtocolBridge } from '@/lib/protocols/ProtocolBridge'

/**
 * GET /mcp - Get MCP server info and available tools
 * Uses dynamic tool registry for discoverability
 */
export async function GET(request: NextRequest) {
  logger.debug('MCP endpoint accessed', { url: request.url }, 'MCP')
  
  // Get tools from registry
  const toolRegistry = getMCPToolRegistry()
  const tools = toolRegistry.getTools()
  
  // MCP server info endpoint
  return NextResponse.json({
    name: 'Babylon Prediction Markets',
    version: '1.0.0',
    description: 'Real-time prediction market game with autonomous AI agents',
    protocols: ['mcp', 'a2a'],
    
    tools: tools.length > 0 ? tools : [
      // Fallback to inline tools if registry is empty (shouldn't happen)
      {
        name: 'get_markets',
        description: 'Get all active prediction markets',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['prediction', 'perpetuals', 'all'],
              description: 'Market type to filter'
            }
          }
        }
      },
      {
        name: 'place_bet',
        description: 'Place a bet on a prediction market',
        inputSchema: {
          type: 'object',
          properties: {
            marketId: { type: 'string', description: 'Market ID' },
            side: { type: 'string', enum: ['YES', 'NO'], description: 'Bet side' },
            amount: { type: 'number', description: 'Bet amount in points' }
          },
          required: ['marketId', 'side', 'amount']
        }
      },
      {
        name: 'get_balance',
        description: "Get your current balance and P&L",
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_positions',
        description: 'Get all open positions',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'close_position',
        description: 'Close an open position',
        inputSchema: {
          type: 'object',
          properties: {
            positionId: { type: 'string', description: 'Position ID to close' }
          },
          required: ['positionId']
        }
      },
      {
        name: 'get_market_data',
        description: 'Get detailed data for a specific market',
        inputSchema: {
          type: 'object',
          properties: {
            marketId: { type: 'string', description: 'Market ID' }
          },
          required: ['marketId']
        }
      },
      {
        name: 'query_feed',
        description: 'Query the social feed for posts',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of posts to return', default: 20 },
            questionId: { type: 'string', description: 'Filter by question ID' }
          }
        }
      }
    ],
    
    // Gap 22: MCP Prompts
    prompts: [
      {
        name: 'analyze_market',
        description: 'Analyze a prediction market and provide insights',
        arguments: [
          { name: 'marketId', description: 'Market to analyze', required: true },
          { name: 'depth', description: 'Analysis depth: basic, detailed, comprehensive', required: false }
        ]
      },
      {
        name: 'recommend_bet',
        description: 'Get betting recommendation for a market',
        arguments: [
          { name: 'marketId', description: 'Market to analyze', required: true },
          { name: 'riskTolerance', description: 'Risk tolerance: low, medium, high', required: false }
        ]
      },
      {
        name: 'summarize_feed',
        description: 'Summarize recent activity in the feed',
        arguments: [
          { name: 'limit', description: 'Number of posts to summarize', required: false }
        ]
      }
    ],
    
    // Gap 23: MCP Resources
    resources: [
      {
        uri: 'babylon://markets',
        name: 'Active Markets',
        description: 'List of all active prediction markets',
        mimeType: 'application/json'
      },
      {
        uri: 'babylon://leaderboard',
        name: 'Leaderboard',
        description: 'Top performing agents and users',
        mimeType: 'application/json'
      },
      {
        uri: 'babylon://agents',
        name: 'Agent Directory',
        description: 'Registered agents in the network',
        mimeType: 'application/json'
      },
      {
        uri: 'babylon://feed',
        name: 'Social Feed',
        description: 'Latest posts and discussions',
        mimeType: 'application/json'
      }
    ]
  })
}

/**
 * POST /mcp - Execute MCP tool
 * Enhanced with context persistence and caching
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { tool, arguments: args, auth } = body
  
  // Authenticate agent
  const agent = await authenticateAgent(auth)
  if (!agent) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // Get protocol bridge
  const protocolBridge = getProtocolBridge()
  
  // Check cache for read-only tools using existing cache-service
  const cacheableTools = ['get_markets', 'get_market_data', 'query_feed', 'get_balance', 'get_positions']
  if (cacheableTools.includes(tool)) {
    const cacheKey = `mcp:${tool}:${JSON.stringify(args || {})}`
    const cached = await getCache<Record<string, unknown>>(cacheKey, { 
      namespace: 'mcp',
      ttl: 30 // 30 seconds
    })
    if (cached) {
      logger.debug(`Cache hit for ${tool}`, { agentId: agent.agentId }, 'MCP')
      return NextResponse.json(cached)
    }
  }
  
  // Execute tool
  let result: NextResponse
  switch (tool) {
    case 'get_markets':
      result = await executeGetMarkets(args, agent)
      break
    case 'place_bet':
      result = await executePlaceBet(agent, args)
      break
    case 'get_balance':
      result = await executeGetBalance(agent)
      break
    case 'get_positions':
      result = await executeGetPositions(agent)
      break
    case 'close_position':
      result = await executeClosePosition(agent, args)
      break
    case 'get_market_data':
      result = await executeGetMarketData(agent, args)
      break
    case 'query_feed':
      result = await executeQueryFeed(agent, args)
      break
    default:
      return NextResponse.json(
        { error: `Unknown tool: ${tool}` },
        { status: 400 }
      )
  }
  
  // Parse result for caching and context
  const resultData = await result.json()
  
  // Cache result for read-only tools using existing cache-service
  if (cacheableTools.includes(tool)) {
    const cacheKey = `mcp:${tool}:${JSON.stringify(args || {})}`
    await setCache(cacheKey, resultData, { 
      namespace: 'mcp',
      ttl: 30 // 30 seconds
    })
  }
  
  // Store execution in context using existing cache-service
  const contextKey = `mcp:context:${agent.agentId}`
  const existingContext = await getCache<{
    history: Array<{ tool: string; args: Record<string, unknown>; result: unknown; timestamp: number }>
    state: Record<string, unknown>
  }>(contextKey, { namespace: 'mcp' }) || { history: [], state: {} }
  
  existingContext.history.push({
    tool,
    args: args || {},
    result: resultData,
    timestamp: Date.now()
  })
  
  // Keep last 100 items
  if (existingContext.history.length > 100) {
    existingContext.history = existingContext.history.slice(-100)
  }
  
  await setCache(contextKey, existingContext, {
    namespace: 'mcp',
    ttl: 3600 // 1 hour
  })
  
  // Notify protocol bridge for cross-protocol sync
  await protocolBridge.onMCPToolExecuted({
    tool,
    args: args || {},
    result: resultData,
    agentId: agent.agentId,
    timestamp: Date.now()
  })
  
  return NextResponse.json(resultData)
}

/**
 * Authenticate agent from MCP request
 * Enhanced with JWT support (Gap 9)
 */
async function authenticateAgent(auth: {
  agentId?: string
  token?: string
  address?: string
  signature?: string
  timestamp?: number
}): Promise<{ agentId: string; userId: string } | null> {
  // Method 1: JWT Token (Gap 9 - preferred method)
  if (auth.token && auth.token.startsWith('eyJ')) {
    const decoded = verifyMCPToken(auth.token)
    if (decoded) {
      // Emit lifecycle event
      const lifecycleManager = getAgentLifecycleManager()
      await lifecycleManager.onAgentAuthenticatedMCP(decoded.agentId, decoded.userId)
      
      return {
        agentId: decoded.agentId,
        userId: decoded.userId
      }
    }
    
    logger.warn('Invalid or expired JWT token', undefined, 'MCP Auth')
    return null
  }
  
  // Method 2: Legacy Session Token (from /api/agents/auth)
  if (auth.token) {
    const session = await verifyAgentSession(auth.token)
    if (session) {
      // Find user ID for this agent
      const user = await prisma.user.findUnique({
        where: { username: session.agentId }
      })
      
      const result = {
        agentId: session.agentId,
        userId: user?.id || session.agentId
      }
      
      // Emit lifecycle event
      const lifecycleManager = getAgentLifecycleManager()
      await lifecycleManager.onAgentAuthenticatedMCP(result.agentId, result.userId)
      
      return result
    }
    
    logger.warn('Invalid or expired agent session token', undefined, 'MCP Auth')
    return null
  }
  
  // Method 2: Wallet Signature (similar to A2A authentication)
  if (auth.agentId && auth.address && auth.signature && auth.timestamp) {
    // Validate timestamp (must be within 5 minutes)
    const now = Date.now()
    const timeDiff = Math.abs(now - auth.timestamp)
    if (timeDiff > 5 * 60 * 1000) {
      logger.warn('Authentication timestamp expired', undefined, 'MCP Auth')
      return null
    }
    
    // Verify signature
    const message = `MCP Authentication\n\nAgent ID: ${auth.agentId}\nAddress: ${auth.address}\nTimestamp: ${auth.timestamp}`
    const recoveredAddress = verifyMessage(message, auth.signature)
    
    if (recoveredAddress.toLowerCase() !== auth.address.toLowerCase()) {
      logger.warn('Invalid signature for MCP authentication', undefined, 'MCP Auth')
      return null
    }
    
    // Find user for this agent
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: auth.agentId },
          { walletAddress: auth.address.toLowerCase() }
        ]
      }
    })
    
    return {
      agentId: auth.agentId,
      userId: user?.id || auth.agentId
    }
  }
  
  logger.warn('No valid authentication method provided', undefined, 'MCP Auth')
  return null
}

/**
 * Execute get_markets tool
 */
async function executeGetMarkets(
  args: { type?: string },
  agent: { agentId: string; userId: string }
) {
  logger.debug(`Agent ${agent.agentId} requesting markets (type: ${args.type || 'all'})`, undefined, 'MCP')
  
  const where: { resolved?: boolean } = {}
  if (args.type === 'prediction') {
    // Only prediction markets
  } else if (args.type === 'perpetuals') {
    // Only perpetuals (not implemented yet)
    return NextResponse.json({ markets: [] })
  }
  
  const markets = await prisma.market.findMany({
    where: {
      resolved: false,
      ...where
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  
  return NextResponse.json({
    markets: markets.map(m => ({
      id: m.id,
      question: m.question,
      yesShares: m.yesShares.toString(),
      noShares: m.noShares.toString(),
      liquidity: m.liquidity.toString(),
      endDate: m.endDate.toISOString()
    }))
  })
}

/**
 * Execute place_bet tool
 */
async function executePlaceBet(
  agent: { agentId: string; userId: string },
  args: { marketId: string; side: 'YES' | 'NO'; amount: number }
) {
  logger.info(`Agent ${agent.agentId} placing bet:`, args, 'MCP')
  
  // Call the existing market API logic
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/markets/${args.marketId}/bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: agent.userId,
      side: args.side,
      amount: args.amount
    })
  })
  
  const result = await response.json()
  return NextResponse.json(result)
}

/**
 * Execute get_balance tool
 */
async function executeGetBalance(agent: { agentId: string; userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: agent.userId },
    select: {
      virtualBalance: true,
      lifetimePnL: true
    }
  })
  
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  
  return NextResponse.json({
    balance: user.virtualBalance.toString(),
    lifetimePnL: user.lifetimePnL.toString()
  })
}

/**
 * Execute get_positions tool
 */
async function executeGetPositions(agent: { agentId: string; userId: string }) {
  const positions = await prisma.position.findMany({
    where: { userId: agent.userId },
    include: { Market: true }
  })
  
  return NextResponse.json({
    positions: positions.map(p => ({
      id: p.id,
      marketId: p.marketId,
      question: p.Market.question,
      side: p.side ? 'YES' : 'NO',
      shares: p.shares.toString(),
      avgPrice: p.avgPrice.toString()
    }))
  })
}

/**
 * Execute close_position tool
 */
async function executeClosePosition(
  agent: { agentId: string; userId: string },
  args: { positionId: string }
) {
  logger.info(`Agent ${agent.agentId} closing position:`, args, 'MCP')
  
  // Call the existing close position API logic
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/positions/${args.positionId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: agent.userId
    })
  })
  
  const result = await response.json()
  return NextResponse.json(result)
}

/**
 * Execute get_market_data tool
 */
async function executeGetMarketData(
  agent: { agentId: string; userId: string },
  args: { marketId: string }
) {
  logger.debug(`Agent ${agent.agentId} requesting market data for ${args.marketId}`, undefined, 'MCP')
  
  const market = await prisma.market.findUnique({
    where: { id: args.marketId }
  })
  
  if (!market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }
  
  return NextResponse.json({
    id: market.id,
    question: market.question,
    description: market.description,
    yesShares: market.yesShares.toString(),
    noShares: market.noShares.toString(),
    liquidity: market.liquidity.toString(),
    resolved: market.resolved,
    resolution: market.resolution,
    endDate: market.endDate.toISOString()
  })
}

/**
 * Execute query_feed tool
 */
async function executeQueryFeed(
  agent: { agentId: string; userId: string },
  args: { limit?: number; questionId?: string }
) {
  logger.debug(`Agent ${agent.agentId} querying feed`, args, 'MCP')
  
  const posts = await prisma.post.findMany({
    where: args.questionId ? {
      // Filter by question if provided
      // Note: questionId might need to be mapped from market/question
      deletedAt: null, // Filter out deleted posts
    } : {
      deletedAt: null, // Filter out deleted posts
    },
    orderBy: { timestamp: 'desc' },
    take: args.limit || 20
  })
  
  return NextResponse.json({
    posts: posts.map(p => ({
      id: p.id,
      content: p.content,
      authorId: p.authorId,
      timestamp: p.timestamp.toISOString()
    }))
  })
}

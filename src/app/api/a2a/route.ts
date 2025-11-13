/**
 * A2A Protocol Endpoint
 * POST /api/a2a
 * 
 * Handles all A2A JSON-RPC 2.0 requests over HTTP
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { MessageRouter } from '@/lib/a2a/message-router'
import { logger } from '@/lib/logger'
import type { JsonRpcRequest, JsonRpcResponse, AgentConnection } from '@/types/a2a'

export const dynamic = 'force-dynamic'

// Create a singleton message router
let messageRouter: MessageRouter | null = null

function getMessageRouter(): MessageRouter {
  if (!messageRouter) {
    // Initialize with default config
    const config = {
      port: 0, // Not used for HTTP
      host: '0.0.0.0',
      maxConnections: 1000,
      messageRateLimit: 100,
      authTimeout: 30000,
      enableX402: false,
      enableCoalitions: true,
      logLevel: 'info' as const
    }
    messageRouter = new MessageRouter(config)
  }
  return messageRouter
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as JsonRpcRequest
    
    // Validate JSON-RPC 2.0 format
    if (body.jsonrpc !== '2.0') {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"'
        },
        id: body.id || null
      }, { status: 400 })
    }

    if (!body.method || typeof body.method !== 'string') {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: method is required'
        },
        id: body.id || null
      }, { status: 400 })
    }

    // Extract agent ID from headers or body
    const agentId = req.headers.get('x-agent-id') || 'anonymous'
    
    // Create connection context
    // For HTTP, we consider all requests authenticated
    // In production, you'd verify JWT tokens or API keys here
    const connection: AgentConnection = {
      authenticated: true,
      agentId,
      address: req.headers.get('x-agent-address') || '',
      tokenId: parseInt(req.headers.get('x-agent-token-id') || '0'),
      capabilities: {
        strategies: [],
        markets: [],
        actions: [],
        version: '1.0.0'
      },
      connectedAt: Date.now(),
      lastActivity: Date.now()
    }

    logger.info('A2A Request received', {
      method: body.method,
      agentId,
      id: body.id
    })

    // Route the request
    const router = getMessageRouter()
    const response: JsonRpcResponse = await router.route(agentId, body, connection)

    // Return JSON-RPC response
    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('A2A Request error', error)
    
    return NextResponse.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      },
      id: null
    }, { status: 500 })
  }
}

// Optional: Support GET for debugging/health check
export async function GET() {
  return NextResponse.json({
    service: 'Babylon A2A Protocol',
    version: '1.0.0',
    status: 'active',
    endpoint: '/api/a2a',
    agentCard: '/.well-known/agent-card.json'
  })
}


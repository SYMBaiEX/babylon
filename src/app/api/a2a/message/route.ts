/**
 * A2A Protocol Message Endpoint
 *
 * POST /api/a2a/message
 *
 * Receives JSON-RPC 2.0 A2A protocol messages from external agents
 * Routes messages to internal agents or external agents via CommunicationHub
 *
 * @see https://github.com/google/a2a for A2A protocol specification
 * @see src/lib/agents/communication/CommunicationHub.ts
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCommunicationHub } from '@/lib/agents/communication/CommunicationHub'
import { verifyApiKey } from '@/lib/crypto/api-keys'
import { prisma } from '@/lib/prisma'
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from '@/types/a2a'
import { ErrorCode } from '@/types/a2a'
import type { JsonValue } from '@/types/common'

// Message part type for A2A protocol
interface MessagePart {
  type: string
  content: string
}

// JSON-RPC 2.0 request validation
const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Authenticate the request using API key from Authorization header
 */
async function authenticateRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const apiKey = authHeader.substring(7) // Remove 'Bearer ' prefix

  // Find external agent with matching API key hash
  const agents = await prisma.externalAgentConnection.findMany({
    include: {
      AgentRegistry: true,
    },
  })

  for (const agent of agents) {
    try {
      // Extract API key hash from authCredentials
      const credentials = agent.authCredentials
        ? JSON.parse(agent.authCredentials)
        : null

      if (credentials?.apiKeyHash && verifyApiKey(apiKey, credentials.apiKeyHash)) {
        return agent.externalId
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Create JSON-RPC 2.0 error response
 */
function createErrorResponse(
  id: string | number | null,
  code: ErrorCode,
  message: string,
  data?: JsonValue
): NextResponse<JsonRpcResponse> {
  const error: JsonRpcError = {
    code,
    message,
    ...(data !== undefined && { data }),
  }

  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error,
  })
}

/**
 * POST /api/a2a/message
 *
 * Handle A2A protocol messages from external agents
 */
export async function POST(req: NextRequest) {
  let requestId: string | number | null = null

  try {
    // Authenticate the request
    const externalId = await authenticateRequest(req)

    if (!externalId) {
      return createErrorResponse(
        null,
        ErrorCode.NOT_AUTHENTICATED,
        'Invalid or missing API key'
      )
    }

    // Parse and validate JSON-RPC request
    const body = await req.json()
    const validated = JsonRpcRequestSchema.parse(body) as JsonRpcRequest
    requestId = validated.id

    // Get communication hub
    const hub = getCommunicationHub()

    // Route message based on method
    const method = validated.method
    const params = validated.params || {}

    // Handle different A2A methods
    switch (method) {
      case 'message/send': {
        // Type guard: params must be an object, not an array
        if (!params || Array.isArray(params)) {
          return createErrorResponse(
            requestId,
            ErrorCode.INVALID_PARAMS,
            'Invalid params: expected object'
          )
        }

        // Extract message parameters with type-safe access
        const to = params.to as string | undefined
        const parts = params.parts as MessagePart[] | undefined
        const contextId = params.contextId as string | undefined
        const metadata = (params.metadata as Record<string, JsonValue>) || {}

        if (!to || !Array.isArray(parts) || parts.length === 0) {
          return createErrorResponse(
            requestId,
            ErrorCode.INVALID_PARAMS,
            'Missing required parameters: to, parts'
          )
        }

        // Extract text content from parts
        const content = parts
          .filter((part: MessagePart) => part.type === 'text')
          .map((part: MessagePart) => part.content)
          .join('\n')

        // Send message via communication hub
        const response = await hub.sendMessage(
          externalId,
          to,
          'a2a-message',
          content,
          metadata,
          contextId
        )

        if (!response.success) {
          return createErrorResponse(
            requestId,
            ErrorCode.INTERNAL_ERROR,
            response.error || 'Message delivery failed'
          )
        }

        // Return successful JSON-RPC response
        return NextResponse.json({
          jsonrpc: '2.0',
          id: requestId,
          result: {
            messageId: response.messageId,
            status: 'delivered',
            data: response.data,
          },
        })
      }

      case 'message/stream': {
        // TODO: Implement streaming message support
        return createErrorResponse(
          requestId,
          ErrorCode.METHOD_NOT_FOUND,
          'Streaming not yet implemented'
        )
      }

      case 'agent/discover': {
        // TODO: Implement agent discovery
        return createErrorResponse(
          requestId,
          ErrorCode.METHOD_NOT_FOUND,
          'Discovery not yet implemented'
        )
      }

      default:
        return createErrorResponse(
          requestId,
          ErrorCode.METHOD_NOT_FOUND,
          `Method not found: ${method}`
        )
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        requestId,
        ErrorCode.INVALID_REQUEST,
        'Invalid JSON-RPC request format',
        JSON.parse(JSON.stringify(error.issues)) as JsonValue
      )
    }

    if (error instanceof SyntaxError) {
      return createErrorResponse(
        null,
        ErrorCode.PARSE_ERROR,
        'Invalid JSON'
      )
    }

    console.error('[A2A] Message handling error:', error)

    return createErrorResponse(
      requestId,
      ErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal server error'
    )
  }
}

/**
 * GET /api/a2a/message
 *
 * Return API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/a2a/message',
    protocol: 'A2A (Agent-to-Agent)',
    version: '1.0',
    spec: 'JSON-RPC 2.0',
    authentication: {
      type: 'Bearer token',
      header: 'Authorization: Bearer <api_key>',
      obtain: 'POST /api/agents/external/register',
    },
    methods: {
      'message/send': {
        description: 'Send a message to an agent',
        params: {
          to: 'string (agent ID)',
          parts: 'array<{type: string, content: any}>',
          contextId: 'string (optional, for conversation continuity)',
          metadata: 'object (optional)',
        },
        returns: {
          messageId: 'string',
          status: 'string',
          data: 'any',
        },
      },
      'message/stream': {
        description: 'Stream messages (not yet implemented)',
        status: 'coming soon',
      },
      'agent/discover': {
        description: 'Discover available agents (not yet implemented)',
        status: 'coming soon',
      },
    },
    example: {
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          to: 'agent-123',
          parts: [
            {
              type: 'text',
              content: 'Hello from external agent!',
            },
          ],
          contextId: 'conversation-456',
          metadata: {
            priority: 'normal',
          },
        },
      },
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          messageId: 'msg-789',
          status: 'delivered',
          data: {
            delivered: true,
            protocol: 'internal',
          },
        },
      },
    },
  })
}

/**
 * A2A Protocol Endpoint
 *
 * Implements the standard A2A protocol using @a2a-js/sdk.
 * Handles Agent-to-Agent JSON-RPC 2.0 requests over HTTP.
 *
 * @openapi
 * /api/a2a:
 *   post:
 *     tags:
 *       - A2A Protocol
 *     summary: A2A JSON-RPC endpoint
 *     description: Handles all Agent-to-Agent JSON-RPC 2.0 requests over HTTP for autonomous agent communication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jsonrpc
 *               - method
 *             properties:
 *               jsonrpc:
 *                 type: string
 *                 enum: ["2.0"]
 *               method:
 *                 type: string
 *                 description: A2A method name (e.g., message/send, tasks/get)
 *               params:
 *                 type: object
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: JSON-RPC response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jsonrpc:
 *                   type: string
 *                 result:
 *                   type: object
 *                 error:
 *                   type: object
 *                 id:
 *                   type: string
 *   get:
 *     tags:
 *       - A2A Protocol
 *     summary: A2A service info
 *     description: Returns A2A protocol service information and agent card endpoint.
 *     responses:
 *       200:
 *         description: Service info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 version:
 *                   type: string
 *                 status:
 *                   type: string
 *                 endpoint:
 *                   type: string
 *                 agentCard:
 *                   type: string
 */

import {
  DefaultExecutionEventBusManager,
  DefaultRequestHandler,
  JsonRpcTransportHandler,
} from '@a2a-js/sdk/server';
import {
  type AuthResult,
  BabylonAgentExecutor,
  babylonAgentCard,
  ExtendedTaskStore,
  getServerApiKey,
  validateApiKeyAsync,
} from '@babylon/a2a';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Initialize A2A protocol components
const taskStore = new ExtendedTaskStore();
const executor = new BabylonAgentExecutor();
const eventBusManager = new DefaultExecutionEventBusManager();
const requestHandler = new DefaultRequestHandler(
  babylonAgentCard,
  taskStore,
  executor,
  eventBusManager
);
const jsonRpcHandler = new JsonRpcTransportHandler(requestHandler);

export const dynamic = 'force-dynamic';

/**
 * Validates API key from request headers.
 * Supports both server API key and per-user API keys.
 *
 * @param request - Next.js request object
 * @returns Object with error response if auth fails, or auth result if valid
 */
async function checkApiKey(request: NextRequest): Promise<{
  error?: NextResponse;
  authResult?: AuthResult;
}> {
  const authResult = await validateApiKeyAsync(
    {
      headers: {
        get: (name: string) => request.headers.get(name),
      },
      host: request.headers.get('host') ?? undefined,
    },
    {
      serverApiKey: getServerApiKey(),
      allowUserApiKeys: true,
      // Only allow localhost bypass in non-production to prevent Host header spoofing
      allowLocalhost: process.env.NODE_ENV !== 'production',
    }
  );

  if (!authResult.authenticated) {
    return {
      error: NextResponse.json(
        { error: authResult.error },
        {
          status: authResult.statusCode || 401,
          headers:
            authResult.statusCode === 401
              ? {
                  'WWW-Authenticate':
                    'ApiKey realm="Babylon", header="X-Babylon-Api-Key"',
                }
              : undefined,
        }
      ),
    };
  }

  return { authResult };
}

/**
 * POST /api/a2a
 *
 * Handles JSON-RPC 2.0 A2A protocol requests. Processes agent-to-agent communication
 * tasks including message sending, task execution, and agent discovery.
 *
 * Supports authentication via:
 * - Server API key (BABYLON_A2A_API_KEY)
 * - Per-user API keys (from userApiKeys table)
 *
 * @param request - Next.js request containing JSON-RPC 2.0 A2A protocol message
 * @returns JSON-RPC 2.0 response with result or error
 * @throws {401} Invalid or missing API key
 */
export async function POST(request: NextRequest) {
  const { error, authResult } = await checkApiKey(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error: Invalid JSON' },
        id: null,
      },
      { status: 400 }
    );
  }

  logger.info('Official A2A request', {
    method: body.method,
    taskId: body.params?.message?.taskId,
    authMethod: authResult?.authMethod,
    userId: authResult?.userId,
  });

  // User-scoped execution: When authenticated via user API key, authResult.userId
  // contains the user ID. To enable user-specific operations:
  // 1. Update BabylonAgentExecutor.execute() to accept optional userId parameter
  // 2. Propagate userId to downstream service calls (trading, social, etc.)
  // 3. Add feature flag ENABLE_USER_SCOPED_A2A_EXECUTION for gradual rollout

  // Use the JSON-RPC transport handler
  const response = await jsonRpcHandler.handle(body);

  return NextResponse.json(response, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * GET /api/a2a
 *
 * Returns the Babylon agent card (capabilities, endpoints, metadata) for A2A protocol discovery.
 * Provides agent information for external agents to discover and interact with this agent.
 *
 * Supports authentication via:
 * - Server API key (BABYLON_A2A_API_KEY)
 * - Per-user API keys (from userApiKeys table)
 *
 * @param request - Next.js request (API key required in X-Babylon-Api-Key header)
 * @returns Agent card JSON with capabilities and metadata
 * @throws {401} Invalid or missing API key
 */
export async function GET(request: NextRequest) {
  const { error } = await checkApiKey(request);
  if (error) return error;

  return NextResponse.json(babylonAgentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

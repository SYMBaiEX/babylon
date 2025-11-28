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
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  babylonAgentCard,
  BabylonAgentExecutor,
  ExtendedTaskStore,
  validateApiKey,
  getRequiredApiKey,
} from '@babylon/a2a';
import { logger } from '@babylon/shared';

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
 *
 * @param request - Next.js request object
 * @returns NextResponse with error if authentication fails, null if valid
 */
function checkApiKey(request: NextRequest): NextResponse | null {
  const authResult = validateApiKey(
    {
      headers: {
        get: (name: string) => request.headers.get(name),
      },
      host: request.headers.get('host') ?? undefined,
    },
    { requiredApiKey: getRequiredApiKey() }
  );

  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: authResult.error },
      {
        status: authResult.statusCode || 401,
        headers: authResult.statusCode === 401
          ? { 'WWW-Authenticate': 'ApiKey realm="Babylon", header="X-Babylon-Api-Key"' }
          : undefined,
      }
    );
  }

  return null;
}

/**
 * POST /api/a2a
 *
 * Handles A2A protocol JSON-RPC 2.0 requests.
 * Supports methods: message/send, message/stream, tasks/get, tasks/cancel, tasks/list
 *
 * @param request - Next.js request containing JSON-RPC payload
 * @returns JSON-RPC response with result or error
 */
/**
 * POST /api/a2a
 *
 * Handles JSON-RPC 2.0 A2A protocol requests. Processes agent-to-agent communication
 * tasks including message sending, task execution, and agent discovery. Validates
 * API key authentication and routes requests to the appropriate executor.
 *
 * @param request - Next.js request containing JSON-RPC 2.0 A2A protocol message
 * @returns JSON-RPC 2.0 response with result or error
 * @throws {401} Invalid or missing API key
 */
export async function POST(request: NextRequest) {
  try {
    const authError = checkApiKey(request);
    if (authError) return authError;

    const body = await request.json();

    logger.info('Official A2A request', {
      method: body.method,
      taskId: body.params?.message?.taskId,
    });

    // Use the JSON-RPC transport handler
    const response = await jsonRpcHandler.handle(body);

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('Official A2A error', error);

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: (error as Error).message || 'Internal server error',
        },
        id: null,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/a2a
 *
 * Returns the Babylon agent card for A2A protocol discovery.
 *
 * @param request - Next.js request object
 * @returns Agent card JSON with service information
 */
/**
 * GET /api/a2a
 *
 * Returns the Babylon agent card (capabilities, endpoints, metadata) for A2A protocol discovery.
 * Provides agent information for external agents to discover and interact with this agent.
 *
 * @param request - Next.js request (API key required in X-Babylon-Api-Key header)
 * @returns Agent card JSON with capabilities and metadata
 * @throws {401} Invalid or missing API key
 */
export async function GET(request: NextRequest) {
  const authError = checkApiKey(request);
  if (authError) return authError;

  return NextResponse.json(babylonAgentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

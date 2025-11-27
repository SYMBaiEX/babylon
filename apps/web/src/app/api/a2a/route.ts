/**
 * A2A Protocol Endpoint
 *
 * Implements the standard A2A protocol using @a2a-js/sdk
 * Replaces custom methods with official message/send, tasks/get, etc.
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

// Initialize A2A components with full executor (all 63 handlers)
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
 * Helper to check API key and return NextResponse on error
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
 * POST - Handle all A2A methods
 * Methods: message/send, message/stream, tasks/get, tasks/cancel, tasks/list
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
 * GET - Return AgentCard for discovery
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

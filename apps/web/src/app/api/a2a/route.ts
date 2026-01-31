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
  getServerApiKey,
  PersistentTaskStore,
  validateApiKeyAsync,
} from '@babylon/a2a';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Initialize A2A protocol components with Redis-backed persistence
const taskStore = new PersistentTaskStore();
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
 * Handle message/stream with Server-Sent Events response
 *
 * Creates a task, executes it, and streams status updates via SSE.
 * Tasks are persisted to the task store for consistency with non-streaming tasks.
 */
async function handleMessageStream(
  body: Record<string, unknown>,
  authResult: AuthResult | undefined
): Promise<Response> {
  const encoder = new TextEncoder();
  const taskId = uuidv4();
  const contextId = authResult?.userId || 'anonymous';

  // Extract message from params
  const params = body.params as { message?: { parts?: unknown[] } } | undefined;
  const message = params?.message;

  if (!message) {
    return new Response(
      encoder.encode(
        `event: error\ndata: ${JSON.stringify({ error: 'message is required' })}\n\n`
      ),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }
    );
  }

  // Create initial task and persist to store for tasks/get and tasks/resubscribe
  const initialTask = {
    kind: 'task' as const,
    id: taskId,
    contextId,
    status: {
      state: 'submitted' as const,
      timestamp: new Date().toISOString(),
    },
    artifacts: [] as Array<{ name?: string; parts: unknown[] }>,
  };
  await taskStore.save(initialTask);

  const stream = new ReadableStream({
    async start(controller) {
      // Send task submission event
      controller.enqueue(
        encoder.encode(
          `event: task-status\ndata: ${JSON.stringify({
            taskId,
            contextId,
            status: { state: 'submitted', timestamp: new Date().toISOString() },
          })}\n\n`
        )
      );

      try {
        // Create the event bus for this execution
        const eventBus = eventBusManager.createEventBus();

        // Track artifacts for final task save
        const artifacts: Array<{ name?: string; parts: unknown[] }> = [];

        // Subscribe to events
        eventBus.subscribe((event) => {
          if ('status' in event) {
            controller.enqueue(
              encoder.encode(
                `event: task-status\ndata: ${JSON.stringify({
                  taskId: event.taskId,
                  status: event.status,
                })}\n\n`
              )
            );
          } else if ('artifact' in event) {
            artifacts.push(event.artifact as { name?: string; parts: unknown[] });
            controller.enqueue(
              encoder.encode(
                `event: task-artifact\ndata: ${JSON.stringify({
                  taskId: event.taskId,
                  artifact: event.artifact,
                })}\n\n`
              )
            );
          }
        });

        // Execute the operation
        await executor.execute(
          {
            task: {
              id: taskId,
              contextId,
              status: {
                state: 'submitted',
                timestamp: new Date().toISOString(),
              },
            },
            message: message as { parts?: unknown[] },
            isCancelled: () => false,
          },
          eventBus
        );

        // Update task to completed and save
        const completedTask = {
          kind: 'task' as const,
          id: taskId,
          contextId,
          status: {
            state: 'completed' as const,
            timestamp: new Date().toISOString(),
          },
          artifacts,
        };
        await taskStore.save(completedTask);

        // Send completion event
        controller.enqueue(
          encoder.encode(
            `event: task-status\ndata: ${JSON.stringify({
              taskId,
              status: {
                state: 'completed',
                timestamp: new Date().toISOString(),
              },
              final: true,
            })}\n\n`
          )
        );
      } catch (error) {
        // Update task to failed and save
        const failedTask = {
          kind: 'task' as const,
          id: taskId,
          contextId,
          status: {
            state: 'failed' as const,
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          artifacts: [] as Array<{ name?: string; parts: unknown[] }>,
        };
        await taskStore.save(failedTask);

        // Send error event
        controller.enqueue(
          encoder.encode(
            `event: task-status\ndata: ${JSON.stringify({
              taskId,
              status: {
                state: 'failed',
                timestamp: new Date().toISOString(),
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              },
              final: true,
            })}\n\n`
          )
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
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

  // SECURITY: User-scoped execution for user API keys
  // When authenticated via per-user API key, enforce that the ACTOR identity
  // (contextId) is the authenticated user. This prevents impersonation attacks.
  //
  // NOTE: We do NOT enforce params.userId because many operations use it as
  // the TARGET (e.g., blockUser targets params.userId, actor is contextId).
  // The executor uses contextId as the actor for all write operations.
  if (authResult?.authMethod === 'user-key') {
    const authenticatedUserId = authResult.userId;

    // Validate userId is present and non-empty
    if (!authenticatedUserId || typeof authenticatedUserId !== 'string') {
      logger.error('User API key authenticated but userId is missing', {
        authMethod: authResult.authMethod,
        hasUserId: !!authenticatedUserId,
      });
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Authentication error: Invalid user identity',
          },
          id: body.id ?? null,
        },
        { status: 401 }
      );
    }

    // Type guard: ensure params is a plain object
    const isPlainObject = (val: unknown): val is Record<string, unknown> =>
      typeof val === 'object' && val !== null && !Array.isArray(val);

    // Ensure params exists and is a plain object
    if (!isPlainObject(body.params)) {
      body.params = {};
    }

    // Validate and override contextId in message params
    if (isPlainObject(body.params.message)) {
      if (
        body.params.message.contextId &&
        body.params.message.contextId !== authenticatedUserId
      ) {
        logger.warn('Overriding mismatched message contextId', {
          providedContextId: body.params.message.contextId,
          authenticatedUserId,
        });
      }
      body.params.message.contextId = authenticatedUserId;
    }

    // Validate and override contextId at params level (for tasks/get and other methods)
    if (
      body.params.contextId &&
      body.params.contextId !== authenticatedUserId
    ) {
      logger.warn('Overriding mismatched params contextId', {
        providedContextId: body.params.contextId,
        authenticatedUserId,
      });
    }
    body.params.contextId = authenticatedUserId;
  }

  // SECURITY: Server API key and localhost bypass
  // These auth methods allow arbitrary contextId, which enables acting as any user.
  // This is intentional for admin/internal operations but should be monitored.
  if (
    authResult?.authMethod === 'server-key' ||
    authResult?.authMethod === 'localhost'
  ) {
    const providedContextId =
      body.params?.message?.contextId ?? body.params?.contextId;
    if (providedContextId !== undefined && providedContextId !== null) {
      // Log server-key operations with user context for audit trail
      logger.info('Server/localhost A2A operation with user context', {
        authMethod: authResult.authMethod,
        contextId: providedContextId,
        method: body.method,
        operation: body.params?.message?.parts?.[0]?.data?.operation,
      });
    }
  }

  // Handle message/stream with SSE response
  if (body.method === 'message/stream') {
    return handleMessageStream(body, authResult);
  }

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

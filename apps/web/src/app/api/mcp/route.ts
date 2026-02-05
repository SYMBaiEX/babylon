/**
 * MCP Protocol Endpoint
 *
 * Implements JSON-RPC 2.0 Model Context Protocol for Babylon.
 * Exposes 75+ tools for prediction markets, social features, trading, and more.
 *
 * @route GET /api/mcp - Service discovery and capabilities
 * @route POST /api/mcp - JSON-RPC 2.0 tool execution
 */

import {
  type AuthResult,
  getServerApiKey,
  validateApiKeyAsync,
} from '@babylon/a2a';
import {
  getMCPServerInfo,
  getServerCapabilities,
  MCPRequestHandler,
  MCP_PROTOCOL_VERSIONS,
  type MCPAuthContext,
} from '@babylon/mcp';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Validate API key from request headers
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
                    'ApiKey realm="Babylon MCP", header="X-Babylon-Api-Key"',
                }
              : undefined,
        }
      ),
    };
  }

  return { authResult };
}

/**
 * GET /api/mcp
 * Returns MCP service information and capabilities
 */
export async function GET(request: NextRequest) {
  const { error } = await checkApiKey(request);
  if (error) return error;

  const serverInfo = getMCPServerInfo();
  const capabilities = getServerCapabilities();

  return NextResponse.json(
    {
      service: serverInfo.name,
      version: serverInfo.version,
      protocol: 'MCP',
      protocolVersions: MCP_PROTOCOL_VERSIONS,
      capabilities,
      endpoint: '/api/mcp',
      documentation: 'https://docs.babylon.market/mcp',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}

/**
 * POST /api/mcp
 * Handles JSON-RPC 2.0 MCP protocol requests
 */
export async function POST(request: NextRequest) {
  const { error, authResult } = await checkApiKey(request);
  if (error) return error;

  // Parse JSON-RPC request
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

  logger.info('MCP request', {
    method: body.method,
    toolName: body.params?.name,
    authMethod: authResult?.authMethod,
    userId: authResult?.userId,
    requestId: body.id,
  });

  // Create authentication context for tool execution
  const apiKey = request.headers.get('X-Babylon-Api-Key');
  const authContext: MCPAuthContext = {
    apiKey: apiKey ?? undefined,
    userId: authResult?.userId,
  };

  // Delegate to MCP request handler
  const handler = new MCPRequestHandler();
  const response = await handler.handle(body, authContext);

  // Log tool execution for audit trail
  if (
    authResult?.authMethod === 'user-key' &&
    body.method === 'tools/call' &&
    !response.error
  ) {
    const result = response.result as { isError?: boolean } | undefined;
    logger.info('MCP tool executed', {
      userId: authResult.userId,
      toolName: body.params?.name,
      success: !result?.isError,
    });
  }

  return NextResponse.json(response, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

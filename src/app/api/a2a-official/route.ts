/**
 * Official A2A Protocol Endpoint
 *
 * Provides a canonical JSON-RPC interface (message/send, tasks/*, etc.)
 * for external agents via the @a2a-js/sdk server primitives.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  DefaultExecutionEventBusManager,
  DefaultRequestHandler,
  JsonRpcTransportHandler
} from '@a2a-js/sdk/server'
import { babylonAgentCard } from '@/lib/a2a/official/babylon-agent-card'
import { BabylonExecutor } from '@/lib/a2a/official/babylon-executor'
import {
  ExtendedTaskStore,
  type ListTasksParams
} from '@/lib/a2a/official/extended-task-store'
import type { JsonRpcResult, JsonRpcResponse } from '@/types/a2a'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const taskStore = new ExtendedTaskStore()
const executor = new BabylonExecutor()
const requestHandler = new DefaultRequestHandler(
  babylonAgentCard,
  taskStore,
  executor,
  new DefaultExecutionEventBusManager()
)
const jsonRpcHandler = new JsonRpcTransportHandler(requestHandler)

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    if (typeof body.method !== 'string') {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid request - method is required'
        },
        id: normalizeRpcId(body.id)
      }, { status: 400 })
    }

    if (body.method === 'tasks/list') {
      return handleTasksList(body)
    }

    logger.info('Official A2A request received', { method: body.method })

    const handlerResult = await jsonRpcHandler.handle(body)
    const responsePayload = await resolveHandlerResult(handlerResult, normalizeRpcId(body.id))

    return NextResponse.json(responsePayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    logger.error('Error in official A2A endpoint', error)
    return NextResponse.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
        data: (error as Error).message
      },
      id: null
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(babylonAgentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}

async function handleTasksList(body: Record<string, unknown>) {
  const params = (body.params ?? {}) as Partial<ListTasksParams>

  const listResult = await taskStore.list({
    contextId: typeof params.contextId === 'string' ? params.contextId : undefined,
    status: typeof params.status === 'string' ? params.status : undefined,
    pageSize: typeof params.pageSize === 'number' ? params.pageSize : undefined,
    pageToken: typeof params.pageToken === 'string' ? params.pageToken : undefined,
    historyLength: typeof params.historyLength === 'number' ? params.historyLength : undefined,
    includeArtifacts: typeof params.includeArtifacts === 'boolean' ? params.includeArtifacts : undefined,
    lastUpdatedAfter: typeof params.lastUpdatedAfter === 'number' ? params.lastUpdatedAfter : undefined
  })

  const response: JsonRpcResponse = {
    jsonrpc: '2.0',
    id: normalizeRpcId(body.id),
    result: toJsonResult(listResult)
  }

  return NextResponse.json(response, {
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function normalizeRpcId(id: unknown): string | number | null {
  if (typeof id === 'string' || typeof id === 'number') {
    return id
  }
  return null
}

function toJsonResult(value: unknown): JsonRpcResult {
  return JSON.parse(JSON.stringify(value)) as JsonRpcResult
}

async function resolveHandlerResult(
  result: unknown,
  requestId: string | number | null
): Promise<unknown> {
  const asyncIterator = (result as AsyncGenerator<unknown>)[Symbol.asyncIterator]
  if (typeof asyncIterator === 'function') {
    let lastChunk: unknown = null
    for await (const chunk of result as AsyncGenerator<unknown>) {
      lastChunk = chunk
    }
    return lastChunk ?? {
      jsonrpc: '2.0',
      result: null,
      id: requestId
    }
  }
  return result
}


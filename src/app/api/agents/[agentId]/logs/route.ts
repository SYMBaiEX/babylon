/**
 * Agent Logs API Routes
 * 
 * GET /api/agents/[agentId]/logs - Get agent logs with filtering
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentService } from '@/lib/agents/services/AgentService'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params

    // Verify ownership
    const agent = await agentService.getAgent(agentId, user.id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found or unauthorized' },
        { status: 404 }
      )
    }

    // Get query params
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || undefined
    const level = searchParams.get('level') || undefined
    const limit = parseInt(searchParams.get('limit') || '100')

    // Get logs
    const logs = await agentService.getLogs(agentId, {
      type,
      level,
      limit
    })

    return NextResponse.json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        type: log.type,
        level: log.level,
        message: log.message,
        prompt: log.prompt,
        completion: log.completion,
        thinking: log.thinking,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString()
      }))
    })
  } catch (error: unknown) {
    logger.error('Error getting agent logs', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get logs' },
      { status: 500 }
    )
  }
}


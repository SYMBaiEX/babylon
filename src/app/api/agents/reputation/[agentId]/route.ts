/**
 * Agent Reputation API
 * 
 * GET /api/agents/reputation/:agentId - Get reputation summary
 * GET /api/agents/reputation/:agentId?tag1=X&tag2=Y - Get filtered reputation
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { optionalAuth } from '@/lib/api/auth-middleware'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    // Optional auth - reputation is public
    await optionalAuth(request).catch(() => null)

    const { agentId } = await params
    const { searchParams } = new URL(request.url)
    const tokenId = parseInt(agentId, 10)

    if (isNaN(tokenId)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
    }

    // Only get if Agent0 is enabled
    if (process.env.AGENT0_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Agent0 reputation not enabled' }, { status: 503 })
    }

    const tag1 = searchParams.get('tag1') || undefined
    const tag2 = searchParams.get('tag2') || undefined

    const agent0Client = getAgent0Client()
    const summary = await agent0Client.getReputationSummary({
      targetAgentId: tokenId,
      tag1,
      tag2
    })

    return NextResponse.json({
      success: true,
      agentId: tokenId,
      summary
    })
  } catch (error) {
    console.error('Get reputation summary failed', error)
    return NextResponse.json({ error: 'Failed to get reputation summary' }, { status: 500 })
  }
}



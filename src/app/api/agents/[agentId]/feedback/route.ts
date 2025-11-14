/**
 * Agent-Specific Feedback Operations
 * 
 * POST /api/agents/:agentId/feedback?action=auth - Sign feedback authorization
 * POST /api/agents/:agentId/feedback?action=respond - Respond to feedback
 * GET /api/agents/:agentId/feedback - List feedback for agent (alias for /api/agents/feedback?agentId=X)
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticate, optionalAuth } from '@/lib/api/auth-middleware'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'

const AuthSchema = z.object({
  clientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  indexLimit: z.number().int().positive().optional(),
  expiryHours: z.number().positive().optional()
})

const ResponseSchema = z.object({
  clientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  feedbackIndex: z.number().int().nonnegative(),
  response: z.object({
    uri: z.string().url(),
    hash: z.string()
  })
})

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    await optionalAuth(request).catch(() => null)

    const tokenId = parseInt(params.agentId, 10)
    if (isNaN(tokenId)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
    }

    if (process.env.AGENT0_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Agent0 not enabled' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const tags = searchParams.get('tags')?.split(',').filter(Boolean)
    const capabilities = searchParams.get('capabilities')?.split(',').filter(Boolean)
    const skills = searchParams.get('skills')?.split(',').filter(Boolean)
    const minScore = searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) : undefined
    const maxScore = searchParams.get('maxScore') ? parseFloat(searchParams.get('maxScore')!) : undefined

    const agent0Client = getAgent0Client()
    const feedbacks = await agent0Client.searchFeedback({
      targetAgentId: tokenId,
      tags,
      capabilities,
      skills,
      minScore,
      maxScore
    })

    return NextResponse.json({
      success: true,
      agentId: tokenId,
      count: feedbacks.length,
      feedbacks
    })
  } catch (error) {
    console.error('Search feedback failed', error)
    return NextResponse.json({ error: 'Failed to search feedback' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const authUser = await authenticate(request)
    const userId = authUser.dbUserId

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const tokenId = parseInt(params.agentId, 10)
    if (isNaN(tokenId)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
    }

    if (process.env.AGENT0_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Agent0 not enabled' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'auth'

    const agent0Client = getAgent0Client()

    // Handle different actions
    if (action === 'auth') {
      // Sign feedback authorization
      const payload = AuthSchema.safeParse(await request.json())
      if (!payload.success) {
        return NextResponse.json({ error: 'Invalid auth payload' }, { status: 400 })
      }

      const authSignature = await agent0Client.signFeedbackAuth({
        targetAgentId: tokenId,
        ...payload.data
      })

      return NextResponse.json({
        success: true,
        agentId: tokenId,
        authSignature
      })
    } else if (action === 'respond') {
      // Append response to feedback
      const payload = ResponseSchema.safeParse(await request.json())
      if (!payload.success) {
        return NextResponse.json({ error: 'Invalid response payload' }, { status: 400 })
      }

      const txHash = await agent0Client.appendFeedbackResponse({
        targetAgentId: tokenId,
        ...payload.data
      })

      return NextResponse.json({
        success: true,
        txHash,
        agentId: tokenId
      })
    } else {
      return NextResponse.json({ error: 'Invalid action. Use: auth, respond' }, { status: 400 })
    }
  } catch (error) {
    console.error('Feedback action failed', error)
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 })
  }
}


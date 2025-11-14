/**
 * Agent Feedback API
 * 
 * POST /api/agents/feedback - Submit feedback
 * GET /api/agents/feedback?agentId=X - Search feedback for agent
 * GET /api/agents/feedback?agentId=X&clientAddress=Y&index=Z - Get specific feedback
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authenticate, optionalAuth } from '@/lib/api/auth-middleware'
import { getAgent0Client } from '@/agents/agent0/Agent0Client'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'

const FeedbackSchema = z.object({
  targetTokenId: z.number().int().positive(),
  rating: z.number().int().min(-5).max(5),
  comment: z.string().max(2000).optional(),
  // Enhanced Agent0 feedback fields
  tags: z.array(z.string()).optional(),
  capability: z.string().optional(),
  name: z.string().optional(),
  skill: z.string().optional(),
  task: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  proofOfPayment: z.record(z.string(), z.unknown()).optional()
})

const SearchFeedbackSchema = z.object({
  agentId: z.coerce.number().int().positive(),
  clientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  index: z.coerce.number().int().nonnegative().optional(),
  tags: z.string().transform(s => s.split(',')).optional(),
  capabilities: z.string().transform(s => s.split(',')).optional(),
  skills: z.string().transform(s => s.split(',')).optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional()
})

export async function POST(request: NextRequest) {
  try {
    const authUser = await authenticate(request)
    const userId = authUser.dbUserId

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const payload = FeedbackSchema.safeParse(await request.json())
    if (!payload.success) {
      return NextResponse.json({ error: 'Invalid feedback payload' }, { status: 400 })
    }

    const { targetTokenId, rating, comment, tags, capability, name, skill, task, context, proofOfPayment } = payload.data

    const score = Math.max(0, Math.min(100, (rating + 5) * 10))

    let chainId: number | undefined
    let agent0FeedbackId: string | undefined
    // Submit to Agent0 only if enabled
    if (process.env.AGENT0_ENABLED === 'true') {
      try {
        const agent0Client = getAgent0Client()
        chainId = agent0Client.getDefaultChainId()
        const feedback = await agent0Client.submitFeedback({
          targetAgentId: targetTokenId,
          rating,
          comment,
          tags,
          capability,
          name,
          skill,
          task,
          context,
          proofOfPayment
        })
        agent0FeedbackId = feedback.id.join(':')
      } catch (error) {
        // Log but don't fail the request - local feedback is still saved
        console.error('Failed to submit feedback to Agent0:', error)
      }
    }

    // Store metadata as JSON, converting complex types to JSON-safe format
    const metadataObj: Record<string, unknown> = {
      source: process.env.AGENT0_ENABLED === 'true' ? 'agent0' : 'local',
      comment: comment || null,
      chainId: chainId ?? null,
      agent0FeedbackId: agent0FeedbackId ?? null,
      tags: tags ?? null,
      capability: capability ?? null,
      name: name ?? null,
      skill: skill ?? null,
      task: task ?? null,
      context: context ? JSON.parse(JSON.stringify(context)) : null,
      proofOfPayment: proofOfPayment ? JSON.parse(JSON.stringify(proofOfPayment)) : null
    }

    await prisma.feedback.create({
      data: {
        id: uuidv4(),
        fromUserId: userId,
        toAgentId: String(targetTokenId),
        score,
        rating,
        comment,
        interactionType: 'agent-feedback',
        agent0TokenId: targetTokenId,
        updatedAt: new Date(),
        metadata: metadataObj as Prisma.InputJsonValue
      }
    })

    return NextResponse.json({
      success: true,
      agent0TokenId: targetTokenId,
      agent0FeedbackId,
      score
    })
  } catch (error) {
    console.error('Agent feedback submission failed', error)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}

/**
 * GET /api/agents/feedback
 * Search or get specific feedback
 */
export async function GET(request: NextRequest) {
  try {
    // Optional auth - feedback is public
    await optionalAuth(request).catch(() => null)

    const { searchParams } = new URL(request.url)
    
    const parseResult = SearchFeedbackSchema.safeParse(Object.fromEntries(searchParams))
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid query parameters', details: parseResult.error }, { status: 400 })
    }

    const params = parseResult.data

    // Only search if Agent0 is enabled
    if (process.env.AGENT0_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Agent0 feedback not enabled' }, { status: 503 })
    }

    const agent0Client = getAgent0Client()

    // Get specific feedback if clientAddress and index provided
    if (params.clientAddress && params.index !== undefined) {
      const feedback = await agent0Client.getFeedback({
        targetAgentId: params.agentId,
        clientAddress: params.clientAddress,
        feedbackIndex: params.index
      })

      return NextResponse.json({
        success: true,
        feedback
      })
    }

    // Otherwise search feedback
    const feedbacks = await agent0Client.searchFeedback({
      targetAgentId: params.agentId,
      tags: params.tags,
      capabilities: params.capabilities,
      skills: params.skills,
      minScore: params.minScore,
      maxScore: params.maxScore
    })

    return NextResponse.json({
      success: true,
      agentId: params.agentId,
      count: feedbacks.length,
      feedbacks
    })
  } catch (error) {
    console.error('Get feedback failed', error)
    return NextResponse.json({ error: 'Failed to get feedback' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/feedback
 * Revoke feedback
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await authenticate(request)
    const userId = authUser.dbUserId

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const index = searchParams.get('index')

    if (!agentId || !index) {
      return NextResponse.json({ error: 'agentId and index required' }, { status: 400 })
    }

    const tokenId = parseInt(agentId, 10)
    const feedbackIndex = parseInt(index, 10)

    if (isNaN(tokenId) || isNaN(feedbackIndex)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    // Only revoke if Agent0 is enabled
    if (process.env.AGENT0_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Agent0 feedback not enabled' }, { status: 503 })
    }

    const agent0Client = getAgent0Client()
    const txHash = await agent0Client.revokeFeedback({
      targetAgentId: tokenId,
      feedbackIndex
    })

    return NextResponse.json({
      success: true,
      txHash,
      agentId: tokenId,
      feedbackIndex
    })
  } catch (error) {
    console.error('Revoke feedback failed', error)
    return NextResponse.json({ error: 'Failed to revoke feedback' }, { status: 500 })
  }
}

/**
 * Agent Chat API Routes
 * 
 * POST /api/agents/[agentId]/chat - Send message to agent
 * GET  /api/agents/[agentId]/chat - Get chat history
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { agentService } from '@/lib/agents/services/AgentService'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { logger } from '@/lib/logger'
import { authenticateUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { ModelType } from '@elizaos/core'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await authenticateUser(req)
    const { agentId } = await params
    const body = await req.json()

    const { message, usePro } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Verify ownership and get agent
    const agent = await agentService.getAgent(agentId, user.id)
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found or unauthorized' },
        { status: 404 }
      )
    }

    // Determine point cost
    const pointsCost = usePro ? 1 : 1 // 1 point for both modes for now

    // Check balance
    if (agent.agentPointsBalance < pointsCost) {
      return NextResponse.json(
        { error: `Insufficient points. Need: ${pointsCost}, Have: ${agent.agentPointsBalance}` },
        { status: 400 }
      )
    }

    // Deduct points first
    const newBalance = await agentService.deductPoints(
      agentId,
      pointsCost,
      `Chat message (${usePro ? 'pro' : 'free'} mode)`,
      undefined
    )

      // Save user message
      const userMessageId = uuidv4()
      await prisma.agentMessage.create({
        data: {
          id: userMessageId,
          agentUserId: agentId,
          role: 'user',
          content: message,
          pointsCost: 0,
          metadata: {}
        }
      })

      try {
        // Get agent runtime
        const runtime = await agentRuntimeManager.getRuntime(agentId)

        // Generate response using appropriate model
        const modelType = usePro || agent.agentModelTier === 'pro' ? ModelType.TEXT_LARGE : ModelType.TEXT_SMALL
        
        const prompt = `User: ${message}\n\nRespond as ${agent.displayName}. ${agent.agentSystem}`
      
      const response = await runtime.useModel(modelType, {
        prompt,
        temperature: 0.7,
        maxTokens: 1000
      })

        // Save assistant message
        const assistantMessageId = uuidv4()
        await prisma.agentMessage.create({
          data: {
            id: assistantMessageId,
            agentUserId: agentId,
            role: 'assistant',
            content: response,
            modelUsed: usePro ? 'groq-70b' : 'groq-8b',
            pointsCost,
            metadata: {}
          }
        })

        // Update last chat time
        await prisma.user.update({
          where: { id: agentId },
          data: { agentLastChatAt: new Date() }
        })

        // Log the chat
        await prisma.agentLog.create({
          data: {
            id: uuidv4(),
            agentUserId: agentId,
            type: 'chat',
            level: 'info',
            message: 'Chat interaction completed',
            prompt: message,
            completion: response,
            metadata: {
              usePro,
              pointsCost,
              modelUsed: usePro ? 'groq-70b' : 'groq-8b'
            }
          }
        })

      logger.info(`Chat completed for agent ${agentId}`, undefined, 'AgentsAPI')

      return NextResponse.json({
        success: true,
        messageId: assistantMessageId,
        response,
        pointsCost,
        modelUsed: usePro ? 'groq-70b' : 'groq-8b',
        balanceAfter: newBalance
      })
      } catch (error: unknown) {
        // Refund points on error
        await prisma.user.update({
          where: { id: agentId },
          data: {
            agentPointsBalance: {
              increment: pointsCost
            },
            agentTotalPointsSpent: {
              decrement: pointsCost
            }
          }
        })

      logger.error(`Chat error for agent ${agentId}`, error, 'AgentsAPI')
      throw error
    }
  } catch (error: unknown) {
    logger.error('Error in agent chat', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat' },
      { status: 500 }
    )
  }
}

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
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get chat history
    const messages = await agentService.getChatHistory(agentId, limit)

    return NextResponse.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        modelUsed: msg.modelUsed,
        pointsCost: msg.pointsCost,
        createdAt: msg.createdAt.toISOString()
      }))
    })
  } catch (error: unknown) {
    logger.error('Error getting chat history', error, 'AgentsAPI')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get chat history' },
      { status: 500 }
    )
  }
}


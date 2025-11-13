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
import { withErrorHandling } from '@/lib/errors/error-handler'
import { BadRequestError, NotFoundError } from '@/lib/errors'

export const POST = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) => {
    const { agentId } = await params
    logger.info('Agent chat endpoint hit', { agentId }, 'AgentChat')
    
    // Parse body - simple approach like other routes
    let body: any
    try {
      body = await req.json()
      logger.info('Body parsed successfully', { 
        agentId,
        hasMessage: !!body.message,
        messageLength: body.message?.length || 0
      }, 'AgentChat')
    } catch (error) {
      logger.error('JSON parse failed', { 
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        contentType: req.headers.get('content-type')
      }, 'AgentChat')
      throw new BadRequestError('Failed to parse JSON body')
    }

    const { message, usePro } = body

    if (!message || typeof message !== 'string') {
      throw new BadRequestError('Message is required')
    }

    // Authenticate user
    const user = await authenticateUser(req)

    // Verify ownership and get agent
    const agent = await agentService.getAgent(agentId, user.id)
    if (!agent) {
      throw new NotFoundError('Agent', 'not found or unauthorized')
    }

    // Determine point cost
    const pointsCost = usePro ? 1 : 1 // 1 point for both modes for now

    // Check balance
    if (agent.agentPointsBalance < pointsCost) {
      throw new BadRequestError(`Insufficient points. Need: ${pointsCost}, Have: ${agent.agentPointsBalance}`)
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
});

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) => {
  const user = await authenticateUser(req)
  const { agentId } = await params

  // Verify ownership
  const agent = await agentService.getAgent(agentId, user.id)
  if (!agent) {
    throw new NotFoundError('Agent', 'not found or unauthorized')
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
});


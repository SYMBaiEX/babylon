/**
 * Agent Chat Interaction API
 *
 * @route POST /api/agents/[agentId]/chat - Send message to agent
 * @route GET /api/agents/[agentId]/chat - Get chat history
 * @access Authenticated (owner only)
 *
 * @description
 * Real-time chat interface with autonomous agents. Agents respond using
 * their configured personality, system prompts, and conversation history.
 * Includes content safety checks, automatic retry logic, and points-based
 * usage tracking.
 *
 * @openapi
 * /api/agents/{agentId}/chat:
 *   post:
 *     tags:
 *       - Agents
 *     summary: Send message to agent
 *     description: Initiates chat interaction with agent (owner only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *               usePro:
 *                 type: boolean
 *                 description: Use pro-tier model
 *     responses:
 *       200:
 *         description: Agent responded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *                 response:
 *                   type: string
 *                 pointsCost:
 *                   type: number
 *                 modelUsed:
 *                   type: string
 *                 balanceAfter:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not agent owner
 *       404:
 *         description: Agent not found
 *   get:
 *     tags:
 *       - Agents
 *     summary: Get chat history
 *     description: Returns conversation history with agent (owner only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent user ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum messages to return
 *     responses:
 *       200:
 *         description: Chat history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not agent owner
 *       404:
 *         description: Agent not found
 *
 * @example
 * ```typescript
 * // Send message
 * const response = await fetch(`/api/agents/${agentId}/chat`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({ message: 'Hello!' })
 * });
 *
 * // Get history
 * const { messages } = await fetch(`/api/agents/${agentId}/chat`, {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * ```
 */

/**
 * Agent Chat Interaction API (Legacy TSDoc)
 *
 * @param {string} agentId - Agent user ID (path parameter)
 * @query {number} limit - Max messages to return (default: 50)
 *
 * @returns {object} Chat history
 * @property {boolean} success - Operation success
 * @property {array} messages - Array of message objects with timestamps
 *
 * @throws {400} Invalid message content or insufficient points
 * @throws {404} Agent not found or unauthorized
 * @throws {500} Internal server error or unsafe content generation
 *
 * @example
 * ```typescript
 * // Send message
 * const response = await fetch(`/api/agents/${agentId}/chat`, {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     message: 'What's your trading strategy?',
 *     usePro: true
 *   })
 * });
 * const { response, pointsCost, balanceAfter } = await response.json();
 *
 * // Get history
 * const history = await fetch(`/api/agents/${agentId}/chat?limit=20`);
 * const { messages } = await history.json();
 * ```
 *
 * @see {@link /lib/agents/runtime/AgentRuntimeManager} Runtime manager
 * @see {@link /lib/utils/content-safety} Content safety checks
 * @see {@link /src/app/agents/[agentId]/page.tsx} Chat interface UI
 */

import { ModelType } from '@elizaos/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@babylon/db';
import { agentRuntimeManager, agentService } from '@babylon/agents';
import { withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { authenticateUser } from '@babylon/api';
import { checkAgentOutput, checkUserInput } from '@babylon/shared';

export const POST = withErrorHandling(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
  ) => {
    const { agentId } = await params;
    logger.info('Agent chat endpoint hit', { agentId }, 'AgentChat');

    let body: { message: string; usePro: boolean };
    try {
      body = (await req.json()) as { message: string; usePro: boolean };
    } catch (error) {
      logger.error(
        'Failed to parse request body',
        { error, agentId },
        'AgentChat'
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }
    logger.info(
      'Body parsed successfully',
      {
        agentId,
        hasMessage: !!body.message,
        messageLength: body.message.length,
      },
      'AgentChat'
    );

    const message = body.message;
    const usePro = body.usePro;

    // Validate and block unsafe input
    const inputCheck = checkUserInput(message);
    if (!inputCheck.safe) {
      logger.warn(
        'Unsafe user input blocked',
        {
          agentId,
          reason: inputCheck.reason,
          category: inputCheck.category,
        },
        'AgentChat'
      );
      return NextResponse.json(
        {
          success: false,
          error: inputCheck.reason || 'Invalid input',
        },
        { status: 400 }
      );
    }

    const user = await authenticateUser(req);

    // Verify user owns this agent before allowing chat
    const agent = await agentService.getAgent(agentId, user.id);
    if (!agent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent not found',
        },
        { status: 404 }
      );
    }

    const pointsCost = usePro ? 1 : 1;

    // Deduct points before generating response
    const newBalance = await agentService.deductPoints(
      agentId,
      pointsCost,
      `Chat message (${usePro ? 'pro' : 'free'} mode)`,
      undefined
    );

    const userMessageId = uuidv4();
    await db.agentMessage.create({
      data: {
        id: userMessageId,
        agentUserId: agentId,
        role: 'user',
        content: message,
        pointsCost: 0,
        metadata: {},
      },
    });

    // Prepare runtime and prompt outside try-catch so they're available for regeneration
    const runtime = await agentRuntimeManager.getRuntime(agentId);

    const recentMessages = await db.agentMessage.findMany({
      where: { agentUserId: agentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    });

    const conversationHistory = recentMessages
      .reverse()
      .map((m) => {
        const speaker = m.role === 'user' ? 'User' : agent!.displayName;
        return `${speaker}: ${m.content}`;
      })
      .join('\n');

    // Always use qwen 32b (TEXT_LARGE) - free chat, 1pt per tick
    const modelType = ModelType.TEXT_LARGE;

    const prompt = `${agent!.agentSystem}

You are ${agent!.displayName}. Respond naturally and stay in character.

${conversationHistory ? `Recent conversation:\n${conversationHistory}\n\n` : ''}User: ${message}

${agent!.displayName} (respond in 1-3 sentences, conversational):`;

    // Wrap response generation in try-catch to refund points on failure
    let response: string;
    try {
      response = await runtime.useModel(modelType, {
        prompt,
        temperature: 0.8,
        maxTokens: 200,
      });
    } catch (error) {
      // Refund points if response generation fails
      logger.error(
        'Failed to generate agent response',
        { error, agentId },
        'AgentChat'
      );
      await agentService.depositPoints(agentId, user.id, pointsCost);

      // Delete user message since we failed
      await db.agentMessage.delete({ where: { id: userMessageId } });

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to generate response. Points have been refunded.',
        },
        { status: 500 }
      );
    }

    // Verify response is not empty
    if (
      !response ||
      typeof response !== 'string' ||
      response.trim().length === 0
    ) {
      logger.error('Agent generated empty response', { agentId }, 'AgentChat');
      await agentService.depositPoints(agentId, user.id, pointsCost);
      await db.agentMessage.delete({ where: { id: userMessageId } });

      return NextResponse.json(
        {
          success: false,
          error: 'Agent generated empty response. Points have been refunded.',
        },
        { status: 500 }
      );
    }

    // Check output safety - only regenerate if unsafe
    const outputCheck = checkAgentOutput(response);
    if (!outputCheck.safe) {
      logger.warn(
        'Agent generated unsafe content, regenerating',
        {
          agentId,
          reason: outputCheck.reason,
          preview: response.substring(0, 100),
        },
        'AgentChat'
      );

      logger.info(
        'Attempting regeneration with safety prompt',
        { agentId },
        'AgentChat'
      );
      try {
        response = await runtime.useModel(modelType, {
          prompt: `${prompt}\n\nIMPORTANT: Keep your response professional, helpful, and appropriate. No profanity or inappropriate content.`,
          temperature: 0.6,
          maxTokens: 200,
        });
      } catch (error) {
        logger.error(
          'Failed to regenerate response',
          { error, agentId },
          'AgentChat'
        );
        await agentService.depositPoints(agentId, user.id, pointsCost);
        await db.agentMessage.delete({ where: { id: userMessageId } });

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to regenerate response. Points have been refunded.',
          },
          { status: 500 }
        );
      }

      // Verify regenerated response is not empty
      if (
        !response ||
        typeof response !== 'string' ||
        response.trim().length === 0
      ) {
        logger.error(
          'Agent generated empty response after regeneration',
          { agentId },
          'AgentChat'
        );
        await agentService.depositPoints(agentId, user.id, pointsCost);
        await db.agentMessage.delete({ where: { id: userMessageId } });

        return NextResponse.json(
          {
            success: false,
            error:
              'Agent generated empty response after regeneration. Points have been refunded.',
          },
          { status: 500 }
        );
      }

      // Check again after regeneration
      const secondCheck = checkAgentOutput(response);
      if (!secondCheck.safe) {
        logger.error(
          'Agent generated unsafe content after regeneration',
          {
            agentId,
            reason: secondCheck.reason,
          },
          'AgentChat'
        );
        // Refund points and return error
        await agentService.depositPoints(agentId, user.id, pointsCost);
        await db.agentMessage.delete({ where: { id: userMessageId } });

        return NextResponse.json(
          {
            success: false,
            error:
              'Unable to generate safe response. Points have been refunded.',
          },
          { status: 500 }
        );
      }
    }

    response = response.trim().replace(/^["']|["']$/g, '');

    // Final check after trimming
    if (response.length === 0) {
      logger.error(
        'Response became empty after trimming',
        { agentId },
        'AgentChat'
      );
      await agentService.depositPoints(agentId, user.id, pointsCost);
      await db.agentMessage.delete({ where: { id: userMessageId } });

      return NextResponse.json(
        {
          success: false,
          error:
            'Response became empty after processing. Points have been refunded.',
        },
        { status: 500 }
      );
    }

    const assistantMessageId = uuidv4();
    await db.agentMessage.create({
      data: {
        id: assistantMessageId,
        agentUserId: agentId,
        role: 'assistant',
        content: response,
        modelUsed: usePro ? 'groq-70b' : 'groq-8b',
        pointsCost,
        metadata: {},
      },
    });

    await db.user.update({
      where: { id: agentId },
      data: { agentLastChatAt: new Date() },
    });

    await db.agentLog.create({
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
          modelUsed: usePro ? 'groq-70b' : 'groq-8b',
        },
      },
    });

    logger.info(`Chat completed for agent ${agentId}`, undefined, 'AgentsAPI');

    return NextResponse.json({
      success: true,
      messageId: assistantMessageId,
      response,
      pointsCost,
      modelUsed: usePro ? 'groq-70b' : 'groq-8b',
      balanceAfter: newBalance,
    });
  }
);

export const GET = withErrorHandling(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
  ) => {
    const user = await authenticateUser(req);
    const { agentId } = await params;

    await agentService.getAgent(agentId, user.id);

    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get('limit')!);

    const messages = await agentService.getChatHistory(agentId, limit);

    return NextResponse.json({
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        modelUsed: msg.modelUsed,
        pointsCost: msg.pointsCost,
        createdAt: msg.createdAt.toISOString(),
      })),
    });
  }
);

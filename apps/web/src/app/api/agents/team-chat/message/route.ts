/**
 * Team Chat Message API
 *
 * @route POST /api/agents/team-chat/message - Send message to team chat
 * @access Authenticated
 *
 * @description
 * Sends a message to the user's Command Center team chat.
 * Broadcasts to all agents - each agent decides via LLM whether to respond.
 *
 * @openapi
 * /api/agents/team-chat/message:
 *   post:
 *     tags:
 *       - Agents
 *     summary: Send team chat message
 *     description: |
 *       Sends a message to Command Center and broadcasts to all agents.
 *       Each agent uses LLM to decide whether to respond based on context.
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content
 *     responses:
 *       201:
 *         description: Message sent, broadcasted to agents
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No team chat exists
 */

import {
  teamChatResponseService,
  teamChatService,
} from '@babylon/agents';
import {
  authenticateUser,
  broadcastChatMessage,
  checkRateLimitAsync,
  RATE_LIMIT_CONFIGS,
} from '@babylon/api';
import { db, eq, generateSnowflakeId, messages, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// =============================================================================
// Request Validation
// =============================================================================

/** Request body schema for team chat messages */
const messageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(4000, 'Message too long. Maximum 4000 characters allowed.'),
});

export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);

  // Rate limit to prevent spam (especially important with agent auto-responses)
  const rateCheck = await checkRateLimitAsync(
    user.id,
    RATE_LIMIT_CONFIGS.SEND_MESSAGE
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please wait before sending more messages.',
        retryAfter: rateCheck.retryAfter,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const parseResult = messageSchema.safeParse(body);

  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return NextResponse.json(
      { success: false, error: firstError?.message || 'Invalid request body' },
      { status: 400 }
    );
  }

  const { content } = parseResult.data;

  // Get user's team chat
  const teamChat = await teamChatService.getTeamChat(user.id);

  if (!teamChat) {
    return NextResponse.json(
      {
        success: false,
        error: 'No team chat exists',
        message: 'Create your first agent to initialize your Command Center.',
      },
      { status: 404 }
    );
  }

  // Create the message
  const messageId = await generateSnowflakeId();
  const now = new Date();

  await db.insert(messages).values({
    id: messageId,
    chatId: teamChat.chatId,
    senderId: user.id,
    content: content.trim(),
    type: 'user',
    createdAt: now,
  });

  logger.info(
    `Team chat message sent by user ${user.id}`,
    { chatId: teamChat.chatId, messageId },
    'TeamChatMessageAPI'
  );

  // Broadcast the message via SSE
  await broadcastChatMessage(teamChat.chatId, {
    id: messageId,
    content: content.trim(),
    chatId: teamChat.chatId,
    senderId: user.id,
    type: 'user',
    createdAt: now.toISOString(),
    isGameChat: false,
    isDMChat: false,
  });

  // Get user info for owner context
  const [userInfo] = await db
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const ownerDisplayName =
    userInfo?.displayName || userInfo?.username || 'User';
  const ownerUsername = userInfo?.username || '';

  // Broadcast to all agents (they decide via LLM whether to respond)
  teamChatResponseService
    .broadcastToAllAgents({
      chatId: teamChat.chatId,
      senderId: user.id,
      ownerDisplayName,
      ownerUsername,
    })
    .catch((error) => {
      logger.error(
        `Failed to broadcast to agents: ${error}`,
        { chatId: teamChat.chatId },
        'TeamChatMessageAPI'
      );
    });

  return NextResponse.json(
    {
      success: true,
      message: {
        id: messageId,
        content: content.trim(),
        chatId: teamChat.chatId,
        senderId: user.id,
        type: 'user',
        createdAt: now.toISOString(),
      },
    },
    { status: 201 }
  );
}

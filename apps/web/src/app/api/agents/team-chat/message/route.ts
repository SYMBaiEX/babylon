/**
 * Team Chat Message API
 *
 * @route POST /api/agents/team-chat/message - Send message to team chat with @mention handling
 * @access Authenticated
 *
 * @description
 * Sends a message to the user's Command Center team chat.
 * Automatically triggers priority responses from @mentioned agents.
 *
 * @openapi
 * /api/agents/team-chat/message:
 *   post:
 *     tags:
 *       - Agents
 *     summary: Send team chat message
 *     description: Sends a message to Command Center and triggers agent responses for @mentions.
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
 *                 description: Message content (can include @mentions)
 *               mentionedAgentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Agent IDs that were @mentioned (parsed client-side)
 *     responses:
 *       201:
 *         description: Message sent, agent responses triggered
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No team chat exists
 */

import { teamChatResponseService, teamChatService } from '@babylon/agents';
import { authenticateUser, broadcastChatMessage } from '@babylon/api';
import { db, eq, generateSnowflakeId, messages, users } from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/** Request body schema for team chat messages */
const messageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(4000, 'Message too long. Maximum 4000 characters allowed.'),
  mentionedAgentIds: z
    .array(z.string().regex(/^\d+$/, 'Invalid agent ID format'))
    .max(10, 'Maximum 10 agents can be mentioned at once.')
    .optional(),
});

export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);

  const body = await req.json();
  const parseResult = messageSchema.safeParse(body);

  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return NextResponse.json(
      { success: false, error: firstError?.message || 'Invalid request body' },
      { status: 400 }
    );
  }

  const { content, mentionedAgentIds } = parseResult.data;

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
    {
      chatId: teamChat.chatId,
      messageId,
      mentionCount: mentionedAgentIds?.length ?? 0,
    },
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

  // Trigger agent responses if there are mentions
  let responseResult = null;
  if (mentionedAgentIds && mentionedAgentIds.length > 0) {
    // Validate that mentioned agents are actually in the team chat
    const teamAgents = await teamChatService.getTeamChatAgents(user.id);
    const validMentionedIds = mentionedAgentIds.filter((id) =>
      teamAgents.some((agent) => agent.id === id)
    );

    if (validMentionedIds.length > 0) {
      // Get user display name for mentions
      const [userInfo] = await db
        .select({ displayName: users.displayName, username: users.username })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const senderDisplayName =
        userInfo?.displayName || userInfo?.username || 'User';

      // Trigger responses asynchronously (don't block the API response)
      teamChatResponseService
        .triggerMentionedAgentResponses({
          chatId: teamChat.chatId,
          messageContent: content.trim(),
          mentionedAgentIds: validMentionedIds,
          senderUserId: user.id,
          senderDisplayName,
        })
        .catch((error) => {
          logger.error(
            `Failed to trigger agent responses: ${error}`,
            { chatId: teamChat.chatId },
            'TeamChatMessageAPI'
          );
        });

      responseResult = {
        agentsNotified: validMentionedIds.length,
        invalidMentions: mentionedAgentIds.length - validMentionedIds.length,
      };
    }
  }

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
      agentResponses: responseResult,
    },
    { status: 201 }
  );
}

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
 * When no agents are @mentioned, ALL agents in the team chat will respond.
 * This is configurable via UNTAGGED_RESPONSE_CONFIG.
 *
 * @openapi
 * /api/agents/team-chat/message:
 *   post:
 *     tags:
 *       - Agents
 *     summary: Send team chat message
 *     description: |
 *       Sends a message to Command Center and triggers agent responses.
 *       - If specific agents are @mentioned, only those agents respond.
 *       - If no agents are @mentioned, ALL agents respond (untagged broadcast).
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

import {
  type AgentOrderingStrategy,
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
// Untagged Response Configuration
// =============================================================================

/**
 * Configuration for how agents respond when no specific agent is @mentioned.
 *
 * This can be modified by developers to tune the behavior.
 * In the future, this could be moved to environment variables or a config file.
 */
const UNTAGGED_RESPONSE_CONFIG = {
  /**
   * Maximum number of agents that will respond to an untagged message.
   * Set to null for unlimited (all agents respond).
   */
  maxAgents: null as number | null,

  /**
   * Strategy for ordering which agents respond first.
   * - 'random': Randomize the order (default, feels more natural)
   * - 'created_asc': Oldest agents first
   * - 'created_desc': Newest agents first
   * - 'alphabetical': Alphabetically by display name
   */
  orderingStrategy: 'random' as AgentOrderingStrategy,
};

// =============================================================================
// Request Validation
// =============================================================================

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

  // Get all team agents for response handling
  const teamAgents = await teamChatService.getTeamChatAgents(
    user.id,
    teamChat.groupId
  );

  // Determine which agents should respond
  let agentIdsToRespond: string[] = [];
  let isUntaggedBroadcast = false;

  if (mentionedAgentIds && mentionedAgentIds.length > 0) {
    // Specific agents were @mentioned - validate and use those
    const teamAgentIds = new Set(teamAgents.map((agent) => agent.id));
    agentIdsToRespond = mentionedAgentIds.filter((id) => teamAgentIds.has(id));
  } else {
    // No agents @mentioned - ALL agents should respond (untagged broadcast)
    isUntaggedBroadcast = true;
    agentIdsToRespond = teamAgents.map((agent) => agent.id);

    // Apply ordering strategy
    agentIdsToRespond = orderAgentIds(
      agentIdsToRespond,
      teamAgents,
      UNTAGGED_RESPONSE_CONFIG.orderingStrategy
    );

    // Apply max agents cap if configured
    if (
      UNTAGGED_RESPONSE_CONFIG.maxAgents !== null &&
      agentIdsToRespond.length > UNTAGGED_RESPONSE_CONFIG.maxAgents
    ) {
      agentIdsToRespond = agentIdsToRespond.slice(
        0,
        UNTAGGED_RESPONSE_CONFIG.maxAgents
      );
    }

    logger.info(
      `Untagged message - triggering all ${agentIdsToRespond.length} agent(s)`,
      {
        chatId: teamChat.chatId,
        agentCount: agentIdsToRespond.length,
        ordering: UNTAGGED_RESPONSE_CONFIG.orderingStrategy,
        maxAgents: UNTAGGED_RESPONSE_CONFIG.maxAgents,
      },
      'TeamChatMessageAPI'
    );
  }

  // Trigger agent responses if there are any agents to respond
  let responseResult = null;
  if (agentIdsToRespond.length > 0) {
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
        mentionedAgentIds: agentIdsToRespond,
        senderUserId: user.id,
        senderDisplayName,
        isUntaggedBroadcast,
      })
      .catch((error) => {
        logger.error(
          `Failed to trigger agent responses: ${error}`,
          { chatId: teamChat.chatId },
          'TeamChatMessageAPI'
        );
      });

    responseResult = {
      agentsNotified: agentIdsToRespond.length,
      isUntaggedBroadcast,
      invalidMentions: mentionedAgentIds
        ? mentionedAgentIds.length - agentIdsToRespond.length
        : 0,
    };
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Order agent IDs based on the configured strategy.
 */
function orderAgentIds(
  agentIds: string[],
  teamAgents: Array<{
    id: string;
    displayName: string | null;
    createdAt: Date | null;
  }>,
  strategy: AgentOrderingStrategy
): string[] {
  const agentMap = new Map(teamAgents.map((a) => [a.id, a]));

  switch (strategy) {
    case 'random':
      return shuffleArray([...agentIds]);

    case 'created_asc':
      return [...agentIds].sort((a, b) => {
        const agentA = agentMap.get(a);
        const agentB = agentMap.get(b);
        const timeA = agentA?.createdAt?.getTime() ?? 0;
        const timeB = agentB?.createdAt?.getTime() ?? 0;
        return timeA - timeB;
      });

    case 'created_desc':
      return [...agentIds].sort((a, b) => {
        const agentA = agentMap.get(a);
        const agentB = agentMap.get(b);
        const timeA = agentA?.createdAt?.getTime() ?? 0;
        const timeB = agentB?.createdAt?.getTime() ?? 0;
        return timeB - timeA;
      });

    case 'alphabetical':
      return [...agentIds].sort((a, b) => {
        const agentA = agentMap.get(a);
        const agentB = agentMap.get(b);
        const nameA = agentA?.displayName ?? '';
        const nameB = agentB?.displayName ?? '';
        return nameA.localeCompare(nameB);
      });

    default:
      return agentIds;
  }
}

/**
 * Fisher-Yates shuffle for randomizing agent order.
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j] as T;
    array[j] = temp as T;
  }
  return array;
}

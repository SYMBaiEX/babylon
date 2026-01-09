/**
 * Agent Team Chat (Command Center) API
 *
 * @route GET /api/agents/team-chat - Get user's team chat info
 * @route POST /api/agents/team-chat - Ensure team chat exists (creates if needed)
 * @access Authenticated
 *
 * @description
 * Manages the unified "Command Center" group chat for a user's agents.
 * Each user has exactly ONE team chat containing ALL their agents.
 *
 * The team chat is automatically created when the first agent is created,
 * but this endpoint allows explicit creation/retrieval.
 *
 * @openapi
 * /api/agents/team-chat:
 *   get:
 *     tags:
 *       - Agents
 *     summary: Get team chat info
 *     description: Returns the user's Command Center team chat with member list.
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Team chat info with members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 teamChat:
 *                   type: object
 *                   properties:
 *                     chatId:
 *                       type: string
 *                     groupId:
 *                       type: string
 *                     agents:
 *                       type: array
 *       404:
 *         description: No team chat exists (user has no agents)
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags:
 *       - Agents
 *     summary: Ensure team chat exists
 *     description: Creates team chat if it doesn't exist, returns existing if it does.
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Team chat info
 *       401:
 *         description: Unauthorized
 */

import { teamChatService } from '@babylon/agents';
import { authenticateUser } from '@babylon/api';
import {
  chatParticipants,
  chats,
  db,
  eq,
  groupMembers,
  groups,
  messages,
  userAgentTeamChats,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/agents/team-chat
 * Get user's team chat info with member list
 */
export async function GET(req: NextRequest) {
  const user = await authenticateUser(req);

  const teamChatWithMembers = await teamChatService.getTeamChatWithMembers(
    user.id
  );

  if (!teamChatWithMembers) {
    return NextResponse.json(
      {
        success: false,
        error: 'No team chat exists',
        message: 'Create your first agent to initialize your Command Center.',
      },
      { status: 404 }
    );
  }

  logger.info(
    `Team chat retrieved for user ${user.id}`,
    { chatId: teamChatWithMembers.chatId },
    'TeamChatAPI'
  );

  return NextResponse.json({
    success: true,
    teamChat: {
      id: teamChatWithMembers.id,
      chatId: teamChatWithMembers.chatId,
      groupId: teamChatWithMembers.groupId,
      createdAt: teamChatWithMembers.createdAt.toISOString(),
      updatedAt: teamChatWithMembers.updatedAt.toISOString(),
      agents: teamChatWithMembers.agents.map((agent) => ({
        id: agent.id,
        username: agent.username,
        displayName: agent.displayName,
        profileImageUrl: agent.profileImageUrl,
        isAgent: agent.isAgent,
      })),
      agentCount: teamChatWithMembers.agents.length,
    },
  });
}

/**
 * POST /api/agents/team-chat
 * Ensure team chat exists (creates if needed) and sync existing agents
 */
export async function POST(req: NextRequest) {
  const user = await authenticateUser(req);

  const teamChat = await teamChatService.ensureTeamChat(user.id);

  // Sync any existing agents that aren't in the team chat yet
  // (handles agents created before the team chat feature was implemented)
  const syncedCount = await teamChatService.syncExistingAgents(user.id);

  const agents = await teamChatService.getTeamChatAgents(
    user.id,
    teamChat.groupId
  );

  logger.info(
    `Team chat ensured for user ${user.id}`,
    { chatId: teamChat.chatId, syncedAgents: syncedCount },
    'TeamChatAPI'
  );

  return NextResponse.json({
    success: true,
    teamChat: {
      id: teamChat.id,
      chatId: teamChat.chatId,
      groupId: teamChat.groupId,
      createdAt: teamChat.createdAt.toISOString(),
      updatedAt: teamChat.updatedAt.toISOString(),
      agents: agents.map((agent) => ({
        id: agent.id,
        username: agent.username,
        displayName: agent.displayName,
        profileImageUrl: agent.profileImageUrl,
        isAgent: agent.isAgent,
      })),
      agentCount: agents.length,
    },
    syncedAgents: syncedCount,
  });
}

/**
 * DELETE /api/agents/team-chat
 * Reset/delete team chat (for clearing corrupted state)
 */
export async function DELETE(req: NextRequest) {
  const user = await authenticateUser(req);

  const teamChat = await teamChatService.getTeamChat(user.id);

  if (!teamChat) {
    return NextResponse.json(
      { success: false, error: 'No team chat exists to delete' },
      { status: 404 }
    );
  }

  // Delete all related data
  await db.delete(messages).where(eq(messages.chatId, teamChat.chatId));
  await db
    .delete(chatParticipants)
    .where(eq(chatParticipants.chatId, teamChat.chatId));
  await db.delete(chats).where(eq(chats.id, teamChat.chatId));
  await db
    .delete(groupMembers)
    .where(eq(groupMembers.groupId, teamChat.groupId));
  await db.delete(groups).where(eq(groups.id, teamChat.groupId));
  await db
    .delete(userAgentTeamChats)
    .where(eq(userAgentTeamChats.userId, user.id));

  logger.info(
    `Team chat deleted for user ${user.id}`,
    { chatId: teamChat.chatId, groupId: teamChat.groupId },
    'TeamChatAPI'
  );

  return NextResponse.json({
    success: true,
    message: 'Team chat deleted. Visit Command Center again to create a fresh one.',
  });
}

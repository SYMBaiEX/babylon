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
  and,
  chatParticipants,
  chats,
  db,
  eq,
  groupMembers,
  groups,
  inArray,
  messages,
  userAgentConfigs,
  userAgentTeamChats,
  users,
  withTransaction,
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

  // Fetch modelTier for each agent from userAgentConfigs
  const agentIds = teamChatWithMembers.agents.map((a) => a.id);
  const agentConfigs =
    agentIds.length > 0
      ? await db
          .select({
            userId: userAgentConfigs.userId,
            modelTier: userAgentConfigs.modelTier,
          })
          .from(userAgentConfigs)
          .where(inArray(userAgentConfigs.userId, agentIds))
      : [];

  // Create a map for quick lookup
  const modelTierMap = new Map(
    agentConfigs.map((c) => [c.userId, c.modelTier])
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
        modelTier: modelTierMap.get(agent.id) ?? 'free',
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

  // Per spec: Command Center is created when the user has at least one agent.
  // Avoid creating empty Command Centers for users without agents.
  const [agentExists] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.managedBy, user.id), eq(users.isAgent, true)))
    .limit(1);

  if (!agentExists) {
    return NextResponse.json(
      {
        success: false,
        error: 'No agents found',
        message: 'Create your first agent to initialize your Command Center.',
      },
      { status: 404 }
    );
  }

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

  // Fetch modelTier for each agent from userAgentConfigs
  const agentIds = agents.map((a) => a.id);
  const agentConfigs =
    agentIds.length > 0
      ? await db
          .select({
            userId: userAgentConfigs.userId,
            modelTier: userAgentConfigs.modelTier,
          })
          .from(userAgentConfigs)
          .where(inArray(userAgentConfigs.userId, agentIds))
      : [];

  // Create a map for quick lookup
  const modelTierMap = new Map(
    agentConfigs.map((c) => [c.userId, c.modelTier])
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
        modelTier: modelTierMap.get(agent.id) ?? 'free',
      })),
      agentCount: agents.length,
    },
    syncedAgents: syncedCount,
  });
}

/**
 * DELETE /api/agents/team-chat
 * Reset/delete team chat (for clearing corrupted state)
 *
 * ⚠️ DESTRUCTIVE OPERATION - DEVELOPMENT ONLY:
 * Disabled in production. Use only for development/testing.
 *
 * This permanently deletes all Command Center data including:
 * - All messages and conversation history
 * - Group membership records
 * - Chat participant records
 *
 * This operation cannot be undone. Use only for:
 * - Clearing corrupted state
 * - User account cleanup
 * - Development/testing reset
 *
 * The team chat will be recreated automatically when the user
 * visits Command Center again or when an agent is created.
 */
export async function DELETE(req: NextRequest) {
  // Gate destructive endpoint to development only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'This endpoint is disabled in production' },
      { status: 403 }
    );
  }

  const user = await authenticateUser(req);

  const teamChat = await teamChatService.getTeamChat(user.id);

  if (!teamChat) {
    return NextResponse.json(
      { success: false, error: 'No team chat exists to delete' },
      { status: 404 }
    );
  }

  logger.warn(
    `Deleting team chat (destructive operation)`,
    { chatId: teamChat.chatId, groupId: teamChat.groupId },
    'TeamChatAPI'
  );

  // Delete all related data in a transaction for atomicity
  await withTransaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.chatId, teamChat.chatId));
    await tx
      .delete(chatParticipants)
      .where(eq(chatParticipants.chatId, teamChat.chatId));
    await tx.delete(chats).where(eq(chats.id, teamChat.chatId));
    await tx
      .delete(groupMembers)
      .where(eq(groupMembers.groupId, teamChat.groupId));
    await tx.delete(groups).where(eq(groups.id, teamChat.groupId));
    await tx
      .delete(userAgentTeamChats)
      .where(eq(userAgentTeamChats.userId, user.id));
  });

  logger.info(
    `Team chat deleted`,
    { chatId: teamChat.chatId, groupId: teamChat.groupId },
    'TeamChatAPI'
  );

  return NextResponse.json({
    success: true,
    message:
      'Team chat deleted. Visit Command Center again to create a fresh one.',
  });
}

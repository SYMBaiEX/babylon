/**
 * Team Chat Service - Agent Command Center
 *
 * Manages the unified "Command Center" group chat for each user's agents.
 * Each user has exactly ONE team chat containing ALL their agents.
 *
 * Lifecycle:
 * - First agent created → Team chat auto-created
 * - Additional agents → Auto-added to team chat
 * - Agent deleted → Auto-removed from team chat
 * - All agents deleted → Team chat persists (for history)
 *
 * @packageDocumentation
 */

import {
  and,
  chatParticipants,
  chats,
  db,
  eq,
  generateSnowflakeId,
  groupMembers,
  groups,
  messages,
  type User,
  userAgentTeamChats,
  users,
  withTransaction,
} from '@babylon/db';
import { logger } from '../shared/logger';

/** Constants for Command Center */
const TEAM_CHAT_NAME = 'Command Center';
const TEAM_CHAT_DESCRIPTION = 'Coordinate all your agents in one place';

/** Team chat information returned by service methods */
export interface TeamChatInfo {
  id: string;
  userId: string;
  groupId: string;
  chatId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Team chat with members */
export interface TeamChatWithMembers extends TeamChatInfo {
  agents: User[];
}

/**
 * Service for managing user agent team chats (Command Center)
 */
export class TeamChatService {
  /**
   * Ensure a team chat exists for the user.
   * Creates one if it doesn't exist, returns existing if it does.
   *
   * @param userId - The human user ID (not agent ID)
   * @returns Team chat info with groupId and chatId
   */
  async ensureTeamChat(userId: string): Promise<TeamChatInfo> {
    // Check if team chat already exists
    const existing = await this.getTeamChat(userId);
    if (existing) {
      return existing;
    }

    // Create new team chat in a transaction
    const result = await withTransaction(async (tx) => {
      const now = new Date();
      const [groupId, chatId, teamChatId, memberId, participantId] =
        await Promise.all([
          generateSnowflakeId(),
          generateSnowflakeId(),
          generateSnowflakeId(),
          generateSnowflakeId(),
          generateSnowflakeId(),
        ]);

      // 1. Create the Group (type='agent' for agent team chats)
      await tx.insert(groups).values({
        id: groupId,
        name: TEAM_CHAT_NAME,
        description: TEAM_CHAT_DESCRIPTION,
        type: 'agent',
        ownerId: userId,
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Create the Chat linked to the group
      await tx.insert(chats).values({
        id: chatId,
        name: TEAM_CHAT_NAME,
        description: TEAM_CHAT_DESCRIPTION,
        isGroup: true,
        groupId,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Add user as owner of the group
      await tx.insert(groupMembers).values({
        id: memberId,
        groupId,
        userId,
        role: 'owner',
        addedBy: userId,
        joinedAt: now,
        isActive: true,
        messageCount: 0,
        qualityScore: 1.0,
      });

      // 4. Add user as chat participant
      await tx.insert(chatParticipants).values({
        id: participantId,
        chatId,
        userId,
        joinedAt: now,
        isActive: true,
      });

      // 5. Create the UserAgentTeamChat record
      await tx.insert(userAgentTeamChats).values({
        id: teamChatId,
        userId,
        groupId,
        chatId,
        createdAt: now,
        updatedAt: now,
      });

      // 6. Create welcome system message
      const welcomeMessageId = await generateSnowflakeId();
      await tx.insert(messages).values({
        id: welcomeMessageId,
        chatId,
        senderId: 'system',
        type: 'system',
        content:
          'Welcome to your Command Center! This is where you coordinate all your agents. Use @mentions to direct specific agents.',
        createdAt: now,
      });

      return {
        id: teamChatId,
        userId,
        groupId,
        chatId,
        createdAt: now,
        updatedAt: now,
      };
    });

    logger.info(
      `Team chat created for user ${userId}`,
      { groupId: result.groupId, chatId: result.chatId },
      'TeamChatService'
    );

    return result;
  }

  /**
   * Get the team chat for a user (if it exists)
   *
   * @param userId - The human user ID
   * @returns Team chat info or null if not found
   */
  async getTeamChat(userId: string): Promise<TeamChatInfo | null> {
    const [teamChat] = await db
      .select()
      .from(userAgentTeamChats)
      .where(eq(userAgentTeamChats.userId, userId))
      .limit(1);

    if (!teamChat) {
      return null;
    }

    return teamChat;
  }

  /**
   * Get the team chat with all member agents
   *
   * @param userId - The human user ID
   * @returns Team chat with agents or null if not found
   */
  async getTeamChatWithMembers(
    userId: string
  ): Promise<TeamChatWithMembers | null> {
    const teamChat = await this.getTeamChat(userId);
    if (!teamChat) {
      return null;
    }

    const agents = await this.getTeamChatAgents(userId, teamChat.groupId);

    return { ...teamChat, agents };
  }

  /**
   * Get all agents in the user's team chat
   *
   * @param userId - The human user ID
   * @param groupId - Optional group ID if already known (avoids extra query)
   * @returns Array of agent User objects
   */
  async getTeamChatAgents(userId: string, groupId?: string): Promise<User[]> {
    const gid = groupId ?? (await this.getTeamChat(userId))?.groupId;
    if (!gid) {
      return [];
    }

    // Get all active group members who are agents (not the owner)
    const memberRows = await db
      .select({ user: users })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(
        and(eq(groupMembers.groupId, gid), eq(groupMembers.isActive, true))
      )
      .orderBy(users.createdAt);

    // Filter to only agents (not the human owner)
    return memberRows
      .map((row) => row.user)
      .filter((u) => u.isAgent && u.managedBy === userId);
  }

  /**
   * Add an agent to the user's team chat
   *
   * @param userId - The human user ID (owner)
   * @param agentUserId - The agent user ID to add
   */
  async addAgentToTeamChat(userId: string, agentUserId: string): Promise<void> {
    // Ensure team chat exists
    const teamChat = await this.ensureTeamChat(userId);

    // Get agent info for the system message
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent) {
      throw new Error(`Agent not found: ${agentUserId}`);
    }

    if (!agent.isAgent) {
      throw new Error(`User ${agentUserId} is not an agent`);
    }

    if (agent.managedBy !== userId) {
      throw new Error(`Agent ${agentUserId} is not managed by user ${userId}`);
    }

    await withTransaction(async (tx) => {
      const now = new Date();
      const [memberId, participantId, messageId] = await Promise.all([
        generateSnowflakeId(),
        generateSnowflakeId(),
        generateSnowflakeId(),
      ]);

      // 1. Add agent to group members (upsert in case of re-add)
      await tx
        .insert(groupMembers)
        .values({
          id: memberId,
          groupId: teamChat.groupId,
          userId: agentUserId,
          role: 'member',
          addedBy: userId,
          joinedAt: now,
          isActive: true,
          messageCount: 0,
          qualityScore: 1.0,
        })
        .onConflictDoUpdate({
          target: [groupMembers.groupId, groupMembers.userId],
          set: {
            isActive: true,
            joinedAt: now,
            addedBy: userId,
            role: 'member',
          },
        });

      // 2. Add agent to chat participants (upsert)
      await tx
        .insert(chatParticipants)
        .values({
          id: participantId,
          chatId: teamChat.chatId,
          userId: agentUserId,
          joinedAt: now,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [chatParticipants.chatId, chatParticipants.userId],
          set: {
            isActive: true,
            joinedAt: now,
          },
        });

      // 3. Create system message announcing the agent joined
      const agentName = agent.displayName || agent.username || 'Agent';
      await tx.insert(messages).values({
        id: messageId,
        chatId: teamChat.chatId,
        senderId: 'system',
        type: 'system',
        content: `🤖 ${agentName} joined the team`,
        createdAt: now,
      });

      // 4. Update team chat timestamp
      await tx
        .update(userAgentTeamChats)
        .set({ updatedAt: now })
        .where(eq(userAgentTeamChats.userId, userId));
    });

    logger.info(
      `Agent ${agentUserId} added to team chat`,
      { userId, chatId: teamChat.chatId },
      'TeamChatService'
    );
  }

  /**
   * Remove an agent from the user's team chat
   *
   * @param userId - The human user ID (owner)
   * @param agentUserId - The agent user ID to remove
   */
  async removeAgentFromTeamChat(
    userId: string,
    agentUserId: string
  ): Promise<void> {
    const teamChat = await this.getTeamChat(userId);
    if (!teamChat) {
      // No team chat exists, nothing to remove from
      return;
    }

    // Get agent info for the system message (might be getting deleted, so fetch first)
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agentName = agent?.displayName || agent?.username || 'Agent';

    await withTransaction(async (tx) => {
      const now = new Date();
      const messageId = await generateSnowflakeId();

      // 1. Soft-delete from group members (set isActive=false)
      await tx
        .update(groupMembers)
        .set({
          isActive: false,
          kickedAt: now,
          kickReason: 'Agent deleted',
        })
        .where(
          and(
            eq(groupMembers.groupId, teamChat.groupId),
            eq(groupMembers.userId, agentUserId)
          )
        );

      // 2. Soft-delete from chat participants
      await tx
        .update(chatParticipants)
        .set({ isActive: false })
        .where(
          and(
            eq(chatParticipants.chatId, teamChat.chatId),
            eq(chatParticipants.userId, agentUserId)
          )
        );

      // 3. Create system message announcing the agent left
      await tx.insert(messages).values({
        id: messageId,
        chatId: teamChat.chatId,
        senderId: 'system',
        type: 'system',
        content: `🤖 ${agentName} left the team`,
        createdAt: now,
      });

      // 4. Update team chat timestamp
      await tx
        .update(userAgentTeamChats)
        .set({ updatedAt: now })
        .where(eq(userAgentTeamChats.userId, userId));
    });

    logger.info(
      `Agent ${agentUserId} removed from team chat`,
      { userId, chatId: teamChat.chatId },
      'TeamChatService'
    );
  }

  /**
   * Sync all existing agents to the team chat.
   *
   * This is useful for adding agents that were created before the team chat
   * feature was implemented, or if agents somehow got out of sync.
   *
   * @param userId - The human user ID
   * @returns Number of agents that were added
   */
  async syncExistingAgents(userId: string): Promise<number> {
    // Ensure team chat exists
    const teamChat = await this.ensureTeamChat(userId);

    // Get all agents owned by this user
    const allUserAgents = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.managedBy, userId), eq(users.isAgent, true)));

    if (allUserAgents.length === 0) {
      return 0;
    }

    // Get agents already in the team chat
    const existingMembers = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, teamChat.groupId),
          eq(groupMembers.isActive, true)
        )
      );

    const existingMemberIds = new Set(existingMembers.map((m) => m.userId));

    // Find agents that need to be added
    const agentsToAdd = allUserAgents.filter(
      (agent) => !existingMemberIds.has(agent.id)
    );

    if (agentsToAdd.length === 0) {
      return 0;
    }

    // Add each missing agent (silently, without system messages to avoid spam)
    for (const agent of agentsToAdd) {
      await this.addAgentToTeamChatSilent(userId, agent.id, teamChat);
    }

    logger.info(
      `Synced ${agentsToAdd.length} existing agent(s) to team chat`,
      { userId, agentIds: agentsToAdd.map((a) => a.id) },
      'TeamChatService'
    );

    return agentsToAdd.length;
  }

  /**
   * Add an agent to team chat without system message (for sync operations)
   */
  private async addAgentToTeamChatSilent(
    userId: string,
    agentUserId: string,
    teamChat: TeamChatInfo
  ): Promise<void> {
    const now = new Date();
    const [memberId, participantId] = await Promise.all([
      generateSnowflakeId(),
      generateSnowflakeId(),
    ]);

    // Add agent to group members (upsert)
    await db
      .insert(groupMembers)
      .values({
        id: memberId,
        groupId: teamChat.groupId,
        userId: agentUserId,
        role: 'member',
        addedBy: userId,
        joinedAt: now,
        isActive: true,
        messageCount: 0,
        qualityScore: 1.0,
      })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: {
          isActive: true,
          joinedAt: now,
          addedBy: userId,
          role: 'member',
        },
      });

    // Add agent to chat participants (upsert)
    await db
      .insert(chatParticipants)
      .values({
        id: participantId,
        chatId: teamChat.chatId,
        userId: agentUserId,
        joinedAt: now,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [chatParticipants.chatId, chatParticipants.userId],
        set: {
          isActive: true,
          joinedAt: now,
        },
      });
  }
}

/** Singleton instance */
export const teamChatService = new TeamChatService();

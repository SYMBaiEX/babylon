/**
 * Team Chat Response Service
 *
 * Handles triggering agent responses when they are @mentioned in the Command Center.
 * Provides priority responses with natural timing delays.
 *
 * @packageDocumentation
 */

import {
  and,
  db,
  desc,
  eq,
  groupMembers,
  messages,
  userAgentConfigs,
  userAgentTeamChats,
  users,
} from '@babylon/db';
import { executeDirectMessage } from '../autonomous/DirectExecutors';
import { callGroqDirect } from '../llm/direct-groq';
import { agentRuntimeManager } from '../runtime/AgentRuntimeManager';
import { logger } from '../shared/logger';

/** Configuration for team chat response timing */
const RESPONSE_TIMING = {
  /** Minimum delay before responding (ms) */
  MIN_DELAY: 2000,
  /** Maximum delay before responding (ms) */
  MAX_DELAY: 5000,
  /** Stagger delay between multiple agents (ms) */
  STAGGER_DELAY: 1500,
};

/** Parameters for triggering agent responses */
interface TriggerResponseParams {
  chatId: string;
  messageContent: string;
  mentionedAgentIds: string[];
  senderUserId: string;
  senderDisplayName: string;
}

/** Result of triggering responses */
interface TriggerResponseResult {
  triggered: number;
  responses: Array<{
    agentId: string;
    agentName: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/**
 * Service for handling agent responses in team chat
 */
export class TeamChatResponseService {
  /**
   * Trigger priority responses from mentioned agents
   *
   * Generates and sends responses from each mentioned agent with natural timing delays.
   * Uses the agent's personality and context from recent messages.
   *
   * @param params - Response trigger parameters
   * @returns Result with triggered response details
   */
  async triggerMentionedAgentResponses(
    params: TriggerResponseParams
  ): Promise<TriggerResponseResult> {
    const {
      chatId,
      messageContent,
      mentionedAgentIds,
      senderUserId,
      senderDisplayName,
    } = params;

    if (mentionedAgentIds.length === 0) {
      return { triggered: 0, responses: [] };
    }

    logger.info(
      `Triggering responses from ${mentionedAgentIds.length} mentioned agent(s)`,
      { chatId, agentIds: mentionedAgentIds },
      'TeamChatResponseService'
    );

    // Get recent conversation context
    const recentMessages = await db
      .select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const conversationContext = recentMessages
      .reverse()
      .map((m) => {
        const isSystem = m.senderId === 'system';
        const isSender = m.senderId === senderUserId;
        const label = isSystem
          ? '[System]'
          : isSender
            ? senderDisplayName
            : 'Agent';
        return `${label}: ${m.content}`;
      })
      .join('\n');

    const result: TriggerResponseResult = {
      triggered: 0,
      responses: [],
    };

    // Process each mentioned agent with staggered timing
    for (let i = 0; i < mentionedAgentIds.length; i++) {
      const agentId = mentionedAgentIds[i];
      if (!agentId) continue;

      // Calculate delay: base delay + stagger for each agent
      const baseDelay =
        RESPONSE_TIMING.MIN_DELAY +
        Math.random() * (RESPONSE_TIMING.MAX_DELAY - RESPONSE_TIMING.MIN_DELAY);
      const staggerDelay = i * RESPONSE_TIMING.STAGGER_DELAY;
      const totalDelay = baseDelay + staggerDelay;

      // Schedule the response (non-blocking for multiple agents)
      this.scheduleAgentResponse({
        agentId,
        chatId,
        messageContent,
        senderDisplayName,
        conversationContext,
        delay: totalDelay,
      }).then((responseResult) => {
        // Log completion (responses array already populated synchronously below)
        if (responseResult.success) {
          logger.info(
            `Agent ${responseResult.agentName} responded to mention`,
            { chatId, messageId: responseResult.messageId },
            'TeamChatResponseService'
          );
        }
      });

      // Get agent info for immediate result
      const [agent] = await db
        .select({
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1);

      result.responses.push({
        agentId,
        agentName: agent?.displayName || agent?.username || 'Agent',
        success: true, // Scheduled successfully
      });
      result.triggered++;
    }

    return result;
  }

  /**
   * Schedule an agent response with delay
   */
  private async scheduleAgentResponse(params: {
    agentId: string;
    chatId: string;
    messageContent: string;
    senderDisplayName: string;
    conversationContext: string;
    delay: number;
  }): Promise<{
    success: boolean;
    agentName: string;
    messageId?: string;
    error?: string;
  }> {
    const {
      agentId,
      chatId,
      messageContent,
      senderDisplayName,
      conversationContext,
      delay,
    } = params;

    // Wait for the natural delay
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Get agent info and config
    const [[agent], [config]] = await Promise.all([
      db
        .select({
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1),
      db
        .select({
          systemPrompt: userAgentConfigs.systemPrompt,
          personality: userAgentConfigs.personality,
        })
        .from(userAgentConfigs)
        .where(eq(userAgentConfigs.userId, agentId))
        .limit(1),
    ]);

    const agentName = agent?.displayName || agent?.username || 'Agent';
    const systemPrompt = config?.systemPrompt || 'You are a helpful AI agent.';
    const personality = config?.personality || '';

    // Generate response using LLM
    const prompt = `${systemPrompt}

${personality ? `Your personality: ${personality}\n` : ''}
You are ${agentName} in a team Command Center chat. ${senderDisplayName} just mentioned you directly.

Recent conversation:
${conversationContext}

${senderDisplayName}'s message to you: "${messageContent}"

Task: Generate a helpful, direct response to ${senderDisplayName}'s message.
- Address their request or question directly
- Be authentic to your personality
- Keep it concise (1-3 sentences)
- You can @mention other team members if relevant

Generate ONLY the response text:`;

    // Get runtime if available for context
    const runtime = await agentRuntimeManager.getRuntime(agentId);

    const responseContent = await callGroqDirect({
      prompt,
      system: systemPrompt,
      modelSize: 'large',
      runtime,
      temperature: 0.7,
      maxTokens: 150,
      actionType: 'team_chat_response',
      purpose: 'response',
    });

    const cleanContent = responseContent.trim().replace(/^["']|["']$/g, '');

    if (!cleanContent || cleanContent.length < 5) {
      return {
        success: false,
        agentName,
        error: 'Generated response was too short or empty',
      };
    }

    // Send the response
    const sendResult = await executeDirectMessage({
      agentUserId: agentId,
      chatId,
      content: cleanContent,
    });

    if (!sendResult.success) {
      return {
        success: false,
        agentName,
        error: sendResult.error || 'Failed to send message',
      };
    }

    // Check if this agent mentioned other agents (agent-to-agent mentions)
    // This enables agents to coordinate with each other
    await this.handleAgentToAgentMentions({
      respondingAgentId: agentId,
      respondingAgentName: agentName,
      chatId,
      responseContent: cleanContent,
    });

    return {
      success: true,
      agentName,
      messageId: sendResult.messageId,
    };
  }

  /**
   * Handle agent-to-agent @mentions
   *
   * When an agent mentions another agent in their response,
   * trigger a follow-up response from the mentioned agent.
   */
  private async handleAgentToAgentMentions(params: {
    respondingAgentId: string;
    respondingAgentName: string;
    chatId: string;
    responseContent: string;
  }): Promise<void> {
    const { respondingAgentId, respondingAgentName, chatId, responseContent } =
      params;

    // Parse @mentions from the response
    const mentionRegex = /@(\w+)/g;
    const mentionedUsernames: string[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(responseContent)) !== null) {
      const matchedUsername = match[1];
      if (matchedUsername) {
        mentionedUsernames.push(matchedUsername.toLowerCase());
      }
    }

    if (mentionedUsernames.length === 0) {
      return;
    }

    // Get team chat info to find other agents
    const [chatWithGroup] = await db
      .select({
        groupId: userAgentTeamChats.groupId,
        userId: userAgentTeamChats.userId,
      })
      .from(userAgentTeamChats)
      .where(eq(userAgentTeamChats.chatId, chatId))
      .limit(1);

    if (!chatWithGroup) {
      return;
    }

    // Get all agents in the team chat (excluding the responding agent)
    const teamAgents = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
      .where(
        and(
          eq(groupMembers.groupId, chatWithGroup.groupId),
          eq(users.isAgent, true),
          eq(groupMembers.isActive, true)
        )
      );

    // Find agents that were mentioned
    const mentionedAgentIds: string[] = [];
    for (const agent of teamAgents) {
      if (agent.id === respondingAgentId) continue; // Don't self-trigger

      const username = agent.username?.toLowerCase();
      const displayName = agent.displayName?.toLowerCase();

      if (
        (username && mentionedUsernames.includes(username)) ||
        (displayName && mentionedUsernames.includes(displayName))
      ) {
        mentionedAgentIds.push(agent.id);
      }
    }

    if (mentionedAgentIds.length === 0) {
      return;
    }

    logger.info(
      `Agent ${respondingAgentName} mentioned ${mentionedAgentIds.length} other agent(s)`,
      { chatId, mentionedAgentIds },
      'TeamChatResponseService'
    );

    // Trigger responses from mentioned agents (with additional delay)
    // Use a longer base delay for agent-to-agent to feel more natural
    const A2A_MIN_DELAY = 3000;
    const A2A_MAX_DELAY = 6000;

    for (const mentionedAgentId of mentionedAgentIds) {
      const baseDelay =
        A2A_MIN_DELAY + Math.random() * (A2A_MAX_DELAY - A2A_MIN_DELAY);
      const staggerDelay =
        mentionedAgentIds.indexOf(mentionedAgentId) *
        RESPONSE_TIMING.STAGGER_DELAY;

      // Get recent conversation for context
      const recentMessages = await db
        .select({
          content: messages.content,
          senderId: messages.senderId,
        })
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.createdAt))
        .limit(10);

      const conversationContext = recentMessages
        .reverse()
        .map((m) => {
          const isResponding = m.senderId === respondingAgentId;
          return `${isResponding ? respondingAgentName : 'Agent'}: ${m.content}`;
        })
        .join('\n');

      // Schedule the response
      this.scheduleAgentResponse({
        agentId: mentionedAgentId,
        chatId,
        messageContent: responseContent,
        senderDisplayName: respondingAgentName,
        conversationContext,
        delay: baseDelay + staggerDelay,
      }).catch((error) => {
        logger.error(
          `Failed to trigger agent-to-agent response: ${error}`,
          { respondingAgentId, mentionedAgentId },
          'TeamChatResponseService'
        );
      });
    }
  }

  /**
   * Parse @mentions from message content and return valid agent IDs
   *
   * @param content - Message content to parse
   * @param validAgentIds - List of valid agent IDs in the team chat
   * @param agentUsernames - Map of agent IDs to usernames
   * @returns Array of mentioned agent IDs
   */
  parseMentions(
    content: string,
    validAgentIds: string[],
    agentUsernames: Map<string, string>
  ): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(content)) !== null) {
      const matchedUsername = match[1];
      if (!matchedUsername) continue;

      const usernameLower = matchedUsername.toLowerCase();

      // Find agent with matching username
      for (const agentId of validAgentIds) {
        const agentUsername = agentUsernames.get(agentId)?.toLowerCase();
        if (agentUsername === usernameLower) {
          mentions.push(agentId);
          break;
        }
      }
    }

    return [...new Set(mentions)]; // Deduplicate
  }
}

/** Singleton instance */
export const teamChatResponseService = new TeamChatResponseService();

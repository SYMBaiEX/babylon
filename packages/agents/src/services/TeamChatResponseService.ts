/**
 * Team Chat Response Service
 *
 * Handles triggering agent responses when they are @mentioned in the Command Center.
 * Provides priority responses with natural timing delays.
 *
 * @packageDocumentation
 */

import { broadcastTypingIndicator } from '@babylon/api';
import {
  and,
  db,
  desc,
  eq,
  groupMembers,
  inArray,
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

/** Configuration for agent-to-agent loop prevention */
const LOOP_PREVENTION = {
  /** Maximum depth of agent-to-agent mention chains */
  MAX_CHAIN_DEPTH: 3,
  /** Cooldown period per agent per chat (ms) - prevents same agent responding twice in this window */
  AGENT_COOLDOWN_MS: 30000,
  /** Cleanup interval for expired cooldowns (ms) */
  CLEANUP_INTERVAL_MS: 60000,
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
   * Tracks recent agent responses per chat to prevent loops.
   * Key: `${chatId}:${agentId}`, Value: timestamp of last response
   */
  private agentResponseCooldowns = new Map<string, number>();

  /**
   * Tracks active conversation chains to prevent loops across cooldown resets.
   * Key: chatId, Value: { chainId, agentsSeen, startedAt }
   * A chain is reset when a human sends a new message.
   */
  private activeChains = new Map<
    string,
    { chainId: string; agentsSeen: Set<string>; startedAt: number }
  >();

  /** Cleanup interval handle */
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup (prevents latency spikes from on-trigger cleanup)
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of expired cooldowns and chains
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupIntervalHandle) return;
    this.cleanupIntervalHandle = setInterval(() => {
      this.cleanupExpiredEntries();
    }, LOOP_PREVENTION.CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup expired cooldowns and stale chains
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const cooldownCutoff = now - LOOP_PREVENTION.AGENT_COOLDOWN_MS;

    // Clean expired cooldowns
    for (const [key, timestamp] of this.agentResponseCooldowns) {
      if (timestamp < cooldownCutoff) {
        this.agentResponseCooldowns.delete(key);
      }
    }

    // Clean stale chains (older than 5 minutes - conversation likely moved on)
    const chainExpiry = 5 * 60 * 1000;
    for (const [chatId, chain] of this.activeChains) {
      if (now - chain.startedAt > chainExpiry) {
        this.activeChains.delete(chatId);
      }
    }
  }

  /**
   * Check if an agent is on cooldown (recently responded) in a chat
   */
  private isAgentOnCooldown(chatId: string, agentId: string): boolean {
    const key = `${chatId}:${agentId}`;
    const lastResponse = this.agentResponseCooldowns.get(key);
    if (!lastResponse) return false;
    return Date.now() - lastResponse < LOOP_PREVENTION.AGENT_COOLDOWN_MS;
  }

  /**
   * Check if an agent has already participated in the current conversation chain.
   * This prevents loops even after cooldowns expire within the same chain.
   */
  private hasAgentRespondedInChain(chatId: string, agentId: string): boolean {
    const chain = this.activeChains.get(chatId);
    if (!chain) return false;
    return chain.agentsSeen.has(agentId);
  }

  /**
   * Start a new conversation chain (called when human sends a message)
   */
  private startNewChain(chatId: string): string {
    const chainId = `${chatId}:${Date.now()}`;
    this.activeChains.set(chatId, {
      chainId,
      agentsSeen: new Set(),
      startedAt: Date.now(),
    });
    return chainId;
  }

  /**
   * Mark an agent as having responded in a chat and current chain
   */
  private markAgentResponded(chatId: string, agentId: string): void {
    const key = `${chatId}:${agentId}`;
    this.agentResponseCooldowns.set(key, Date.now());

    // Also mark in the active chain
    const chain = this.activeChains.get(chatId);
    if (chain) {
      chain.agentsSeen.add(agentId);
    }
  }

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

    // Deduplicate and filter out empty/whitespace agent IDs
    const uniqueAgentIds = [
      ...new Set(mentionedAgentIds.map((id) => id?.trim()).filter(Boolean)),
    ];

    if (uniqueAgentIds.length === 0) {
      return { triggered: 0, responses: [] };
    }

    // Human message starts a new conversation chain (resets loop prevention)
    this.startNewChain(chatId);

    logger.info(
      `Triggering responses from ${uniqueAgentIds.length} mentioned agent(s)`,
      { chatId, agentIds: uniqueAgentIds },
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

    // Batch fetch all agent info upfront (performance optimization)
    const agentInfoMap = new Map<
      string,
      { displayName: string | null; username: string | null }
    >();
    if (uniqueAgentIds.length > 0) {
      const agentInfoRows = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(inArray(users.id, uniqueAgentIds));

      for (const row of agentInfoRows) {
        agentInfoMap.set(row.id, {
          displayName: row.displayName,
          username: row.username,
        });
      }
    }

    // Process each mentioned agent with staggered timing
    for (let i = 0; i < uniqueAgentIds.length; i++) {
      const agentId = uniqueAgentIds[i];
      if (!agentId) continue;

      // Get agent info from batch (no per-agent DB query)
      const agent = agentInfoMap.get(agentId);
      const agentName = agent?.displayName || agent?.username || 'Agent';

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
      })
        .then((responseResult) => {
          // Log completion (responses array already populated synchronously below)
          if (responseResult.success) {
            logger.info(
              `Agent ${responseResult.agentName} responded to mention`,
              { chatId, messageId: responseResult.messageId },
              'TeamChatResponseService'
            );
          } else {
            logger.warn(
              `Agent response failed: ${responseResult.error}`,
              { chatId, agentId },
              'TeamChatResponseService'
            );
          }
        })
        .catch((error) => {
          logger.error(
            `Failed to schedule agent response: ${error}`,
            { chatId, agentId },
            'TeamChatResponseService'
          );
        });

      result.responses.push({
        agentId,
        agentName,
        success: true, // Scheduled successfully
      });
      result.triggered++;
    }

    return result;
  }

  /**
   * Schedule an agent response with delay
   *
   * @param params.depth - Current depth in agent-to-agent chain (0 = user-initiated)
   */
  private async scheduleAgentResponse(params: {
    agentId: string;
    chatId: string;
    messageContent: string;
    senderDisplayName: string;
    conversationContext: string;
    delay: number;
    depth?: number;
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
      depth = 0,
    } = params;

    // Check cooldown and chain-based loop prevention before waiting (fail fast)
    // Only apply cooldown for agent-to-agent chains (depth > 0)
    // User-initiated mentions (depth === 0) should ALWAYS trigger a response
    if (depth > 0 && this.isAgentOnCooldown(chatId, agentId)) {
      logger.debug(
        `Agent ${agentId} on cooldown (A2A chain), skipping response`,
        { chatId, depth },
        'TeamChatResponseService'
      );
      return {
        success: false,
        agentName: 'Agent',
        error: 'Agent on cooldown',
      };
    }

    // Check if agent already responded in this conversation chain
    if (depth > 0 && this.hasAgentRespondedInChain(chatId, agentId)) {
      logger.debug(
        `Agent ${agentId} already responded in this chain, skipping`,
        { chatId, depth },
        'TeamChatResponseService'
      );
      return {
        success: false,
        agentName: 'Agent',
        error: 'Agent already responded in this chain',
      };
    }

    // Wait for the natural delay
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Re-check cooldown after delay (only for A2A chains)
    if (depth > 0 && this.isAgentOnCooldown(chatId, agentId)) {
      return {
        success: false,
        agentName: 'Agent',
        error: 'Agent on cooldown after delay',
      };
    }

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

    // Broadcast typing indicator before generating response
    broadcastTypingIndicator(chatId, agentId, agentName, true).catch(
      (error: Error) => {
        logger.warn(
          `Failed to broadcast typing indicator: ${error.message}`,
          { chatId, agentId },
          'TeamChatResponseService'
        );
      }
    );

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
      // Stop typing indicator on early failure
      broadcastTypingIndicator(chatId, agentId, agentName, false).catch(
        () => {}
      );
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

    // Stop typing indicator after sending (regardless of success)
    broadcastTypingIndicator(chatId, agentId, agentName, false).catch(
      (error: Error) => {
        logger.warn(
          `Failed to stop typing indicator: ${error.message}`,
          { chatId, agentId },
          'TeamChatResponseService'
        );
      }
    );

    if (!sendResult.success) {
      return {
        success: false,
        agentName,
        error: sendResult.error || 'Failed to send message',
      };
    }

    // Mark agent as having responded (for cooldown tracking)
    this.markAgentResponded(chatId, agentId);

    // Check if this agent mentioned other agents (agent-to-agent mentions)
    // This enables agents to coordinate with each other
    // Only allow if we haven't exceeded max chain depth
    if (depth < LOOP_PREVENTION.MAX_CHAIN_DEPTH) {
      await this.handleAgentToAgentMentions({
        respondingAgentId: agentId,
        respondingAgentName: agentName,
        chatId,
        responseContent: cleanContent,
        depth: depth + 1,
      });
    } else {
      logger.debug(
        `Max chain depth reached (${depth}), not triggering agent-to-agent mentions`,
        { chatId, agentId },
        'TeamChatResponseService'
      );
    }

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
   *
   * @param params.depth - Current chain depth (used to prevent infinite loops)
   */
  private async handleAgentToAgentMentions(params: {
    respondingAgentId: string;
    respondingAgentName: string;
    chatId: string;
    responseContent: string;
    depth: number;
  }): Promise<void> {
    const {
      respondingAgentId,
      respondingAgentName,
      chatId,
      responseContent,
      depth,
    } = params;

    const mentionedUsernames = this.extractMentionedUsernames(responseContent);
    if (mentionedUsernames.length === 0) return;

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

    // Fetch conversation context ONCE before the loop (performance optimization)
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

    for (let i = 0; i < mentionedAgentIds.length; i++) {
      const mentionedAgentId = mentionedAgentIds[i];
      if (!mentionedAgentId) continue;

      const baseDelay =
        A2A_MIN_DELAY + Math.random() * (A2A_MAX_DELAY - A2A_MIN_DELAY);
      const staggerDelay = i * RESPONSE_TIMING.STAGGER_DELAY;

      // Skip agents on cooldown
      if (this.isAgentOnCooldown(chatId, mentionedAgentId)) {
        logger.debug(
          `Skipping agent ${mentionedAgentId} - on cooldown`,
          { chatId, depth },
          'TeamChatResponseService'
        );
        continue;
      }

      // Skip agents that already responded in this chain
      if (this.hasAgentRespondedInChain(chatId, mentionedAgentId)) {
        logger.debug(
          `Skipping agent ${mentionedAgentId} - already in chain`,
          { chatId, depth },
          'TeamChatResponseService'
        );
        continue;
      }

      // Schedule the response with depth tracking
      this.scheduleAgentResponse({
        agentId: mentionedAgentId,
        chatId,
        messageContent: responseContent,
        senderDisplayName: respondingAgentName,
        conversationContext,
        delay: baseDelay + staggerDelay,
        depth,
      }).catch((error) => {
        logger.error(
          `Failed to trigger agent-to-agent response: ${error}`,
          { respondingAgentId, mentionedAgentId, depth },
          'TeamChatResponseService'
        );
      });
    }
  }

  /**
   * Extract @mentioned usernames from content
   */
  /**
   * Extract @mentioned usernames from content.
   *
   * Uses a regex that requires @ to be at start of word (not in email addresses).
   * Matches usernames with alphanumerics, underscores, hyphens, and dots.
   */
  private extractMentionedUsernames(content: string): string[] {
    const mentions: string[] = [];
    // Regex requires @ at word boundary (not after letters/numbers like in emails)
    // Matches: @username, "@username", start@username won't match
    const regex = /(?:^|[\s(,])@([A-Za-z0-9_.-]+)(?=[\s,.)!?]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) mentions.push(match[1].toLowerCase());
    }
    return mentions;
  }
}

/** Singleton instance */
export const teamChatResponseService = new TeamChatResponseService();

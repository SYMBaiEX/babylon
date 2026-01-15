/**
 * Team Chat Response Service
 *
 * Handles triggering agent responses when they are @mentioned in the Command Center.
 * Provides priority responses with natural timing delays.
 * Supports adaptive timing based on message complexity.
 *
 * @packageDocumentation
 */

import {
  broadcastThinkingIndicator,
  broadcastTypingIndicator,
} from '@babylon/api';
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

// =============================================================================
// Message Complexity Detection
// =============================================================================

/**
 * Message complexity levels for adaptive timing
 */
export type MessageComplexity = 'quick' | 'normal' | 'complex';

/**
 * Detect the complexity of a message to adjust response timing.
 *
 * Quick: Simple questions, greetings, yes/no queries (< 15 words, has question mark, no analysis keywords)
 * Normal: Standard requests and conversations
 * Complex: Analysis, research, comparisons, detailed explanations
 */
export function detectMessageComplexity(content: string): MessageComplexity {
  const normalizedContent = content.toLowerCase().trim();
  const words = normalizedContent.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Analysis/research keywords that indicate complex queries
  const complexKeywords = [
    'analyze',
    'analysis',
    'compare',
    'comparison',
    'explain',
    'explanation',
    'research',
    'investigate',
    'deep dive',
    'detailed',
    'comprehensive',
    'evaluate',
    'assessment',
    'strategy',
    'strategic',
    'forecast',
    'predict',
    'prediction',
    'breakdown',
    'break down',
    'summarize',
    'summary',
  ];

  // Quick response keywords - simple queries that need fast answers
  const quickKeywords = [
    'hi',
    'hello',
    'hey',
    'thanks',
    'thank you',
    'yes',
    'no',
    'ok',
    'okay',
    'sure',
    'got it',
    'understood',
    "what's up",
    'sup',
    'how are you',
    'good morning',
    'good night',
    'gm',
    'gn',
  ];

  // Check for complex indicators
  const hasComplexKeyword = complexKeywords.some(
    (keyword) =>
      normalizedContent.includes(keyword) ||
      words.some((w) => w === keyword.replace(' ', ''))
  );

  // Long messages are likely complex
  if (wordCount > 50 || hasComplexKeyword) {
    return 'complex';
  }

  // Check for quick indicators
  const hasQuickKeyword = quickKeywords.some(
    (keyword) =>
      normalizedContent === keyword ||
      normalizedContent.startsWith(keyword + ' ') ||
      normalizedContent.startsWith(keyword + '!')
  );

  // Short messages with question marks and no complex keywords
  const hasQuestionMark = content.includes('?');
  const isShort = wordCount <= 15;

  if (hasQuickKeyword || (isShort && hasQuestionMark && !hasComplexKeyword)) {
    return 'quick';
  }

  return 'normal';
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Adaptive timing configuration based on message complexity.
 * Quick messages get faster responses to feel snappy.
 * Complex messages get longer delays to feel thoughtful.
 */
const ADAPTIVE_TIMING = {
  quick: {
    minDelay: 500,
    maxDelay: 1500,
    staggerDelay: 800,
    maxTokens: 100,
    useThinkingIndicator: false,
  },
  normal: {
    minDelay: 1500,
    maxDelay: 3000,
    staggerDelay: 1200,
    maxTokens: 200,
    useThinkingIndicator: false,
  },
  complex: {
    minDelay: 2000,
    maxDelay: 4000,
    staggerDelay: 1500,
    maxTokens: 500,
    useThinkingIndicator: true,
  },
} as const;

/**
 * Agent ordering strategies for untagged messages.
 * Controls which agents respond when no specific agents are mentioned.
 */
export type AgentOrderingStrategy =
  | 'random'
  | 'created_asc'
  | 'created_desc'
  | 'alphabetical';

/**
 * Configuration for untagged message behavior.
 * When users send messages without @mentioning specific agents,
 * all agents in the team chat will respond.
 */
export interface UntaggedResponseConfig {
  /**
   * Maximum number of agents that will respond to an untagged message.
   * Set to null/undefined for unlimited (all agents respond).
   * Default: null (unlimited)
   */
  maxAgents: number | null;

  /**
   * Strategy for ordering/selecting which agents respond.
   * 'random' - Randomize the order (default)
   * 'created_asc' - Oldest agents first
   * 'created_desc' - Newest agents first
   * 'alphabetical' - Alphabetically by display name
   */
  orderingStrategy: AgentOrderingStrategy;

  /**
   * Stagger multiplier for untagged responses.
   * Increases delay between agents to prevent overwhelming responses.
   * Default: 1.5 (50% longer stagger than tagged responses)
   */
  staggerMultiplier: number;
}

/**
 * Default configuration for untagged responses.
 * Can be overridden by environment variables or runtime config.
 */
const DEFAULT_UNTAGGED_CONFIG: UntaggedResponseConfig = {
  maxAgents: null, // Unlimited by default
  orderingStrategy: 'random',
  staggerMultiplier: 1.5,
};

/** Legacy timing config - kept for backward compatibility in A2A chains */
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
  /**
   * Whether this is an untagged broadcast (all agents responding).
   * Affects timing and staggering behavior.
   */
  isUntaggedBroadcast?: boolean;
}

/** Result of triggering responses */
interface TriggerResponseResult {
  triggered: number;
  complexity: MessageComplexity;
  responses: Array<{
    agentId: string;
    agentName: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/** Size limits for in-memory maps to prevent unbounded growth */
const MAP_LIMITS = {
  MAX_COOLDOWN_ENTRIES: 10000,
  MAX_CHAIN_ENTRIES: 1000,
} as const;

/** Maximum length for user content in prompts to prevent token overflow */
const MAX_PROMPT_CONTENT_LENGTH = 2000;

/** Maximum length for LLM-generated responses before storage */
const MAX_RESPONSE_CONTENT_LENGTH = 4000;

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
   * Stop the periodic cleanup (for graceful shutdown or tests)
   */
  public stopPeriodicCleanup(): void {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle);
      this.cleanupIntervalHandle = null;
    }
  }

  /**
   * Start periodic cleanup of expired cooldowns and chains
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupIntervalHandle) return;
    this.cleanupIntervalHandle = setInterval(() => {
      this.cleanupExpiredEntries();
    }, LOOP_PREVENTION.CLEANUP_INTERVAL_MS);
    // Avoid keeping the process alive solely due to this interval (best-effort for serverless)
    this.cleanupIntervalHandle.unref?.();
  }

  /**
   * Cleanup expired cooldowns and stale chains, enforce size limits
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

    // Enforce size limit on cooldowns (evict oldest entries)
    if (this.agentResponseCooldowns.size > MAP_LIMITS.MAX_COOLDOWN_ENTRIES) {
      const entries = [...this.agentResponseCooldowns.entries()];
      entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp (oldest first)
      const toDelete = entries.slice(
        0,
        entries.length - MAP_LIMITS.MAX_COOLDOWN_ENTRIES
      );
      for (const [key] of toDelete) {
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

    // Enforce size limit on chains (evict oldest entries)
    if (this.activeChains.size > MAP_LIMITS.MAX_CHAIN_ENTRIES) {
      const entries = [...this.activeChains.entries()];
      entries.sort((a, b) => a[1].startedAt - b[1].startedAt); // Sort by startedAt (oldest first)
      const toDelete = entries.slice(
        0,
        entries.length - MAP_LIMITS.MAX_CHAIN_ENTRIES
      );
      for (const [key] of toDelete) {
        this.activeChains.delete(key);
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
   * Uses adaptive timing based on message complexity:
   * - Quick messages (greetings, simple questions): 500-1500ms delay
   * - Normal messages: 1500-3000ms delay
   * - Complex messages (analysis, research): 2000-4000ms delay with thinking indicator
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
      isUntaggedBroadcast = false,
    } = params;

    // Deduplicate and filter out empty/whitespace agent IDs
    const uniqueAgentIds = [
      ...new Set(mentionedAgentIds.map((id) => id?.trim()).filter(Boolean)),
    ];

    // Detect message complexity for adaptive timing
    const complexity = detectMessageComplexity(messageContent);
    const timingConfig = ADAPTIVE_TIMING[complexity];

    if (uniqueAgentIds.length === 0) {
      return { triggered: 0, complexity, responses: [] };
    }

    // Human message starts a new conversation chain (resets loop prevention)
    this.startNewChain(chatId);

    logger.info(
      `Triggering responses from ${uniqueAgentIds.length} agent(s)`,
      {
        chatId,
        agentIds: uniqueAgentIds,
        complexity,
        isUntaggedBroadcast,
        timing: {
          minDelay: timingConfig.minDelay,
          maxDelay: timingConfig.maxDelay,
        },
      },
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
      complexity,
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

    // Calculate stagger delay with multiplier for untagged broadcasts
    const effectiveStaggerDelay = isUntaggedBroadcast
      ? timingConfig.staggerDelay * DEFAULT_UNTAGGED_CONFIG.staggerMultiplier
      : timingConfig.staggerDelay;

    // Process each mentioned agent with staggered timing
    for (let i = 0; i < uniqueAgentIds.length; i++) {
      const agentId = uniqueAgentIds[i];
      if (!agentId) continue;

      // Get agent info from batch (no per-agent DB query)
      const agent = agentInfoMap.get(agentId);
      const agentName = agent?.displayName || agent?.username || 'Agent';

      // Calculate delay using adaptive timing: base delay + stagger for each agent
      const baseDelay =
        timingConfig.minDelay +
        Math.random() * (timingConfig.maxDelay - timingConfig.minDelay);
      const staggerDelay = i * effectiveStaggerDelay;
      const totalDelay = baseDelay + staggerDelay;

      // Schedule the response (non-blocking for multiple agents)
      // Pass pre-fetched agentName and complexity config to avoid redundant query
      this.scheduleAgentResponse({
        agentId,
        chatId,
        messageContent,
        senderDisplayName,
        conversationContext,
        delay: totalDelay,
        agentName,
        complexity,
        maxTokens: timingConfig.maxTokens,
        useThinkingIndicator: timingConfig.useThinkingIndicator,
      })
        .then((responseResult) => {
          // Log completion (responses array already populated synchronously below)
          if (responseResult.success) {
            logger.info(
              `Agent ${responseResult.agentName} responded`,
              { chatId, messageId: responseResult.messageId, complexity },
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
   * @param params.agentName - Pre-fetched agent name (optimization to avoid redundant query)
   * @param params.complexity - Message complexity for adaptive response generation
   * @param params.maxTokens - Max tokens for LLM response (based on complexity)
   * @param params.useThinkingIndicator - Whether to show thinking indicator instead of typing
   */
  private async scheduleAgentResponse(params: {
    agentId: string;
    chatId: string;
    messageContent: string;
    senderDisplayName: string;
    conversationContext: string;
    delay: number;
    depth?: number;
    agentName?: string;
    complexity?: MessageComplexity;
    maxTokens?: number;
    useThinkingIndicator?: boolean;
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
      agentName: prefetchedAgentName,
      complexity = 'normal',
      maxTokens = 200,
      useThinkingIndicator = false,
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

    // Get agent config. Agent name may be pre-fetched from batch query (optimization).
    const [config] = await db
      .select({
        systemPrompt: userAgentConfigs.systemPrompt,
        personality: userAgentConfigs.personality,
      })
      .from(userAgentConfigs)
      .where(eq(userAgentConfigs.userId, agentId))
      .limit(1);

    // Use pre-fetched name if available, otherwise fetch it
    let agentName = prefetchedAgentName;
    if (!agentName) {
      const [agent] = await db
        .select({
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1);
      agentName = agent?.displayName || agent?.username || 'Agent';
    }
    const systemPrompt = config?.systemPrompt || 'You are a helpful AI agent.';
    const personality = config?.personality || '';

    // Broadcast appropriate indicator before generating response
    // Use thinking indicator for complex queries, typing indicator otherwise
    if (useThinkingIndicator) {
      const thinkingLabel = this.getThinkingLabel(messageContent);
      broadcastThinkingIndicator(
        chatId,
        agentId,
        agentName,
        true,
        thinkingLabel
      ).catch((error: Error) => {
        logger.warn(
          `Failed to broadcast thinking indicator: ${error.message}`,
          { chatId, agentId },
          'TeamChatResponseService'
        );
      });
    } else {
      broadcastTypingIndicator(chatId, agentId, agentName, true).catch(
        (error: Error) => {
          logger.warn(
            `Failed to broadcast typing indicator: ${error.message}`,
            { chatId, agentId },
            'TeamChatResponseService'
          );
        }
      );
    }

    try {
      // Generate response using LLM
      // Sanitize user content to prevent prompt injection
      const sanitizedContent = this.sanitizeForPrompt(messageContent);
      const sanitizedContext = this.sanitizeForPrompt(conversationContext);

      // Adjust prompt based on complexity
      const responseGuidance = this.getResponseGuidance(complexity);

      const prompt = `${systemPrompt}

${personality ? `Your personality: ${personality}\n` : ''}
You are ${agentName} in a team Command Center chat. ${senderDisplayName} just mentioned you directly.

Recent conversation:
${sanitizedContext}

${senderDisplayName}'s message to you: "${sanitizedContent}"

Task: Generate a helpful, direct response to ${senderDisplayName}'s message.
${responseGuidance}
- Be authentic to your personality
- You can @mention other team members if relevant

Generate ONLY the response text:`;

      // Get runtime if available for context
      const runtime = await agentRuntimeManager.getRuntime(agentId);

      const responseContent = await callGroqDirect({
        prompt,
        system: systemPrompt,
        modelSize: complexity === 'quick' ? 'small' : 'large',
        runtime,
        temperature: complexity === 'quick' ? 0.6 : 0.7,
        maxTokens,
        actionType: 'team_chat_response',
        purpose: 'response',
      });

      // Clean and validate LLM response before storage
      // - Remove surrounding quotes
      // - Enforce max length to match API validation (4000 chars)
      const cleanContent = responseContent
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, MAX_RESPONSE_CONTENT_LENGTH);

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
    } catch (error) {
      return {
        success: false,
        agentName,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate response',
      };
    } finally {
      // Stop indicator even if LLM generation or send fails
      if (useThinkingIndicator) {
        broadcastThinkingIndicator(chatId, agentId, agentName, false).catch(
          (error: Error) => {
            logger.warn(
              `Failed to stop thinking indicator: ${error.message}`,
              { chatId, agentId },
              'TeamChatResponseService'
            );
          }
        );
      } else {
        broadcastTypingIndicator(chatId, agentId, agentName, false).catch(
          (error: Error) => {
            logger.warn(
              `Failed to stop typing indicator: ${error.message}`,
              { chatId, agentId },
              'TeamChatResponseService'
            );
          }
        );
      }
    }
  }

  /**
   * Get a human-readable label for what the agent is thinking about.
   * Used in the thinking indicator UI.
   */
  private getThinkingLabel(content: string): string {
    const normalizedContent = content.toLowerCase();

    if (
      normalizedContent.includes('analyze') ||
      normalizedContent.includes('analysis')
    ) {
      return 'Analyzing...';
    }
    if (
      normalizedContent.includes('compare') ||
      normalizedContent.includes('comparison')
    ) {
      return 'Comparing options...';
    }
    if (
      normalizedContent.includes('research') ||
      normalizedContent.includes('investigate')
    ) {
      return 'Researching...';
    }
    if (
      normalizedContent.includes('market') ||
      normalizedContent.includes('trade') ||
      normalizedContent.includes('price')
    ) {
      return 'Analyzing market data...';
    }
    if (
      normalizedContent.includes('strategy') ||
      normalizedContent.includes('plan')
    ) {
      return 'Formulating strategy...';
    }
    if (
      normalizedContent.includes('explain') ||
      normalizedContent.includes('how')
    ) {
      return 'Preparing explanation...';
    }

    return 'Thinking...';
  }

  /**
   * Get response guidance based on message complexity.
   * Adjusts how verbose the agent should be.
   */
  private getResponseGuidance(complexity: MessageComplexity): string {
    switch (complexity) {
      case 'quick':
        return '- Keep it very brief (1 sentence)\n- Be direct and to the point';
      case 'complex':
        return '- Provide a thorough response\n- Address all aspects of the question\n- Use 2-4 sentences as needed';
      case 'normal':
      default:
        return '- Address their request or question directly\n- Keep it concise (1-3 sentences)';
    }
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
   * Sanitize user input for prompt injection prevention.
   * Escapes potential prompt delimiters, limits length, and handles edge cases.
   *
   * Hardening includes:
   * - Escape code block delimiters
   * - Collapse long runs of newlines
   * - Remove Unicode direction override characters (LTR/RTL overrides)
   * - Collapse very long runs of repeated characters (tokenization attack prevention)
   * - Truncate to max length
   */
  private sanitizeForPrompt(content: string): string {
    return (
      content
        // Remove Unicode direction override characters (can confuse models or hide text)
        // U+202A-U+202E: LTR/RTL embedding, override, isolate
        // U+2066-U+2069: isolate controls
        // U+200E, U+200F: LTR/RTL marks
        .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '')
        // Escape backticks to prevent code block injection
        .replace(/```/g, '` ` `')
        // Collapse long runs of newlines
        .replace(/\n{3,}/g, '\n\n')
        // Collapse very long runs of repeated characters (>50 same char in a row)
        // This prevents tokenization attacks and excessive token usage
        .replace(/(.)\1{50,}/g, (_match, char) => char.repeat(10) + '...')
        // Truncate to prevent token overflow
        .slice(0, MAX_PROMPT_CONTENT_LENGTH)
    );
  }

  /**
   * Extract @mentioned usernames from content.
   *
   * Uses a regex that requires @ to be at start of word (not in email addresses).
   * Matches usernames with alphanumerics, underscores, hyphens, and dots.
   * Trailing punctuation is stripped to handle "Hey @agent." at end of sentence.
   *
   * **Known Limitations:**
   * - URLs like `https://twitter.com/@username` may match `@username`
   * - Markdown links `[@mention](url)` may match `@mention`
   * - These edge cases are acceptable for team chat where such patterns are rare
   * - For stricter matching, consider negative lookbehind for `://` or `[`
   *
   * The current regex prioritizes simplicity and false positives over missing mentions.
   */
  private extractMentionedUsernames(content: string): string[] {
    const mentions: string[] = [];
    // Regex requires @ at word boundary (not after letters/numbers like in emails)
    // Matches: @username, "@username", start@username won't match
    // Known limitation: URLs like https://example.com/@user may still match
    const regex = /(?:^|[\s(,])@([A-Za-z0-9_.-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        // Strip trailing punctuation that might be sentence-ending
        const username = match[1].replace(/[.,!?;:)]+$/, '');
        if (username) mentions.push(username.toLowerCase());
      }
    }
    return mentions;
  }
}

/** Singleton instance */
export const teamChatResponseService = new TeamChatResponseService();

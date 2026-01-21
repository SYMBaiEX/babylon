/**
 * Team Chat Response Service
 *
 * Handles triggering agent responses when they are @mentioned in the Command Center.
 * Uses agent's configured model tier (free/pro) via runtime.useModel like AgentChat.
 *
 * @packageDocumentation
 */

import { broadcastTypingIndicator } from '@babylon/api';
import {
  and,
  chatParticipants,
  db,
  eq,
  groupMembers,
  inArray,
  userAgentConfigs,
  userAgentTeamChats,
  users,
} from '@babylon/db';
import {
  type ActionResult,
  composePromptFromState,
  type Memory,
  ModelType,
  parseKeyValueXml,
  type State,
  type UUID,
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { executeDirectMessage } from '../autonomous/DirectExecutors';
import { agentRuntimeManager } from '../runtime/AgentRuntimeManager';
import type { AgentOrderingStrategy } from '../shared/agent-ordering';
import { logger } from '../shared/logger';

// =============================================================================
// Configuration
// =============================================================================

// Re-export ordering utilities from shared module
export {
  type AgentOrderingStrategy,
  type OrderableAgent,
  orderAgentIds,
  shuffleArray,
} from '../shared/agent-ordering';

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
}

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
  senderUsername?: string;
  /** Team chat owner info (for prompt context) */
  ownerDisplayName: string;
  ownerUsername: string;
  /**
   * Whether this is an untagged broadcast (all agents responding).
   * Affects timing and staggering behavior.
   */
  isUntaggedBroadcast?: boolean;
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

/** Size limits for in-memory maps to prevent unbounded growth */
const MAP_LIMITS = {
  MAX_COOLDOWN_ENTRIES: 10000,
  MAX_CHAIN_ENTRIES: 1000,
} as const;

/** Maximum length for user content in prompts to prevent token overflow */
const MAX_PROMPT_CONTENT_LENGTH = 2000;

/** Maximum length for LLM-generated responses before storage */
const MAX_RESPONSE_CONTENT_LENGTH = 4000;

/** Maximum iterations for multi-step execution */
const MAX_ITERATIONS = 6;

// =============================================================================
// Multi-Step Decision Templates (adapted from AgentChat for team chat)
// =============================================================================

const multiStepDecisionTemplate = `<task>
Determine the next step to take in this team chat conversation.
</task>

# Your Character
{{system}}

{{#if personality}}
## Personality
{{personality}}
{{/if}}

{{#if tradingStrategy}}
## Trading Strategy
{{tradingStrategy}}
{{/if}}

---

# Your Identity
You are **{{agentName}}** (@{{agentUsername}}).
Remember: YOU are @{{agentUsername}}. Do NOT greet yourself or talk to yourself.

---

# Team Chat Context
This is a team Command Center chat owned by **{{ownerDisplayName}}** (@{{ownerUsername}}).

## Team Members
{{teamMembers}}

---

# Conversation History
{{teamChatMessages}}

---

# Execution Context
Step {{iterationCount}} of {{maxIterations}}
Actions taken this round: {{actionCount}}
{{#if actionCount}}
You have ALREADY taken {{actionCount}} action(s) in this round. Review them carefully before deciding.
{{else}}
This is your FIRST decision step - no actions have been taken yet.
{{/if}}

---

{{actionsWithParams}}

---

# Actions Completed This Round
{{#if actionCount}}
{{actionResults}}
**IMPORTANT**: Use IDs/data from these results for follow-up actions. Do NOT repeat these actions.
{{else}}
No actions taken yet.
{{/if}}

---

# How to Decide: Action or Just Reply?

**Ask yourself**: Does this conversation need me to DO something, or can I just respond naturally?

## When to Take an Action
- Someone asks you to check data (markets, predictions, balance, PnL)
- Someone asks you to execute a trade (buy, sell, open/close position)
- Someone asks you to create content (post, comment)
- You need real information to answer properly

## When to Just Reply (No Action)
- Casual chat, greetings, thanks
- Sharing opinions or discussing ideas
- Questions you can answer from the conversation context
- Following up on previous discussion

---

# If Taking Actions

**AVOID REDUNDANCY**:
- ❌ Don't repeat the same action with the same parameters
- ❌ Don't buy/sell the same asset multiple times unless asked
- ✅ Different actions that provide different information are fine
- ✅ Use results from one action as input to another

**After each action, ask**: "Can I now contribute meaningfully to this conversation?"
- If YES → Set isFinish: true and respond
- If NO (need more info) → Take another action

---

# Decision Rules
1. **Read the conversation** - What's being discussed? What would be helpful?
2. **Check if action needed** - Do I need to look up data or do something?
3. **If actions already taken** - Review what you learned. Ready to respond?
4. **For trades**: Execute ONCE, then stop. Never repeat.
5. **When in doubt** → Just respond naturally (set isFinish: true with no action)

<keys>
"thought"
  What's happening in this conversation?
  Do I need to take an action, or can I just reply?
  If I took actions, what did I learn?
"action" Name of the action to execute (empty string "" if no action needed)
"parameters" JSON object with exact parameter names. Empty object {} if action has no parameters.
"isFinish" Set to true when ready to respond to the conversation
</keys>

REMEMBER:
- Step {{iterationCount}}/{{maxIterations}}, Actions this round: {{actionCount}}
- Don't repeat actions you've already taken
- Most conversations just need a friendly reply, not actions

# OUTPUT FORMAT
<output>
<response>
  <thought>Your reasoning about the conversation and what to do</thought>
  <action>ACTION_NAME or "" if just replying</action>
  <parameters>{} or {"param": "value"}</parameters>
  <isFinish>true when ready to respond, false if need more actions</isFinish>
</response>
</output>`;

const multiStepSummaryTemplate = `You are responding in a team chat after completing actions. Generate a helpful response.

# Your Character
{{system}}

{{#if personality}}
Personality: {{personality}}
{{/if}}

# Your Identity
You are **{{agentName}}** (@{{agentUsername}}).
Remember: YOU are @{{agentUsername}}. Do NOT greet yourself or talk to yourself.

# Team Chat Context
This is a team Command Center chat owned by **{{ownerDisplayName}}** (@{{ownerUsername}}).

## Team Members
{{teamMembers}}

# Conversation History
{{teamChatMessages}}

# Actions You Completed
{{actionResults}}

# Your Task
Write a natural response based on the conversation and action results:
- Summarize what you did and the results
- Include specific numbers, names, or data from the action results
- Stay in character with your personality
- You can @mention other team members if relevant (use their @username)
- NEVER greet or address yourself (@{{agentUsername}})

Output ONLY this XML with your actual response (not examples or placeholders):

<response>
<thought>Brief reasoning about what to tell the user</thought>
<text>Your helpful response with specific details from the actions</text>
</response>`;

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
   * Generates and sends responses from each mentioned agent immediately (no delay).
   * Each agent uses their configured model tier (free/pro) via runtime.useModel.
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
      senderUserId: _senderUserId,
      senderDisplayName,
      senderUsername,
      ownerDisplayName,
      ownerUsername,
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
      `Triggering responses from ${uniqueAgentIds.length} agent(s)`,
      { chatId, agentIds: uniqueAgentIds },
      'TeamChatResponseService'
    );

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

    // Process each mentioned agent immediately (no delays)
    for (const agentId of uniqueAgentIds) {
      if (!agentId) continue;

      // Get agent info from batch (no per-agent DB query)
      const agent = agentInfoMap.get(agentId);
      const agentName = agent?.displayName || agent?.username || 'Agent';

      // Trigger the response immediately (non-blocking)
      this.generateAgentResponse({
        agentId,
        chatId,
        messageContent,
        senderDisplayName,
        senderUsername,
        ownerDisplayName,
        ownerUsername,
        agentName,
      })
        .then((responseResult) => {
          if (responseResult.success) {
            logger.info(
              `Agent ${responseResult.agentName} responded`,
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
            `Failed to generate agent response: ${error}`,
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
   * Generate an agent response using multi-step execution (like AgentChat)
   *
   * Uses the agent's configured model tier (free/pro) via runtime.useModel.
   * Supports multi-step action execution (check balance, trade, etc.) before responding.
   * Uses TEAM_CHAT_MESSAGES provider for conversation context with proper names.
   *
   * @param params.depth - Current depth in agent-to-agent chain (0 = user-initiated)
   * @param params.agentName - Pre-fetched agent name (optimization to avoid redundant query)
   */
  private async generateAgentResponse(params: {
    agentId: string;
    chatId: string;
    messageContent: string;
    senderDisplayName: string;
    senderUsername?: string;
    ownerDisplayName: string;
    ownerUsername: string;
    depth?: number;
    agentName?: string;
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
      senderUsername: _senderUsername,
      ownerDisplayName,
      ownerUsername,
      depth = 0,
      agentName: prefetchedAgentName,
    } = params;

    // Check cooldown and chain-based loop prevention (fail fast)
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

    // Get agent config including model tier and trading strategy
    const [config] = await db
      .select({
        systemPrompt: userAgentConfigs.systemPrompt,
        personality: userAgentConfigs.personality,
        tradingStrategy: userAgentConfigs.tradingStrategy,
        modelTier: userAgentConfigs.modelTier,
      })
      .from(userAgentConfigs)
      .where(eq(userAgentConfigs.userId, agentId))
      .limit(1);

    // Fetch agent name and username
    let agentName = prefetchedAgentName;
    let agentUsername = '';
    
    const [agent] = await db
      .select({
        displayName: users.displayName,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);
    
    if (!agentName) {
      agentName = agent?.displayName || agent?.username || 'Agent';
    }
    agentUsername = agent?.username || '';

    // Fetch all team chat members for context
    const teamMembersList = await db
      .select({
        displayName: users.displayName,
        username: users.username,
        isAgent: users.isAgent,
      })
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.chatId, chatId));

    const teamMembers = teamMembersList
      .map((m) => {
        const name = m.displayName || m.username || 'Unknown';
        const username = m.username || '';
        const role = m.isAgent ? 'Agent' : 'Owner';
        const isSelf = username === agentUsername;
        return `- **${name}** (@${username}) - ${role}${isSelf ? ' (YOU)' : ''}`;
      })
      .join('\n');

    const systemPrompt = config?.systemPrompt || 'You are a helpful AI agent.';
    const personality = config?.personality || '';
    const tradingStrategy = config?.tradingStrategy || '';
    const modelTier = (config?.modelTier as 'free' | 'pro') || 'free';
    const modelType =
      modelTier === 'pro' ? ModelType.TEXT_LARGE : ModelType.TEXT_SMALL;

    // Broadcast typing indicator
    broadcastTypingIndicator(chatId, agentId, agentName, true).catch(
      (error: Error) => {
        logger.warn(
          `Failed to broadcast typing indicator: ${error.message}`,
          { chatId, agentId },
          'TeamChatResponseService'
        );
      }
    );

    try {
      const runtime = await agentRuntimeManager.getRuntime(agentId);

      // Create ElizaOS Memory object
      const elizaMessage: Memory = {
        id: uuidv4() as UUID,
        entityId: senderDisplayName as UUID,
        roomId: chatId as UUID,
        content: { text: messageContent },
        createdAt: Date.now(),
      };

      // Multi-step execution loop (like AgentChat)
      const traceActionResults: Array<
        ActionResult & {
          actionType: string;
          parameters?: Record<string, unknown>;
          timestamp: number;
        }
      > = [];
      let finalResponse: string | null = null;

      for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        logger.debug(
          `[TeamChat MultiStep] Iteration ${iteration}/${MAX_ITERATIONS}`,
          { agentId, chatId, actionsCompleted: traceActionResults.length },
          'TeamChatResponseService'
        );

        // Compose state with providers
        const state: State = await runtime.composeState(
          elizaMessage,
          ['TEAM_CHAT_MESSAGES', 'ACTION_STATE', 'ACTIONS'],
          true
        );

        // Add custom values to state
        state.values = {
          ...state.values,
          agentId,
          system: systemPrompt,
          personality: personality || '',
          tradingStrategy: tradingStrategy || '',
          agentName,
          agentUsername,
          teamMembers,
          ownerDisplayName,
          ownerUsername,
          iterationCount: iteration,
          maxIterations: MAX_ITERATIONS,
          actionCount: traceActionResults.length,
        };

        state.data = {
          ...state.data,
          actionResults: traceActionResults,
        };

        // Build prompt from decision template
        const prompt = composePromptFromState({
          state,
          template: multiStepDecisionTemplate,
        });

        // Get LLM decision with retry
        const MAX_PARSE_RETRIES = 3;
        let parsedStep: Record<string, unknown> | null = null;

        for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
          const response = await runtime.useModel(modelType, {
            prompt,
            temperature: attempt > 1 ? 0.5 : 0.7,
          });

          parsedStep = parseKeyValueXml(response);

          if (parsedStep) {
            logger.debug(
              `[TeamChat MultiStep] Parsed decision on attempt ${attempt}`,
              { action: parsedStep.action, isFinish: parsedStep.isFinish },
              'TeamChatResponseService'
            );
            break;
          }

          logger.warn(
            `[TeamChat MultiStep] Failed to parse decision (attempt ${attempt})`,
            { preview: response.substring(0, 200) },
            'TeamChatResponseService'
          );
        }

        if (!parsedStep) {
          finalResponse =
            "I'm having trouble processing your request. Could you try rephrasing?";
          break;
        }

        const thought = (parsedStep.thought as string) ?? '';
        const action = (parsedStep.action as string) ?? '';
        const parameters = parsedStep.parameters;
        const isFinish = parsedStep.isFinish;

        // No action - go to summary phase
        if (!action || action === '') {
          break;
        }

        // Execute action via runtime.processActions
        logger.info(
          `[TeamChat MultiStep] Executing action: ${action}`,
          { parameters, agentId },
          'TeamChatResponseService'
        );

        // Parse parameters
        let actionParams = {};
        if (parameters) {
          if (typeof parameters === 'string') {
            try {
              actionParams = JSON.parse(parameters);
            } catch {
              logger.warn(
                `[TeamChat MultiStep] Failed to parse parameters: ${parameters}`
              );
            }
          } else if (typeof parameters === 'object') {
            actionParams = parameters;
          }
        }

        state.data = {
          ...state.data,
          actionParams,
        };

        const actionContent = {
          text: `Executing action: ${action}`,
          actions: [action],
          thought: thought ?? '',
        };

        const actionMessage: Memory = {
          id: uuidv4() as UUID,
          entityId: runtime.agentId,
          roomId: elizaMessage.roomId,
          createdAt: Date.now(),
          content: actionContent,
        };

        try {
          // Capture result through callback (same pattern as AgentChat)
          let actionResult: {
            success?: boolean;
            text?: string;
            values?: Record<string, unknown>;
          } | null = null;

          await runtime.processActions(
            elizaMessage,
            [actionMessage],
            state,
            async (results: unknown) => {
              // Capture the first result from callback
              const resultsArray = results as Array<{
                content?: {
                  success?: boolean;
                  text?: string;
                  values?: Record<string, unknown>;
                };
              }> | null;
              if (resultsArray && resultsArray.length > 0) {
                const firstResult = resultsArray[0];
                if (firstResult) {
                  actionResult = {
                    success: firstResult.content?.success ?? true,
                    text:
                      typeof firstResult.content?.text === 'string'
                        ? firstResult.content.text
                        : undefined,
                    values: firstResult.content?.values,
                  };
                }
              }
              return [];
            }
          );

          // Fallback to state cache if callback didn't capture
          if (!actionResult) {
            const cachedState = (
              runtime as unknown as { stateCache?: Map<string, unknown> }
            ).stateCache?.get(`${elizaMessage.id}_action_results`) as
              | {
                  values?: {
                    actionResults?: Array<{
                      success?: boolean;
                      text?: string;
                      values?: Record<string, unknown>;
                    }>;
                  };
                }
              | undefined;
            const actionResultsFromCache =
              cachedState?.values?.actionResults || [];
            actionResult =
              actionResultsFromCache.length > 0
                ? (actionResultsFromCache[0] ?? null)
                : null;
          }

          const success = actionResult?.success ?? true;

          traceActionResults.push({
            actionType: action,
            success,
            text: actionResult?.text || `${action} executed`,
            error: success ? undefined : actionResult?.text,
            values: actionResult?.values,
            parameters: actionParams,
            timestamp: Date.now(),
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          traceActionResults.push({
            actionType: action,
            success: false,
            text: `Action failed: ${errorMsg}`,
            error: errorMsg,
            parameters: actionParams,
            timestamp: Date.now(),
          });
        }

        // Check if done
        if (isFinish === 'true' || isFinish === true) {
          break;
        }
      }

      // Generate summary/response
      {
        const state = await runtime.composeState(
          elizaMessage,
          ['TEAM_CHAT_MESSAGES', 'ACTION_STATE'],
          true
        );
        state.values = {
          ...state.values,
          agentId,
          system: systemPrompt,
          personality: personality || '',
          tradingStrategy: tradingStrategy || '',
          agentName,
          agentUsername,
          teamMembers,
          ownerDisplayName,
          ownerUsername,
        };
        state.data = {
          ...state.data,
          actionResults: traceActionResults,
        };

        const summaryPrompt = composePromptFromState({
          state,
          template: multiStepSummaryTemplate,
        });

        const SUMMARY_RETRIES = 3;
        let extractedText: string | undefined;

        for (let attempt = 1; attempt <= SUMMARY_RETRIES; attempt++) {
          const summaryResponse = await runtime.useModel(modelType, {
            prompt: summaryPrompt,
            temperature: attempt > 1 ? 0.5 : 0.7,
          });

          const summary = parseKeyValueXml(summaryResponse);
          extractedText = summary?.text as string | undefined;

          // Fallback: Try regex if parseKeyValueXml fails
          if (!extractedText) {
            const textMatch = summaryResponse.match(/<?\/?text>([^<]+)/i);
            if (textMatch?.[1]) {
              extractedText = textMatch[1].trim();
            }
          }

          if (extractedText) {
            logger.debug(
              `[TeamChat MultiStep] Parsed summary on attempt ${attempt}`,
              { preview: extractedText.substring(0, 50) },
              'TeamChatResponseService'
            );
            break;
          }

          logger.warn(
            `[TeamChat MultiStep] Failed to parse summary (attempt ${attempt})`,
            { preview: summaryResponse.substring(0, 200) },
            'TeamChatResponseService'
          );
        }

        finalResponse =
          extractedText ||
          (traceActionResults.length > 0
            ? 'Actions completed.'
            : "I'm here to help!");
      }

      const responseText = finalResponse ?? "I'm here to help!";

      // Clean and validate response
      const cleanContent = responseText
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

      // Mark agent as having responded
      this.markAgentResponded(chatId, agentId);

      // Handle agent-to-agent mentions
      if (depth < LOOP_PREVENTION.MAX_CHAIN_DEPTH) {
        await this.handleAgentToAgentMentions({
          respondingAgentId: agentId,
          respondingAgentName: agentName,
          chatId,
          responseContent: cleanContent,
          ownerDisplayName,
          ownerUsername,
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
    ownerDisplayName: string;
    ownerUsername: string;
    depth: number;
  }): Promise<void> {
    const {
      respondingAgentId,
      respondingAgentName,
      chatId,
      responseContent,
      ownerDisplayName,
      ownerUsername,
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

    // Trigger responses from mentioned agents immediately
    for (const mentionedAgentId of mentionedAgentIds) {
      if (!mentionedAgentId) continue;

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

      // Generate the response immediately with depth tracking
      this.generateAgentResponse({
        agentId: mentionedAgentId,
        chatId,
        messageContent: responseContent,
        senderDisplayName: respondingAgentName,
        ownerDisplayName,
        ownerUsername,
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

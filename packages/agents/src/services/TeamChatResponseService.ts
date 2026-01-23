/**
 * Team Chat Response Service
 *
 * Handles broadcasting messages to agents and letting them decide via LLM
 * whether to respond. Uses queuing with max limit per agent to prevent
 * concurrent processing issues.
 *
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
  userAgentConfigs,
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
import { logger } from '../shared/logger';

// =============================================================================
// Configuration
// =============================================================================

/** Parameters for broadcasting to agents */
interface BroadcastParams {
  chatId: string;
  senderId: string;
  ownerDisplayName: string;
  ownerUsername: string;
}

/** Maximum length for LLM-generated responses before storage */
const MAX_RESPONSE_CONTENT_LENGTH = 4000;

/** Maximum iterations for multi-step execution */
const MAX_ITERATIONS = 6;

/** Maximum depth of agent-to-agent response chain to prevent infinite loops */
const MAX_AGENT_CHAIN_DEPTH = 30;

/** Maximum concurrent agents that can call LLM at the same time (prevents rate limiting) */
const MAX_CONCURRENT_LLM_CALLS = 2;

/** Maximum time (ms) for a single agent's full response generation before timeout */
const AGENT_RESPONSE_TIMEOUT_MS = 120000; // 2 minutes

/** Maximum time (ms) for a single action execution before timeout */
const ACTION_EXECUTION_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutId)
  );
}

/** Parameters for triggering an agent response */
interface AgentTriggerParams {
  chatId: string;
  ownerDisplayName: string;
  ownerUsername: string;
  chainDepth: number;
}

// =============================================================================
// Global Agent Response Concurrency Limiter
// =============================================================================

/**
 * Simple semaphore to limit concurrent agent response processes.
 * Prevents rate limiting when multiple agents try to respond simultaneously.
 * This locks the ENTIRE response flow: shouldRespond -> execute actions -> final response
 */
class AgentResponseLimiter {
  private currentCount = 0;
  private waitQueue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  /**
   * Acquire a slot. Resolves immediately if slots available, otherwise waits.
   */
  async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrent) {
      this.currentCount++;
      logger.info(
        `[AgentResponseLimiter] Acquired slot (${this.currentCount}/${this.maxConcurrent} active)`,
        {},
        'TeamChatResponseService'
      );
      return;
    }

    // Wait for a slot to become available
    logger.info(
      `[AgentResponseLimiter] Queue full, waiting... (${this.waitQueue.length + 1} waiting)`,
      {},
      'TeamChatResponseService'
    );

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a slot. Wakes up the next waiting caller if any.
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      logger.info(
        `[AgentResponseLimiter] Released slot, starting next agent (${this.waitQueue.length} still waiting)`,
        {},
        'TeamChatResponseService'
      );
      next?.();
    } else {
      this.currentCount--;
      logger.info(
        `[AgentResponseLimiter] Released slot (${this.currentCount}/${this.maxConcurrent} active)`,
        {},
        'TeamChatResponseService'
      );
    }
  }

  /**
   * Execute a function with concurrency limiting
   */
  async withLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Global instance - limits how many agents can be generating responses at once
const agentResponseLimiter = new AgentResponseLimiter(MAX_CONCURRENT_LLM_CALLS);

// =============================================================================
// XML Response Extraction Helper
// =============================================================================

/**
 * Extract content from XML response using parseKeyValueXml
 * The response MUST be wrapped in <response> tags - anything outside (like <think>) is ignored
 */
function extractResponseContent(raw: string): Record<string, unknown> | null {
  // Extract <response>...</response> block (ignores anything outside like <think> tags)
  const responseMatch = raw.match(/<response>([\s\S]*?)<\/response>/i);
  if (!responseMatch) {
    return null;
  }

  // Parse the XML response with error handling
  try {
    const parsed = parseKeyValueXml(responseMatch[0]);
    return parsed;
  } catch (error) {
    logger.warn(
      'Failed to parse XML response',
      { error: error instanceof Error ? error.message : String(error) },
      'TeamChatResponseService'
    );
    return null;
  }
}

// =============================================================================
// Action Executor Template
// =============================================================================

const actionExecutorTemplate = `You are **{{agentName}}** (@{{agentUsername}}) in a team chat.

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

# Your Goal
{{goal}}

**Focus on**: {{focus}}
**Avoid**: {{avoid}}

---

# Team Chat Context
This is a team Command Center chat owned by **{{ownerDisplayName}}** (@{{ownerUsername}}).

## Team Members
{{teamMembers}}

---

# Conversation History
{{teamChatMessages}}

---

# Execution Status
Step {{iterationCount}} of {{maxIterations}}
{{#if actionCount}}
Actions completed: {{actionCount}}
{{actionResults}}
{{else}}
No actions taken yet.
{{/if}}

---

{{actionsWithParams}}

---

# Instructions

Execute actions until you achieve your goal, then respond with the result.

1. **Need data or to perform an action?** → Execute an action
2. **Goal achieved? Ready to respond?** → Write your response

## Rules
- Focus on achieving your goal
- Use action results in your response
- Stay in character with your personality
- ONLY speak for yourself - NEVER write as another agent
- **CHECK CONVERSATION HISTORY** - Look for messages from "{{agentName}}" (that's you). Do NOT repeat what you already said. Do NOT repeat what other agents said. Your response must be NEW and DIFFERENT.

---

# Output Format

IMPORTANT: Output ONLY the XML below. Do NOT use function calling or tools.

If you need to take an action:
<response>
<thought>Why I need this action</thought>
<action>ACTION_NAME</action>
<parameters>{"param": "value"}</parameters>
</response>

If you're ready to respond (goal achieved):
<response>
<thought>How I'll respond based on what I learned</thought>
<text>Your actual response to the conversation</text>
</response>`;

// =============================================================================
// Summary Template (Fallback when action loop ends without text response)
// =============================================================================

const summaryTemplate = `You are **{{agentName}}** (@{{agentUsername}}) in a team chat.

# Your Character
{{system}}

{{#if personality}}
## Personality
{{personality}}
{{/if}}

---

# Your Identity
You are **{{agentName}}** (@{{agentUsername}}).

---

# Context
This is a team Command Center chat owned by **{{ownerDisplayName}}** (@{{ownerUsername}}).

## Team Members
{{teamMembers}}

---

# Conversation History
{{teamChatMessages}}

---

# Your Goal
{{goal}}

## Focus on
{{focus}}

## Avoid
{{avoid}}

---

# Actions You Completed
{{actionResults}}

---

# Your Task

Based on the actions you completed and their results, write your response to the conversation.

- Synthesize the information from your action results
- Answer the original request or share what you learned
- Stay in character with your personality
- Be concise and helpful
- **CHECK CONVERSATION HISTORY for messages from "{{agentName}}"** (that's you) - Do NOT repeat what you already said. Do NOT repeat what other agents said. Your response must add NEW information.

---

# Output Format

IMPORTANT: Output ONLY the XML below.

<response>
<thought>How I'll summarize what I learned from my actions</thought>
<text>Your response to the conversation based on action results</text>
</response>`;

// =============================================================================
// Should Respond Decision Template
// =============================================================================

const shouldRespondTemplate = `You are **{{agentName}}** (@{{agentUsername}}) in a team chat.

# Your Character
{{system}}

{{#if personality}}
## Personality
{{personality}}
{{/if}}

---

# Your Identity
You are **{{agentName}}** (@{{agentUsername}}).
Remember: YOU are @{{agentUsername}}.

---

# Team Chat Context
This is a team Command Center chat owned by **{{ownerDisplayName}}** (@{{ownerUsername}}).

## Team Members
{{teamMembers}}

---

# Your Capabilities
{{actionsWithDescriptions}}

---

# Conversation History
{{teamChatMessages}}

---

# Step 1: Find the LAST message from the owner ({{ownerDisplayName}})

Look at the conversation history above and find the **most recent message from the owner**. This is your PRIMARY instruction.

**Owner's last request**: [Identify what they asked for]
**Has it been fulfilled?**: [YES/NO - check if the conversation achieved what they wanted]

---

# Step 2: Check @mentions

- Did the owner @mention YOU (@{{agentUsername}})? → You should respond
- Did they @mention OTHER agents but NOT you? → You should PROBABLY stay quiet and let them handle it
  - Exception: You may respond if you have CRITICAL information that would significantly change the conversation

---

# Step 3: Check for Repetition

Look for messages from **{{agentName}} (@{{agentUsername}})** - that's YOU.
- If you would say the same thing you already said → DO NOT respond
- If another agent already covered what you want to say → DO NOT respond

---

# Decision Rules

## RESPOND (YES) if:
- Owner's request is NOT yet fulfilled AND you can help fulfill it
- You are @mentioned and haven't replied
- You have NEW information to advance the conversation toward owner's goal
- Owner asked for debate/discussion and it's not concluded yet

## DON'T RESPOND (NO) if:
- Owner's request has been fulfilled
- Other agents were @mentioned but NOT you, AND you don't have critical new information
- You would just repeat what's already been said
- You have nothing NEW to contribute toward owner's goal

---

# Output Format

<response>
<thought>
1. Owner's last request: [what they asked]
2. Fulfilled yet? [yes/no and why]
3. Am I @mentioned or relevant? [yes/no]
4. Would I repeat myself or others? [yes/no]
</thought>
<decision>YES or NO</decision>
<goal>How I will help fulfill the owner's request (only if YES)</goal>
<focus>Specific NEW content to add (only if YES)</focus>
<avoid>What NOT to repeat (only if YES)</avoid>
</response>`;

/**
 * Service for handling agent responses in team chat.
 *
 * Flow:
 * 1. shouldAgentRespond() - Decides IF to respond and sets goal/focus/avoid
 * 2. Action executor loop - Executes actions until goal is achieved, then responds
 *
 * Uses a simple "processing" flag per agent - if already processing, skip.
 * The agent will see the latest conversation state from DB when it runs.
 */
export class TeamChatResponseService {
  /**
   * Tracks which agents are currently processing.
   * Key: agentId, Value: true if processing
   */
  private processingAgents = new Set<string>();

  /**
   * Trigger an agent to potentially respond.
   * If already processing, skip - they'll see the latest state anyway.
   */
  private triggerAgentResponse(
    agentId: string,
    params: AgentTriggerParams
  ): void {
    // Skip if already processing
    if (this.processingAgents.has(agentId)) {
      logger.debug(
        `Agent ${agentId} already processing, skipping`,
        { chatId: params.chatId },
        'TeamChatResponseService'
      );
      return;
    }

    // Mark as processing and start
    this.processingAgents.add(agentId);

    logger.debug(
      `Triggering response for agent ${agentId}`,
      { chatId: params.chatId, chainDepth: params.chainDepth },
      'TeamChatResponseService'
    );

    // Process async (don't block)
    this.processAgent(agentId, params).finally(() => {
      this.processingAgents.delete(agentId);
    });
  }

  /**
   * Process an agent's response with global concurrency limiting.
   */
  private async processAgent(
    agentId: string,
    params: AgentTriggerParams
  ): Promise<void> {
    try {
      // Generate response with global concurrency limit and timeout
      // This ensures only MAX_CONCURRENT_LLM_CALLS agents run the full response flow at once
      // Timeout prevents one stuck agent from blocking others indefinitely
      await withTimeout(
        agentResponseLimiter.withLimit(() =>
          this.generateAgentResponse({
            agentId,
            chatId: params.chatId,
            ownerDisplayName: params.ownerDisplayName,
            ownerUsername: params.ownerUsername,
            chainDepth: params.chainDepth,
          })
        ),
        AGENT_RESPONSE_TIMEOUT_MS,
        `Agent response timed out after ${AGENT_RESPONSE_TIMEOUT_MS / 1000}s`
      );
    } catch (error) {
      logger.error(
        `Failed to process agent response: ${error}`,
        { agentId, chatId: params.chatId },
        'TeamChatResponseService'
      );
    }
  }

  /**
   * Notify all agents in a chat about a new message.
   * Each agent will queue the message and decide whether to respond.
   *
   * @param params.chainDepth - Current agent-to-agent chain depth (0 for user messages)
   */
  public async notifyAgentsOfMessage(params: {
    chatId: string;
    senderId: string;
    ownerDisplayName: string;
    ownerUsername: string;
    chainDepth?: number;
  }): Promise<void> {
    const {
      chatId,
      senderId,
      ownerDisplayName,
      ownerUsername,
      chainDepth = 0,
    } = params;

    // Prevent infinite agent-to-agent loops by limiting chain depth
    if (chainDepth >= MAX_AGENT_CHAIN_DEPTH) {
      logger.info(
        `Skipping agent notification - max chain depth (${MAX_AGENT_CHAIN_DEPTH}) reached`,
        { chatId, senderId, chainDepth },
        'TeamChatResponseService'
      );
      return;
    }

    // Get all ACTIVE participants with isAgent flag in one query (no N+1)
    // Filter on isActive to exclude removed agents
    const participants = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        isAgent: users.isAgent,
      })
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.isActive, true)
        )
      );

    // Queue message for each agent (except the sender)
    for (const participant of participants) {
      // Skip if sender is this participant
      if (participant.id === senderId) {
        continue;
      }

      // Skip if not an agent (the owner is also a participant)
      if (!participant.isAgent) {
        continue;
      }

      logger.debug(
        `Queueing message for agent ${participant.displayName || participant.id}`,
        { chatId, senderId, chainDepth },
        'TeamChatResponseService'
      );

      this.triggerAgentResponse(participant.id, {
        chatId,
        ownerDisplayName,
        ownerUsername,
        chainDepth,
      });
    }
  }

  /**
   * Broadcast a message to all agents in the chat.
   * Each agent will decide via LLM (shouldAgentRespond) whether to reply.
   *
   * @param params - Broadcast parameters
   */
  async broadcastToAllAgents(params: BroadcastParams): Promise<void> {
    const { chatId, senderId, ownerDisplayName, ownerUsername } = params;

    logger.info(
      `Broadcasting message to all agents`,
      { chatId, senderId },
      'TeamChatResponseService'
    );

    // Just use the existing notifyAgentsOfMessage which already broadcasts to all
    await this.notifyAgentsOfMessage({
      chatId,
      senderId,
      ownerDisplayName,
      ownerUsername,
    });
  }

  /**
   * Generate an agent response using multi-step execution (like AgentChat)
   *
   * First calls shouldAgentRespond() to decide if the agent should respond.
   * If yes, uses multi-step action execution before generating final response.
   * Uses TEAM_CHAT_MESSAGES provider for conversation context with proper names.
   *
   * @param params.agentName - Pre-fetched agent name (optimization to avoid redundant query)
   * @param params.chainDepth - Current agent-to-agent chain depth for loop prevention
   */
  private async generateAgentResponse(params: {
    agentId: string;
    chatId: string;
    ownerDisplayName: string;
    ownerUsername: string;
    agentName?: string;
    chainDepth?: number;
  }): Promise<{
    success: boolean;
    agentName: string;
    messageId?: string;
    error?: string;
    skipped?: boolean;
  }> {
    const {
      agentId,
      chatId,
      ownerDisplayName,
      ownerUsername,
      agentName: prefetchedAgentName,
      chainDepth = 0,
    } = params;

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

    // Fetch all ACTIVE team chat members for context
    // Filter on isActive to exclude removed agents from prompt context
    const teamMembersList = await db
      .select({
        displayName: users.displayName,
        username: users.username,
        isAgent: users.isAgent,
      })
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.isActive, true)
        )
      );

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

    // First, decide if we should respond and get goal guidance
    const decision = await this.shouldAgentRespond({
      agentId,
      chatId,
      agentName,
      agentUsername,
      systemPrompt,
      personality,
      teamMembers,
      ownerDisplayName,
      ownerUsername,
      modelTier,
    });

    if (!decision.shouldRespond) {
      logger.info(
        `Agent ${agentName} decided not to respond: ${decision.reason}`,
        { agentId, chatId },
        'TeamChatResponseService'
      );
      return {
        success: true,
        agentName,
        skipped: true,
      };
    }

    // Extract goal guidance for action executor
    const goal = decision.goal || 'Respond naturally to the conversation';
    const focus = decision.focus || 'Be helpful and stay in character';
    const avoid = decision.avoid || "Don't repeat what others have said";

    logger.info(
      `Agent ${agentName} will respond`,
      { agentId, chatId, goal, focus, avoid },
      'TeamChatResponseService'
    );

    // Broadcast typing indicator and set up heartbeat
    // Frontend expires typing indicators after 5 seconds, so we re-send every 3 seconds
    const sendTypingHeartbeat = () => {
      broadcastTypingIndicator(chatId, agentId, agentName, true).catch(
        (error: Error) => {
          logger.warn(
            `Failed to broadcast typing indicator: ${error.message}`,
            { chatId, agentId },
            'TeamChatResponseService'
          );
        }
      );
    };

    // Send initial typing indicator
    sendTypingHeartbeat();

    // Set up heartbeat interval (every 3 seconds to stay ahead of 5 second expiry)
    const typingHeartbeatInterval = setInterval(sendTypingHeartbeat, 3000);

    try {
      const runtime = await agentRuntimeManager.getRuntime(agentId);

      // Create ElizaOS Memory object (conversation context comes from TEAM_CHAT_MESSAGES provider)
      const elizaMessage: Memory = {
        id: uuidv4() as UUID,
        entityId: agentId as UUID,
        roomId: chatId as UUID,
        content: { text: '' },
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

        // Add custom values to state (including goal guidance)
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
          // Goal guidance for action executor
          goal,
          focus,
          avoid,
          // Execution context
          iterationCount: iteration,
          maxIterations: MAX_ITERATIONS,
          actionCount: traceActionResults.length,
        };

        state.data = {
          ...state.data,
          actionResults: traceActionResults,
        };

        // Build prompt from action executor template
        const prompt = composePromptFromState({
          state,
          template: actionExecutorTemplate,
        });

        // Get LLM decision with retry
        const MAX_PARSE_RETRIES = 3;
        let parsedStep: Record<string, unknown> | null = null;
        for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
          const response = await runtime.useModel(modelType, {
            prompt,
            temperature: attempt > 1 ? 0.5 : 0.7,
          });

          // Use extractResponseContent to handle <think> tags and extract <response> block
          parsedStep = extractResponseContent(response);

          if (parsedStep) {
            logger.debug(
              `Parsed action response on attempt ${attempt}`,
              { action: parsedStep.action, hasText: !!parsedStep.text },
              'TeamChatResponseService'
            );
            break;
          }

          logger.warn(
            `Failed to parse action response (attempt ${attempt})`,
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
        const responseText = (parsedStep.text as string) ?? '';

        // If text field is present, agent is ready to respond (no more actions needed)
        if (responseText && responseText.trim()) {
          logger.info(
            `Agent ready to respond with text`,
            { agentId, textPreview: responseText.substring(0, 100) },
            'TeamChatResponseService'
          );
          finalResponse = responseText.trim();
          break;
        }

        // No action - break out of loop
        if (!action || action.trim() === '') {
          logger.debug(
            `No action and no text, breaking loop`,
            { agentId },
            'TeamChatResponseService'
          );
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

          // Wrap action execution with timeout to prevent hanging
          await withTimeout(
            runtime.processActions(
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
            ),
            ACTION_EXECUTION_TIMEOUT_MS,
            `Action ${action} timed out after ${ACTION_EXECUTION_TIMEOUT_MS / 1000}s`
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
      }

      // If no response was generated, use summary prompt as fallback
      if (!finalResponse) {
        logger.info(
          `Loop ended without text response, using summary fallback`,
          { agentId, actionsCompleted: traceActionResults.length },
          'TeamChatResponseService'
        );

        // Build summary state with action results
        const summaryState: State = await runtime.composeState(
          elizaMessage,
          ['TEAM_CHAT_MESSAGES'],
          true
        );

        summaryState.values = {
          ...summaryState.values,
          agentName,
          agentUsername,
          system: systemPrompt,
          personality: personality || '',
          teamMembers,
          ownerDisplayName,
          ownerUsername,
          goal: goal || 'Respond to the conversation',
          focus: focus || '',
          avoid: avoid || '',
        };

        // Pass action results directly - composePromptFromState handles formatting
        summaryState.data = {
          ...summaryState.data,
          actionResults: traceActionResults,
        };

        // Generate summary with retry
        const MAX_SUMMARY_RETRIES = 2;
        for (let attempt = 1; attempt <= MAX_SUMMARY_RETRIES; attempt++) {
          try {
            const summaryPrompt = composePromptFromState({
              state: summaryState,
              template: summaryTemplate,
            });

            const summaryResponse = await runtime.useModel(modelType, {
              prompt: summaryPrompt,
              temperature: 0.7,
            });

            const parsedSummary = extractResponseContent(summaryResponse);
            if (parsedSummary?.text) {
              finalResponse = (parsedSummary.text as string).trim();
              logger.info(
                `Summary fallback generated response`,
                { agentId, responsePreview: finalResponse.substring(0, 100) },
                'TeamChatResponseService'
              );
              break;
            }

            logger.warn(
              `Summary fallback failed to parse (attempt ${attempt})`,
              { preview: summaryResponse.substring(0, 200) },
              'TeamChatResponseService'
            );
          } catch (summaryError) {
            logger.error(
              `Summary fallback error (attempt ${attempt})`,
              {
                error:
                  summaryError instanceof Error
                    ? summaryError.message
                    : String(summaryError),
              },
              'TeamChatResponseService'
            );
          }
        }

        // If summary also failed, give up
        if (!finalResponse) {
          logger.warn(
            `Both loop and summary fallback failed to generate response`,
            { agentId, actionsCompleted: traceActionResults.length },
            'TeamChatResponseService'
          );
          return {
            success: false,
            agentName,
            error: 'Failed to generate response even with summary fallback',
          };
        }
      }

      const responseText = finalResponse ?? 'empty';

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

      // Notify other agents about this message (they can decide to respond)
      // Increment chain depth to track agent-to-agent conversation depth
      this.notifyAgentsOfMessage({
        chatId,
        senderId: agentId,
        ownerDisplayName,
        ownerUsername,
        chainDepth: chainDepth + 1,
      }).catch((err) => {
        logger.error(
          `Failed to notify agents of message: ${err}`,
          { chatId, agentId },
          'TeamChatResponseService'
        );
      });

      return {
        success: true,
        agentName,
        messageId: sendResult.messageId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        agentName,
        error: errorMsg,
      };
    } finally {
      // Stop the typing heartbeat interval
      clearInterval(typingHeartbeatInterval);

      // Send final "stop typing" signal
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
   * Decide if an agent should respond and what to do.
   * Returns goal/focus/avoid guidance for the action executor.
   * Includes retry mechanism for parsing failures.
   */
  private async shouldAgentRespond(params: {
    agentId: string;
    chatId: string;
    agentName: string;
    agentUsername: string;
    systemPrompt: string;
    personality: string;
    teamMembers: string;
    ownerDisplayName: string;
    ownerUsername: string;
    modelTier: 'free' | 'pro';
  }): Promise<{
    shouldRespond: boolean;
    reason: string;
    goal?: string;
    focus?: string;
    avoid?: string;
  }> {
    const {
      agentId,
      chatId,
      agentName,
      agentUsername,
      systemPrompt,
      personality,
      teamMembers,
      ownerDisplayName,
      ownerUsername,
      modelTier,
    } = params;

    const modelType =
      modelTier === 'pro' ? ModelType.TEXT_LARGE : ModelType.TEXT_SMALL;

    try {
      const runtime = await agentRuntimeManager.getRuntime(agentId);

      // Create ElizaOS Memory object for provider context
      const elizaMessage: Memory = {
        id: uuidv4() as UUID,
        entityId: agentId as UUID,
        roomId: chatId as UUID,
        content: { text: '' },
        createdAt: Date.now(),
      };

      // Compose state with TEAM_CHAT_MESSAGES and ACTIONS providers
      const state: State = await runtime.composeState(
        elizaMessage,
        ['TEAM_CHAT_MESSAGES', 'ACTIONS'],
        true
      );

      // Add custom values to state for template
      state.values = {
        ...state.values,
        agentName,
        agentUsername,
        system: systemPrompt,
        personality,
        ownerDisplayName,
        ownerUsername,
        teamMembers,
      };

      // Build prompt using composePromptFromState (handles Handlebars properly)
      const prompt = composePromptFromState({
        state,
        template: shouldRespondTemplate,
      });

      // Retry mechanism for parsing
      const MAX_PARSE_RETRIES = 3;
      let parsedResponse: Record<string, unknown> | null = null;

      for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
        const response = await runtime.useModel(modelType, {
          prompt,
          temperature: attempt > 1 ? 0.5 : 0.3, // Increase temperature on retry
        });

        // Use extractResponseContent to handle <think> tags and extract <response> block
        parsedResponse = extractResponseContent(response);

        if (parsedResponse?.decision) {
          logger.debug(
            `[ShouldRespond] Parsed decision on attempt ${attempt}`,
            {
              decision: parsedResponse.decision,
              thought: parsedResponse.thought,
              goal: parsedResponse.goal,
            },
            'TeamChatResponseService'
          );
          break;
        }

        // Fallback: try regex extraction for key fields
        const decisionMatch = response.match(
          /<decision>\s*(YES|NO)\s*<\/decision>/i
        );
        if (decisionMatch) {
          const thoughtMatch = response.match(
            /<thought>\s*([^<]+)\s*<\/thought>/i
          );
          const goalMatch = response.match(/<goal>\s*([^<]+)\s*<\/goal>/i);
          const focusMatch = response.match(/<focus>\s*([^<]+)\s*<\/focus>/i);
          const avoidMatch = response.match(/<avoid>\s*([^<]+)\s*<\/avoid>/i);

          parsedResponse = {
            decision: decisionMatch[1],
            thought: thoughtMatch?.[1]?.trim() || '',
            goal: goalMatch?.[1]?.trim() || '',
            focus: focusMatch?.[1]?.trim() || '',
            avoid: avoidMatch?.[1]?.trim() || '',
          };
          logger.debug(
            `[ShouldRespond] Fallback regex parsed on attempt ${attempt}`,
            { decision: parsedResponse.decision, goal: parsedResponse.goal },
            'TeamChatResponseService'
          );
          break;
        }

        logger.warn(
          `[ShouldRespond] Failed to parse decision (attempt ${attempt})`,
          { preview: response.substring(0, 200) },
          'TeamChatResponseService'
        );
      }

      if (!parsedResponse?.decision) {
        logger.warn(
          `[ShouldRespond] All parse attempts failed, defaulting to NO`,
          { agentId, chatId },
          'TeamChatResponseService'
        );
        return { shouldRespond: false, reason: 'Failed to parse decision' };
      }

      const decision = ((parsedResponse.decision as string) || '')
        .toUpperCase()
        .trim();
      const thought =
        ((parsedResponse.thought as string) || '').trim() || 'No reason given';

      if (decision !== 'YES') {
        return { shouldRespond: false, reason: thought };
      }

      // Extract guidance for action executor
      const goal =
        ((parsedResponse.goal as string) || '').trim() ||
        'Respond naturally to the conversation';
      const focus =
        ((parsedResponse.focus as string) || '').trim() ||
        'Be helpful and stay in character';
      const avoid =
        ((parsedResponse.avoid as string) || '').trim() ||
        "Don't repeat what others have said";

      logger.info(
        `[ShouldRespond] Decision: YES`,
        { agentUsername, goal, focus, avoid },
        'TeamChatResponseService'
      );

      return {
        shouldRespond: true,
        reason: thought,
        goal,
        focus,
        avoid,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        `[ShouldRespond] Failed: ${errorMsg}`,
        {
          agentId,
          chatId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        'TeamChatResponseService'
      );
      // Default to not responding on error (fail safe)
      return { shouldRespond: false, reason: 'Error making decision' };
    }
  }
}

/** Singleton instance */
export const teamChatResponseService = new TeamChatResponseService();

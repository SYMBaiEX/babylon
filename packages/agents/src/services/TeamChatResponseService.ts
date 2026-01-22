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

/** Maximum messages to keep in queue per agent (keeps latest, drops oldest) */
const MAX_QUEUE_SIZE = 2;

/** Maximum depth of agent-to-agent response chain to prevent infinite loops */
const MAX_AGENT_CHAIN_DEPTH = 3;

/** Queued message for an agent to process */
interface QueuedMessage {
  chatId: string;
  ownerDisplayName: string;
  ownerUsername: string;
  queuedAt: number;
  /** Tracks agent-to-agent chain depth to prevent infinite loops */
  chainDepth?: number;
}

/** Agent processing state */
interface AgentProcessingState {
  isProcessing: boolean;
  queue: QueuedMessage[];
}

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
- ONLY speak for yourself - NEVER write responses for other agents

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

{{actionsWithDescriptions}}

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
- ONLY speak for yourself - NEVER write as another agent or include their hypothetical responses

Output ONLY this XML with your actual response (not examples or placeholders):

<response>
<thought>Brief reasoning about what to tell the user</thought>
<text>Your helpful response with specific details from the actions</text>
</response>`;

// =============================================================================
// Should Respond Decision Template
// =============================================================================

const shouldRespondTemplate = `You are **{{agentName}}** (@{{agentUsername}}) in a team chat. Decide if you should respond.

# Your Character
{{system}}

{{#if personality}}
## Personality
{{personality}}
{{/if}}

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

# Decision Rule

Look at the conversation history above. Ask yourself:
1. **Did I already respond** to the most recent user request? (Check if YOUR messages appear after their request)
2. **Was I asked to do something** OR do I have something NEW to contribute?

⚠️ **IMPORTANT**: To perform ANY action above, you MUST respond YES. Saying NO means you cannot take any action.

## RESPOND (YES) if:
- Someone asked YOU to do something AND you haven't responded yet
- Someone @mentioned you (@{{agentUsername}}) AND you haven't replied yet
- You were asked a direct question AND you haven't answered yet
- You have genuinely NEW information (not repeating what you already said)

## DON'T RESPOND (NO) if:
- You already responded to this request (your message appears after the user's request)
- You would just be repeating what you or others already said
- The conversation has moved on and your response would be outdated

---

# Output Format
Output ONLY this XML format:
<response>
<thought>Brief reasoning - did I already respond? Do I have something new?</thought>
<decision>YES or NO</decision>
</response>`;

/**
 * Service for handling agent responses in team chat.
 *
 * Uses LLM-based decision making: each agent first decides whether to respond
 * (via shouldRespondTemplate), then generates a response if appropriate.
 *
 * Messages are queued per agent with a max limit (MAX_QUEUE_SIZE).
 * When queue is full, oldest messages are dropped to keep latest.
 */
export class TeamChatResponseService {
  /**
   * Processing state per agent.
   * Key: agentId, Value: { isProcessing, queue }
   */
  private agentStates = new Map<string, AgentProcessingState>();

  /**
   * Get or create processing state for an agent
   */
  private getAgentState(agentId: string): AgentProcessingState {
    let state = this.agentStates.get(agentId);
    if (!state) {
      state = { isProcessing: false, queue: [] };
      this.agentStates.set(agentId, state);
    }
    return state;
  }

  /**
   * Add a message to an agent's queue and trigger processing.
   * If queue is at max, drops oldest message.
   */
  private queueMessageForAgent(agentId: string, message: QueuedMessage): void {
    const state = this.getAgentState(agentId);

    logger.debug(
      `[QUEUE] Adding message for agent ${agentId}`,
      { isProcessing: state.isProcessing, queueLength: state.queue.length },
      'TeamChatResponseService'
    );

    // Add to queue
    state.queue.push(message);

    // If over max, drop oldest (keep latest)
    while (state.queue.length > MAX_QUEUE_SIZE) {
      const dropped = state.queue.shift();
      logger.debug(
        `Queue full for agent ${agentId}, dropped oldest message`,
        { droppedAt: dropped?.queuedAt },
        'TeamChatResponseService'
      );
    }

    // Start processing if not already
    if (!state.isProcessing) {
      logger.debug(
        `[QUEUE] Starting processing for agent ${agentId}`,
        { queueLength: state.queue.length },
        'TeamChatResponseService'
      );
      this.processAgentQueue(agentId);
    } else {
      logger.debug(
        `[QUEUE] Agent ${agentId} is already processing, message queued`,
        { queueLength: state.queue.length },
        'TeamChatResponseService'
      );
    }
  }

  /**
   * Process an agent's message queue one at a time.
   * After processing, checks for more messages.
   */
  private async processAgentQueue(agentId: string): Promise<void> {
    const state = this.getAgentState(agentId);

    // Already processing? This shouldn't happen but guard anyway
    if (state.isProcessing) {
      return;
    }

    // Nothing to process?
    if (state.queue.length === 0) {
      return;
    }

    state.isProcessing = true;

    try {
      // Take the LATEST message (most recent context)
      // Clear the queue since we're processing the latest state
      const latestMessage = state.queue[state.queue.length - 1];
      state.queue = []; // Clear queue - we're processing latest

      if (!latestMessage) {
        return;
      }

      logger.debug(
        `Processing queued message for agent ${agentId}`,
        { chatId: latestMessage.chatId },
        'TeamChatResponseService'
      );

      // Generate response
      await this.generateAgentResponse({
        agentId,
        chatId: latestMessage.chatId,
        ownerDisplayName: latestMessage.ownerDisplayName,
        ownerUsername: latestMessage.ownerUsername,
        chainDepth: latestMessage.chainDepth ?? 0,
      });
    } finally {
      state.isProcessing = false;

      // Check if more messages arrived while processing
      if (state.queue.length > 0) {
        logger.debug(
          `[QUEUE] Agent ${agentId} finished, picking up ${state.queue.length} queued message(s)`,
          {},
          'TeamChatResponseService'
        );
        // Process next (async, don't await)
        this.processAgentQueue(agentId).catch((err) => {
          logger.error(
            `Failed to process agent queue: ${err}`,
            { agentId },
            'TeamChatResponseService'
          );
        });
      } else {
        logger.debug(
          `[QUEUE] Agent ${agentId} finished, no more messages in queue`,
          {},
          'TeamChatResponseService'
        );
      }
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

      this.queueMessageForAgent(participant.id, {
        chatId,
        ownerDisplayName,
        ownerUsername,
        queuedAt: Date.now(),
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

    // First, decide if we should respond at all
    const shouldRespond = await this.shouldAgentRespond({
      agentId,
      chatId,
      agentName,
      agentUsername,
      systemPrompt,
      personality,
      teamMembers,
      ownerDisplayName,
      ownerUsername,
    });

    if (!shouldRespond.shouldRespond) {
      logger.info(
        `Agent ${agentName} decided not to respond: ${shouldRespond.reason}`,
        { agentId, chatId },
        'TeamChatResponseService'
      );
      return {
        success: true,
        agentName,
        skipped: true,
      };
    }

    logger.info(
      `Agent ${agentName} will respond: ${shouldRespond.reason}`,
      { agentId, chatId },
      'TeamChatResponseService'
    );

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

        // Check if done (normalize to handle LLM outputting TRUE/True/true)
        const isFinishNormalized =
          isFinish === true ||
          (typeof isFinish === 'string' &&
            isFinish.toLowerCase().trim() === 'true');
        if (isFinishNormalized) {
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
   * Decide if an agent should respond to the current conversation.
   * Uses LLM to make the decision based on conversation context.
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
  }): Promise<{ shouldRespond: boolean; reason: string }> {
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
    } = params;

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
        const response = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
          temperature: attempt > 1 ? 0.5 : 0.3, // Increase temperature on retry
        });

        parsedResponse = parseKeyValueXml(response);

        if (parsedResponse?.decision) {
          logger.debug(
            `[ShouldRespond] Parsed decision on attempt ${attempt}`,
            {
              decision: parsedResponse.decision,
              thought: parsedResponse.thought,
            },
            'TeamChatResponseService'
          );
          break;
        }

        // Fallback: try regex extraction
        const decisionMatch = response.match(
          /<decision>\s*(YES|NO)\s*<\/decision>/i
        );
        if (decisionMatch) {
          const thoughtMatch = response.match(
            /<thought>\s*([^<]+)\s*<\/thought>/i
          );
          parsedResponse = {
            decision: decisionMatch[1],
            thought: thoughtMatch?.[1]?.trim() || '',
          };
          logger.debug(
            `[ShouldRespond] Fallback regex parsed on attempt ${attempt}`,
            { decision: parsedResponse.decision },
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

      return {
        shouldRespond: decision === 'YES',
        reason: thought,
      };
    } catch (error) {
      logger.error(
        `Failed to decide shouldAgentRespond: ${error}`,
        { agentId, chatId },
        'TeamChatResponseService'
      );
      // Default to not responding on error (fail safe)
      return { shouldRespond: false, reason: 'Error making decision' };
    }
  }
}

/** Singleton instance */
export const teamChatResponseService = new TeamChatResponseService();

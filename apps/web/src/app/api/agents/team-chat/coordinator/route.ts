/**
 * Team Chat Coordinator API
 *
 * Handles messages in team chat when no agents are tagged.
 * Uses a global coordinator runtime with limited actions.
 *
 * @route POST /api/agents/team-chat/coordinator
 * @access Authenticated
 *
 * @description
 * The coordinator helps users understand Babylon and coordinate their agents.
 * It uses plugin-user-core (read-only actions) instead of plugin-agent-core.
 * Responses are displayed without message bubbles (full-width text).
 */

import { agentRuntimeManager, teamChatService } from '@babylon/agents';
import {
  authenticateUser,
  broadcastChatMessage,
  checkRateLimitAsync,
  RATE_LIMIT_CONFIGS,
  withErrorHandling,
} from '@babylon/api';
import { db, eq, messages, users } from '@babylon/db';
import {
  COORDINATOR_SENDER_ID,
  checkUserInput,
  GROQ_MODELS,
  generateSnowflakeId,
  logger,
  type MessageMetadata,
  type MessageTag,
  MessageTypeEnum,
} from '@babylon/shared';
import {
  composePromptFromState,
  type Memory,
  ModelType,
  parseKeyValueXml,
  type State,
} from '@elizaos/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Coordinator may dispatch to child agents via DISPATCH_TO_AGENT / DISPATCH_TO_AGENTS:
// coordinator (5 iters ≈ 5s) + parallel agent dispatch (≈ 15s) + summary (≈ 2s) ≈ 22s total
// Parallel dispatches via DISPATCH_TO_AGENTS can take longer — 120s covers worst case.
export const maxDuration = 120;

// =============================================================================
// Coordinator Prompt Templates
// =============================================================================

const coordinatorDecisionTemplate = `# Your Role
{{coordinatorContext}}

---

# User's Team
{{teamMembers}}

---

# Conversation History (You ↔ User)
{{recentMessages}}

---

# What Your Agents Have Said Recently
{{dispatchHistory}}

---

# Current Message from {{ownerName}}
{{currentMessage}}

---

# Execution Context
Step {{iterationCount}} of {{maxIterations}}
Actions taken this round: {{actionCount}}

---

{{actionsWithParams}}

---

# Actions Completed This Round
{{#if actionCount}}
{{actionResults}}
**IMPORTANT**: Use data from these results for your response. Do NOT repeat these actions.
{{else}}
No actions taken yet.
{{/if}}

---

# Decision Guide

## Single-Agent Tasks
**Use DISPATCH_TO_AGENT** when the user wants one agent to execute a trade, post, comment, or any action.
  - Select the agent using their [id: ...] from the Team Members list above
  - Write the command clearly as the exact instruction for the agent
  - If no agents exist in the team, skip this action and tell the user to create one at /agents

## Multi-Agent Orchestration
**Use DISPATCH_TO_AGENTS** when the user's request benefits from input from multiple agents.
  - Dispatches run in parallel — much faster than asking agents one by one
  - Use when the user says "all agents", "everyone", "coordinate", "team", or when you need perspectives from multiple agents
  - Parameters: {"dispatches": [{"agentId": "...", "command": "..."}, ...]}

**Use RELAY_TO_AGENT** when you need to pass one agent's results as context to another agent.
  - Use after a dispatch has completed and another agent needs those findings
  - Parameters: {"agentId": "...", "command": "...", "relayContext": "Summary of what other agents found"}

## Orchestration Patterns
**Gather & Synthesize**: DISPATCH_TO_AGENTS → collect all responses → summarize for user
**Gather, Relay & Execute**: DISPATCH_TO_AGENTS (research) → RELAY_TO_AGENT (trader with context) → summarize
**Expert Consultation**: DISPATCH_TO_AGENT to the single relevant expert

## Information Queries
**Use a data-fetch action** (CHECK_PERPS, CHECK_PREDICTIONS, CHECK_USER_PNL, etc.) when you need information to answer the user's question.

## Skip Actions
**Skip all actions (set action to "" and isFinish to true)** when:
  - The question is conversational or you already have the data needed
  - The user is asking about a previous turn's result — just answer directly
  - You have already dispatched or fetched what was needed this turn

**NEVER repeat the same action with the same parameters.**
**NEVER include action names or action syntax in a text response — actions are separate from your final reply.**

Use plain @username for mentions. No markdown links.

<keys>
"thought" Your reasoning about what the user needs and which action (if any) to take
"action" Action name from available actions above, or empty string "" if no action needed
"parameters" JSON parameters for the action, or {} if no parameters needed
"isFinish" Set to true when ready to respond to user
</keys>

# OUTPUT FORMAT
<output>
<response>
  <thought>Your reasoning here</thought>
  <action>ACTION_NAME or ""</action>
  <parameters>{"param": "value"} or {}</parameters>
  <isFinish>true or false</isFinish>
</response>
</output>`;

const coordinatorSummaryTemplate = `# Your Role
{{coordinatorContext}}

---

# User's Team
{{teamMembers}}

---

# Conversation History (You ↔ User)
{{recentMessages}}

---

# What Your Agents Have Said Recently
{{dispatchHistory}}

---

# Current Message from {{ownerName}}
{{currentMessage}}

---

{{actionsWithDescriptions}}

---

# Actions You Completed
{{#if actionCount}}
{{actionResults}}
{{else}}
No actions were taken this turn.
{{/if}}

---

# Response Format Examples

**Market data:** "TSLAI is at $847.23, up 5.2% today with above-average volume."

**Portfolio:** "Balance: $1,234.56 | Positions: TSLAI 2x Long (+$45.20), BTC prediction 50 YES"

**Feed/social:** "Here's what's trending: @user1 posted about NVDAI earnings (42 likes), @user2 shared their prediction strategy..."

**Agent dispatched — include a brief summary of what the agent did:**
"I dispatched to @trading_bot to open a long TSLAI position for $50. They confirmed: [brief quote from agent's response]."

**Multiple agents dispatched — synthesize all responses:**
"I asked all your agents for their market outlook: @trading_bot sees momentum in TSLAI, @research_agent noted high volume on NVDAI, and @social_bot reports bullish sentiment. Based on this consensus, TSLAI and NVDAI look strongest."

**Agent dispatch failed:** "I wasn't able to dispatch that — [reason]. You can @mention your agent directly to retry."

**No agents:** "You don't have any agents yet. Create one at /agents to get started."

**User asks why they didn't see a previous response:** Tell them the message was sent and may still be loading, or suggest they scroll up. Do NOT re-dispatch unless they explicitly ask you to.

Use plain @username. No markdown links.

---

# CRITICAL RULES — You MUST follow these:
1. This is your FINAL text response. All actions for this turn have already been executed above.
2. Do NOT include action names (DISPATCH_TO_AGENT, CHECK_PERPS, etc.) or action syntax in your text.
3. Do NOT say "let me dispatch", "I'll try again", or promise future actions you have not already taken.
4. Do NOT make up information — only reference data from the Actions You Completed section.
5. If you dispatched to an agent, include a brief quote or summary of what the agent actually did or said.
6. Keep your response concise and factual.

Output ONLY this XML:

<response>
<thought>Brief reasoning</thought>
<text>Your helpful response to the user</text>
</response>`;

// =============================================================================
// POST Handler
// =============================================================================

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = (await req.json()) as {
    content: string;
    teamChatId: string;
  };
  const { content, teamChatId } = body;

  logger.info(
    'Coordinator chat endpoint hit',
    { teamChatId },
    'CoordinatorChat'
  );

  // Validate input
  const inputCheck = checkUserInput(content);
  if (!inputCheck.safe) {
    logger.warn(
      'Unsafe user input blocked',
      { reason: inputCheck.reason, category: inputCheck.category },
      'CoordinatorChat'
    );
    return NextResponse.json(
      { success: false, error: inputCheck.reason || 'Invalid input' },
      { status: 400 }
    );
  }

  const user = await authenticateUser(req);

  // Rate limit coordinator requests (same as regular messages)
  const rateCheck = await checkRateLimitAsync(
    user.id,
    RATE_LIMIT_CONFIGS.SEND_MESSAGE
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Rate limit exceeded. Please wait before sending another message.',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) },
      }
    );
  }

  // Validate team chat ownership
  const isValidTeamChat = await teamChatService.validateTeamChatOwnership(
    user.id,
    teamChatId
  );
  if (!isValidTeamChat) {
    logger.warn(
      'Invalid team chat ID - user does not own this chat',
      { userId: user.id, teamChatId },
      'CoordinatorChat'
    );
    return NextResponse.json(
      { success: false, error: 'Invalid team chat' },
      { status: 403 }
    );
  }

  // Coordinator uses small model (free, no points deduction)
  const modelType = ModelType.TEXT_SMALL;

  // Get coordinator runtime.
  //
  // Multi-user safety: the coordinator runtime is shared across all concurrent
  // requests, but is safe because:
  // 1. All per-request data (actionResults, state.values, state.data) lives in
  //    local variables — nothing user-specific is written to the runtime itself.
  // 2. The ElizaOS adapter is stubbed, so no runtime-level memory DB writes occur.
  // 3. stateCache is keyed by elizaMessage.id (UUID per request), so concurrent
  //    requests never collide. We delete the key at the end of each request to
  //    prevent unbounded memory growth.
  // 4. Providers read from state.values (ownerId, teamChatId) that are set fresh
  //    each iteration, so different users get different DB query results.
  const runtime = await agentRuntimeManager.getCoordinatorRuntime();

  // Fetch user info for context
  const [userProfile] = await db
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const ownerName = userProfile?.displayName || userProfile?.username || 'User';
  const ownerUsername = userProfile?.username || undefined;

  // Create message object for ElizaOS
  const elizaMessage: Memory = {
    id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
    entityId: user.id as `${string}-${string}-${string}-${string}-${string}`,
    roomId: teamChatId as `${string}-${string}-${string}-${string}-${string}`,
    content: { text: content },
    createdAt: Date.now(),
  };

  // Multi-step execution — 5 iterations supports multi-agent orchestration patterns:
  // Iteration 1: DISPATCH_TO_AGENTS (parallel gather)
  // Iteration 2: RELAY_TO_AGENT (pass context to executor)
  // Iterations 3-5: follow-up dispatches or early finish
  const MAX_ITERATIONS = 5;
  const traceActionResults: Array<{
    actionType: string;
    success: boolean;
    text: string;
    error?: string;
    values?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    timestamp: number;
    tag?: MessageTag;
  }> = [];
  let finalResponse: string | null = null;
  let isLLMFailure = false;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    logger.info(
      `[Coordinator] Iteration ${iteration}/${MAX_ITERATIONS}`,
      { actionsCompleted: traceActionResults.length },
      'CoordinatorChat'
    );

    // Compose state with providers
    const providers = [
      'RECENT_MESSAGES',
      'DISPATCH_HISTORY',
      'ACTION_STATE',
      'ACTIONS',
      'TEAM_MEMBERS',
      'COORDINATOR_CONTEXT',
    ];
    const state: State = await runtime.composeState(
      elizaMessage,
      providers,
      true
    );

    // Add coordinator-specific values to state
    state.values = {
      ...state.values,
      isAgent: false,
      isCoordinator: true,
      currentMessage: content,
      iterationCount: iteration,
      maxIterations: MAX_ITERATIONS,
      actionCount: traceActionResults.length,
      // User info
      ownerId: user.id,
      ownerName,
      ownerUsername,
      // Team chat context
      teamChatId,
    };

    // Add action results to state data for provider
    state.data = {
      ...state.data,
      actionResults: traceActionResults,
    };

    // Build prompt from template
    const prompt = composePromptFromState({
      state,
      template: coordinatorDecisionTemplate,
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
          `[Coordinator] Parsed decision on attempt ${attempt}`,
          { action: parsedStep.action, isFinish: parsedStep.isFinish },
          'CoordinatorChat'
        );
        break;
      }

      logger.warn(
        `[Coordinator] Failed to parse decision (attempt ${attempt})`,
        { preview: response.substring(0, 200) },
        'CoordinatorChat'
      );
    }

    if (!parsedStep) {
      finalResponse =
        "I'm having trouble processing your request. Could you try rephrasing?";
      isLLMFailure = true;
      break;
    }

    const action = ((parsedStep.action as string) ?? '').trim();
    const parameters = parsedStep.parameters;
    const isFinish = parsedStep.isFinish;

    // No action - go to summary phase
    if (!action) {
      break;
    }

    // Execute action
    logger.info(
      `[Coordinator] Executing action: ${action}`,
      { parameters },
      'CoordinatorChat'
    );

    // Parse parameters with fail-fast validation (no silent fallbacks)
    let actionParams: Record<string, unknown> = {};
    if (parameters) {
      if (typeof parameters === 'string') {
        // Fail-fast: let JSON.parse errors propagate
        const parsed: unknown = JSON.parse(parameters);
        // Validate the parsed result is a non-null object (not an array)
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error(
            `Invalid parameters: expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}. Original: ${parameters}`
          );
        }
        actionParams = parsed as Record<string, unknown>;
      } else if (
        typeof parameters === 'object' &&
        parameters !== null &&
        !Array.isArray(parameters)
      ) {
        actionParams = parameters as Record<string, unknown>;
      } else if (Array.isArray(parameters)) {
        throw new Error(
          `Invalid parameters: expected object, got array. Original: ${JSON.stringify(parameters)}`
        );
      } else {
        throw new Error(`Unexpected parameters type: ${typeof parameters}`);
      }
    }

    // Store params and inject broadcastFn so DISPATCH_TO_AGENT can broadcast
    // broadcastFn is injected here (not imported inside packages/agents) to
    // maintain architectural separation between @babylon/api and @babylon/agents
    state.data = {
      ...state.data,
      actionParams,
      broadcastFn: broadcastChatMessage,
    };

    // Build action content for processActions
    const actionContent = {
      text: `Executing action: ${action}`,
      actions: [action],
    };

    const actionMessage: Memory = {
      id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
      entityId: runtime.agentId,
      roomId: elizaMessage.roomId,
      createdAt: Date.now(),
      content: actionContent,
    };

    // Concrete types for action results
    interface ActionResultContent {
      success?: boolean;
      text?: string;
      values?: Record<string, unknown>;
      tag?: MessageTag;
    }

    interface ProcessActionsResult {
      content?: ActionResultContent;
    }

    // Use object to allow mutation from callback
    const resultHolder: { result: ActionResultContent | null } = {
      result: null,
    };

    // Fail-fast: let errors from processActions propagate to caller
    await runtime.processActions(
      elizaMessage,
      [actionMessage],
      state,
      async (results: unknown) => {
        const resultsArray = results as ProcessActionsResult[] | null;
        if (resultsArray && resultsArray.length > 0) {
          const firstResult = resultsArray[0];
          if (firstResult) {
            resultHolder.result = {
              success: firstResult.content?.success ?? true,
              text:
                typeof firstResult.content?.text === 'string'
                  ? firstResult.content.text
                  : undefined,
              values: firstResult.content?.values,
              tag: firstResult.content?.tag,
            };
          }
        }
        return [];
      }
    );

    // Use resultHolder as the single source of truth for action results
    // The callback in processActions captures the result; no fallback to runtime internals
    let actionResult = resultHolder.result;

    // Default to false if result is missing to avoid masking silent failures
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
      const actionResultsFromCache = cachedState?.values?.actionResults || [];
      actionResult =
        actionResultsFromCache.length > 0
          ? (actionResultsFromCache[0] ?? null)
          : null;
    }
    const success = actionResult?.success ?? false;

    traceActionResults.push({
      actionType: action,
      success,
      text: actionResult?.text || `${action} executed`,
      error: success ? undefined : actionResult?.text,
      values: actionResult?.values,
      parameters: actionParams,
      timestamp: Date.now(),
      tag: actionResult?.tag,
    });

    // Check if done
    if (isFinish === 'true' || isFinish === true) {
      break;
    }
  }

  // Generate summary/response
  if (!finalResponse) {
    const summaryProviders = [
      'RECENT_MESSAGES',
      'DISPATCH_HISTORY',
      'ACTION_STATE',
      'TEAM_MEMBERS',
      'COORDINATOR_CONTEXT',
    ];
    const state = await runtime.composeState(
      elizaMessage,
      summaryProviders,
      true
    );

    state.values = {
      ...state.values,
      isAgent: false,
      isCoordinator: true,
      currentMessage: content,
      ownerId: user.id,
      ownerName,
      ownerUsername,
      teamChatId,
      actionCount: traceActionResults.length,
    };
    state.data = {
      ...state.data,
      actionResults: traceActionResults,
    };

    const summaryPrompt = composePromptFromState({
      state,
      template: coordinatorSummaryTemplate,
    });

    // Get summary with retry
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
      // Match proper <text>...</text> tags with non-greedy capture
      if (!extractedText) {
        const textMatch = summaryResponse.match(
          /<text\b[^>]*?>([\s\S]*?)<\/text>/i
        );
        if (textMatch?.[1]) {
          extractedText = textMatch[1].trim();
        }
      }

      if (extractedText) {
        break;
      }

      logger.warn(
        `[Coordinator] Failed to parse summary (attempt ${attempt})`,
        { preview: summaryResponse.substring(0, 200) },
        'CoordinatorChat'
      );
    }

    finalResponse =
      extractedText ||
      (traceActionResults.length > 0
        ? 'Here is the information you requested.'
        : "I'm here to help! You can ask me about markets, or @mention your agents to trade.");
  }

  const responseText = finalResponse ?? "I'm here to help!";

  // Collect tags from successful action results
  const tags: MessageTag[] = traceActionResults
    .filter((r) => r.success && r.tag)
    .map((r) => r.tag as MessageTag);

  // Build metadata if we have tags
  const metadata: MessageMetadata | null = tags.length > 0 ? { tags } : null;

  // Save coordinator response to messages table
  const responseMessageId = await generateSnowflakeId();
  const responseTime = new Date();

  await db.insert(messages).values({
    id: responseMessageId,
    chatId: teamChatId,
    senderId: COORDINATOR_SENDER_ID,
    content: responseText,
    type: 'coordinator',
    createdAt: responseTime,
    metadata,
  });

  // Broadcast coordinator response
  broadcastChatMessage(teamChatId, {
    id: responseMessageId,
    content: responseText,
    chatId: teamChatId,
    senderId: COORDINATOR_SENDER_ID,
    type: MessageTypeEnum.COORDINATOR,
    createdAt: responseTime.toISOString(),
    metadata,
  }).catch((err) => {
    logger.warn(
      `Failed to broadcast coordinator message: ${err}`,
      { teamChatId },
      'CoordinatorChat'
    );
  });

  // Clean up this request's stateCache entry to prevent unbounded growth on
  // the shared coordinator runtime (see multi-user safety note above).
  const stateCacheKey = `${elizaMessage.id}_action_results`;
  (
    runtime as unknown as { stateCache?: Map<string, unknown> }
  ).stateCache?.delete(stateCacheKey);

  // Note: Coordinator uses free model, no points deduction

  logger.info(
    `Coordinator chat completed`,
    {
      teamChatId,
      actionsExecuted: traceActionResults.length,
    },
    'CoordinatorChat'
  );

  return NextResponse.json({
    success: true,
    messageId: responseMessageId,
    response: responseText,
    pointsCost: 0, // Free model
    modelUsed: GROQ_MODELS.FREE.displayName,
    type: MessageTypeEnum.COORDINATOR,
    isLLMFailure,
    metadata, // Include tags in response for immediate UI update
  });
});

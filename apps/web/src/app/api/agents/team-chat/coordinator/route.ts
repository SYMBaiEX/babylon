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

// =============================================================================
// Coordinator Prompt Templates
// =============================================================================

const coordinatorDecisionTemplate = `<task>
You are the Agents team coordinator. Help the user understand Babylon and coordinate their agents.
</task>

# About Babylon
Babylon is a social prediction market platform where users and AI agents trade on:
- **Prediction Markets**: YES/NO bets on future events
- **Perpetual Contracts**: Leveraged trading on stocks and crypto

Users can create AI agents that trade and post autonomously.

---

# Your Role as Coordinator
{{coordinatorContext}}

---

# User's Team
{{teamMembers}}

---

# Conversation History
{{recentMessages}}

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

# Decision Rules
1. **Market/data requests** → Use the appropriate CHECK action from above
2. **Trading/Agent action requests** → Explain to @mention their agent (NO action needed)
3. **General questions** → Answer directly (NO action needed)

**IMPORTANT**: You CANNOT trade, post, or modify agent settings. Always guide users to @mention their agents.

<keys>
"thought" Your reasoning about what the user needs
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

const coordinatorSummaryTemplate = `You are the Agents team coordinator. Generate a helpful response.

# About Babylon
Babylon is a social prediction market platform. You help users understand it and coordinate their AI agents.

---

# Your Role
{{coordinatorContext}}

---

# User's Team
{{teamMembers}}

---

# Conversation History
{{recentMessages}}

---

# Current Message from {{ownerName}}
{{currentMessage}}

---

# Actions You Completed
{{#if actionCount}}
{{actionResults}}
{{else}}
No actions were needed.
{{/if}}

---

# Response Guidelines
1. Be helpful and informative
2. If you have market data, present it clearly
3. When users want to trade → Tell them to @mention their agent (e.g., "@agent_name buy 50 shares of YES")
4. When users want agent actions → Guide them to @mention the specific agent
5. Keep responses concise but complete

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

  // Get coordinator runtime
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

  // Multi-step execution (simplified for coordinator - max 3 iterations)
  const MAX_ITERATIONS = 3;
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

    const action = (parsedStep.action as string) ?? '';
    const parameters = parsedStep.parameters;
    const isFinish = parsedStep.isFinish;

    // No action - go to summary phase
    if (!action || action === '') {
      break;
    }

    // Execute action
    logger.info(
      `[Coordinator] Executing action: ${action}`,
      { parameters },
      'CoordinatorChat'
    );

    // Parse parameters
    let actionParams = {};
    if (parameters) {
      if (typeof parameters === 'string') {
        try {
          actionParams = JSON.parse(parameters);
        } catch {
          logger.warn(
            `[Coordinator] Failed to parse parameters: ${parameters}`
          );
        }
      } else if (typeof parameters === 'object') {
        actionParams = parameters;
      }
    }

    // Store params in state for action handler
    state.data = {
      ...state.data,
      actionParams,
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

    try {
      // Use object to allow mutation from callback
      const resultHolder: {
        result: {
          success?: boolean;
          text?: string;
          values?: Record<string, unknown>;
          tag?: MessageTag;
        } | null;
      } = { result: null };

      await runtime.processActions(
        elizaMessage,
        [actionMessage],
        state,
        async (results: unknown) => {
          const resultsArray = results as Array<{
            content?: {
              success?: boolean;
              text?: string;
              values?: Record<string, unknown>;
              tag?: MessageTag;
            };
          }> | null;
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

      // Fallback to state cache if callback didn't capture
      let actionResult = resultHolder.result;
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
      const success = actionResult?.success ?? true;

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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
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
  if (!finalResponse) {
    const summaryProviders = [
      'RECENT_MESSAGES',
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
      if (!extractedText) {
        const textMatch = summaryResponse.match(/<?\/?text>([^<]+)/i);
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
  });
});

/**
 * Agent Chat Interaction API
 *
 * @route POST /api/agents/[agentId]/chat - Send message to agent
 * @route GET /api/agents/[agentId]/chat - Get chat history
 * @access Authenticated (owner only)
 *
 * @description
 * Real-time chat interface with autonomous agents using multi-step execution.
 * Uses runtime.composeState() for providers and runtime.processActions() for execution.
 */

import {
  type ActionTraceResult,
  agentRuntimeManager,
  agentService,
} from '@babylon/agents';
import { authenticateUser, withErrorHandling } from '@babylon/api';
import { db, eq, userAgentConfigs } from '@babylon/db';
import { checkUserInput, logger } from '@babylon/shared';
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
// Multi-Step Decision Template
// =============================================================================

const multiStepDecisionTemplate = `<task>
Determine the next step to take in this conversation.
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

# Conversation History
{{recentMessages}}

---

# Current User Message
{{currentMessage}}

---

# Execution Context
Step {{iterationCount}} of {{maxIterations}}
Actions taken this round: {{actionCount}}

---

{{actionsWithParams}}

---

# Actions Already Completed This Round
{{#if actionCount}}
{{actionResults}}
{{else}}
None yet - this is the first step.
{{/if}}

---

# Decision Rules
1. **User wants to enable/disable a feature?** → Use TOGGLE_AUTONOMY action
2. **User wants to check autonomy status?** → Use CHECK_AUTONOMY action
3. **Just chatting or question?** → Set action to "" and isFinish to true
4. **Action completed?** → Set action to "" and isFinish to true
5. **Multiple features requested?** → Execute one at a time
6. **Never repeat** the same action with same parameters

<output>
<response>
  <thought>What does user want? What should I do?</thought>
  <action>ACTION_NAME or "" if done/no action</action>
  <parameters>JSON parameters or {}</parameters>
  <isFinish>true or false</isFinish>
</response>
</output>`;

const multiStepSummaryTemplate = `Generate a response to the user. Stay in character.

# Your Character
{{system}}

{{#if personality}}
Personality: {{personality}}
{{/if}}

# User Asked
{{currentMessage}}

# What You Did
{{actionResults}}

# Rules
- Be conversational and natural
- Stay in character
- Include relevant details from actions when appropriate

IMPORTANT: Output ONLY the XML below. No thinking, no explanation.

<response>
<thought>brief reasoning</thought>
<text>your reply to the user</text>
</response>`;

// =============================================================================
// POST Handler
// =============================================================================

export const POST = withErrorHandling(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
  ) => {
    const { agentId } = await params;
    logger.info('Agent chat endpoint hit', { agentId }, 'AgentChat');

    const body = (await req.json()) as { message: string; usePro?: boolean };
    const message = body.message;
    const usePro = body.usePro ?? false;

    // Validate input
    const inputCheck = checkUserInput(message);
    if (!inputCheck.safe) {
      logger.warn(
        'Unsafe user input blocked',
        { agentId, reason: inputCheck.reason, category: inputCheck.category },
        'AgentChat'
      );
      return NextResponse.json(
        { success: false, error: inputCheck.reason || 'Invalid input' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(req);

    // Verify ownership
    const agentWithConfig = await agentService.getAgentWithConfig(
      agentId,
      user.id
    );
    if (!agentWithConfig) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }
    const agentConfig = agentWithConfig.agentConfig;

    const pointsCost = 1;
    const modelUsed = usePro ? 'groq-70b' : 'groq-8b';
    const newBalance = await agentService.deductPoints(
      agentId,
      pointsCost,
      `Chat message (${usePro ? 'pro' : 'free'} mode)`,
      undefined
    );

    // Get runtime
    const runtime = await agentRuntimeManager.getRuntime(agentId);

    // Create message object for ElizaOS
    const elizaMessage: Memory = {
      id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
      entityId: user.id as `${string}-${string}-${string}-${string}-${string}`,
      roomId: agentId as `${string}-${string}-${string}-${string}-${string}`,
      content: { text: message },
      createdAt: Date.now(),
    };

    // Multi-step execution
    const MAX_ITERATIONS = 3;
    const traceActionResults: ActionTraceResult[] = [];
    let finalResponse: string | null = null;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      logger.info(
        `[MultiStep] Iteration ${iteration}/${MAX_ITERATIONS}`,
        { agentId, actionsCompleted: traceActionResults.length },
        'AgentChat'
      );

      // Compose state with providers
      const state: State = await runtime.composeState(elizaMessage, [
        'RECENT_MESSAGES',
        'ACTION_STATE',
        'ACTIONS',
      ]);

      // Add custom values to state
      state.values = {
        ...state.values,
        agentId, // Pass agentId for actions that need it
        system: agentConfig?.systemPrompt ?? 'You are a helpful AI assistant.',
        personality: agentConfig?.personality ?? '',
        tradingStrategy: agentConfig?.tradingStrategy ?? '',
        currentMessage: message,
        iterationCount: iteration,
        maxIterations: MAX_ITERATIONS,
        actionCount: traceActionResults.length,
      };

      // Add action results to state data
      state.data = {
        ...state.data,
        actionResults: traceActionResults,
      };

      // Build prompt from template
      const prompt = composePromptFromState({
        state,
        template: multiStepDecisionTemplate,
      });

      // Get LLM decision with retry
      const MAX_PARSE_RETRIES = 3;
      let parsedStep: Record<string, unknown> | null = null;

      for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
        const response = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt,
          temperature: attempt > 1 ? 0.5 : 0.7,
        });

        parsedStep = parseKeyValueXml(response);

        if (parsedStep) {
          logger.debug(
            `[MultiStep] Parsed decision on attempt ${attempt}`,
            { action: parsedStep.action, isFinish: parsedStep.isFinish },
            'AgentChat'
          );
          break;
        }

        logger.warn(
          `[MultiStep] Failed to parse decision (attempt ${attempt})`,
          { preview: response.substring(0, 200) },
          'AgentChat'
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
        `[MultiStep] Executing action: ${action}`,
        { parameters },
        'AgentChat'
      );

      // Parse parameters
      let actionParams = {};
      if (parameters) {
        if (typeof parameters === 'string') {
          try {
            actionParams = JSON.parse(parameters);
          } catch {
            logger.warn(
              `[MultiStep] Failed to parse parameters: ${parameters}`
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
        thought: thought ?? '',
      };

      const actionMessage: Memory = {
        id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
        entityId: runtime.agentId,
        roomId: elizaMessage.roomId,
        createdAt: Date.now(),
        content: actionContent,
      };

      try {
        // Use runtime.processActions - adapter.createMemory is now stubbed
        await runtime.processActions(
          elizaMessage,
          [actionMessage],
          state,
          async () => []
        );

        // Get result from state cache
        const cachedState = (
          runtime as unknown as { stateCache?: Map<string, unknown> }
        ).stateCache?.get(`${elizaMessage.id}_action_results`) as
          | {
              values?: {
                actionResults?: Array<{ success?: boolean; text?: string }>;
              };
            }
          | undefined;
        const actionResultsFromCache = cachedState?.values?.actionResults || [];
        const result =
          actionResultsFromCache.length > 0 ? actionResultsFromCache[0] : null;
        const success = result?.success ?? true;

        traceActionResults.push({
          actionType: action,
          success,
          summary: result?.text || `${action} executed`,
          error: success ? undefined : result?.text,
          parameters: actionParams,
          timestamp: Date.now(),
        });
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        traceActionResults.push({
          actionType: action,
          success: false,
          summary: `Action failed: ${errorMsg}`,
          error: errorMsg,
          parameters: actionParams,
          timestamp: Date.now(),
        });
      }

      // Check if done - always go to summary phase for proper response
      if (isFinish === 'true' || isFinish === true) {
        break;
      }
    }

    // Generate summary/response - always run to get proper user-facing message
    {
      const state = await runtime.composeState(elizaMessage, [
        'RECENT_MESSAGES',
        'ACTION_STATE',
      ]);
      state.values = {
        ...state.values,
        agentId, // Pass agentId for actions that need it
        system: agentConfig?.systemPrompt ?? 'You are a helpful AI assistant.',
        personality: agentConfig?.personality ?? '',
        tradingStrategy: agentConfig?.tradingStrategy ?? '',
        currentMessage: message,
      };
      state.data = {
        ...state.data,
        actionResults: traceActionResults,
      };

      const summaryPrompt = composePromptFromState({
        state,
        template: multiStepSummaryTemplate,
      });

      // Get summary with retry
      const SUMMARY_RETRIES = 3;
      let extractedText: string | undefined;

      for (let attempt = 1; attempt <= SUMMARY_RETRIES; attempt++) {
        const summaryResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
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
            `[MultiStep] Parsed summary on attempt ${attempt}`,
            { preview: extractedText.substring(0, 50) },
            'AgentChat'
          );
          break;
        }

        logger.warn(
          `[MultiStep] Failed to parse summary (attempt ${attempt})`,
          { preview: summaryResponse.substring(0, 200) },
          'AgentChat'
        );
      }

      finalResponse =
        extractedText ||
        (traceActionResults.length > 0
          ? 'Actions completed.'
          : "I'm here to help!");
    }

    // Ensure finalResponse is never null
    const responseText = finalResponse ?? "I'm here to help!";

    // Save messages
    const userMessageId = uuidv4();
    const assistantMessageId = uuidv4();
    const userMessageTime = new Date();
    const assistantMessageTime = new Date(userMessageTime.getTime() + 1);

    await db.agentMessage.createMany({
      data: [
        {
          id: userMessageId,
          agentUserId: agentId,
          role: 'user',
          content: message,
          pointsCost: 0,
          metadata: {},
          createdAt: userMessageTime,
        },
        {
          id: assistantMessageId,
          agentUserId: agentId,
          role: 'assistant',
          content: responseText,
          modelUsed,
          pointsCost,
          createdAt: assistantMessageTime,
          metadata: {
            multiStep: true,
            actionsExecuted: traceActionResults.length,
            actions: traceActionResults.map((a) => ({
              type: a.actionType,
              success: a.success,
            })),
          },
        },
      ],
    });

    // Update lastChatAt
    await db
      .update(userAgentConfigs)
      .set({ lastChatAt: new Date(), updatedAt: new Date() })
      .where(eq(userAgentConfigs.userId, agentId));

    await db.agentLog.create({
      data: {
        id: uuidv4(),
        agentUserId: agentId,
        type: 'chat',
        level: 'info',
        message: 'Chat interaction completed',
        prompt: message,
        completion: responseText,
        metadata: {
          usePro,
          pointsCost,
          modelUsed,
          multiStep: true,
          actionsExecuted: traceActionResults.length,
        },
      },
    });

    logger.info(
      `Chat completed for agent ${agentId}`,
      { actionsExecuted: traceActionResults.length },
      'AgentsAPI'
    );

    return NextResponse.json({
      success: true,
      messageId: assistantMessageId,
      response: responseText,
      pointsCost,
      modelUsed,
      balanceAfter: newBalance,
      multiStep: {
        actionsExecuted: traceActionResults.length,
        actions: traceActionResults.map((a) => ({
          type: a.actionType,
          success: a.success,
          summary: a.summary,
        })),
      },
    });
  }
);

// =============================================================================
// GET Handler
// =============================================================================

export const GET = withErrorHandling(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
  ) => {
    const user = await authenticateUser(req);
    const { agentId } = await params;

    const agent = await agentService.getAgent(agentId, user.id);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Number.parseInt(searchParams.get('limit') || '50');

    const messages = await agentService.getChatHistory(agentId, limit);

    return NextResponse.json({
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        modelUsed: msg.modelUsed,
        pointsCost: msg.pointsCost,
        createdAt: msg.createdAt.toISOString(),
      })),
    });
  }
);

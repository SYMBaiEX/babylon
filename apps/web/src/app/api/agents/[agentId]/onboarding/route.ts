/**
 * Agent Onboarding Message API
 *
 * @route POST /api/agents/[agentId]/onboarding
 * @access Authenticated (owner only)
 *
 * @description
 * Generates an initial onboarding message from the agent to introduce
 * itself and its capabilities to the user. Posts message to both:
 * 1. agentMessages table (for agent chat history)
 * 2. Team chat (Command Center) for unified communication
 */

import {
  agentRuntimeManager,
  agentService,
  teamChatService,
} from '@babylon/agents';
import {
  authenticateUser,
  broadcastChatMessage,
  withErrorHandling,
} from '@babylon/api';
import {
  db,
  generateSnowflakeId,
  messages as messagesTable,
} from '@babylon/db';
import { GROQ_MODELS, logger } from '@babylon/shared';
import {
  composePromptFromState,
  type Memory,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Onboarding message template - uses {{actionsWithDescriptions}} from ACTIONS provider
const onboardingTemplate = `You are an AI agent that has just been created. Generate a warm, personalized welcome message to introduce yourself to your owner.

# Your Identity
Name: {{agentName}}

{{#if personality}}
## Personality
{{personality}}
{{/if}}

# Your System Instructions
{{system}}

{{#if tradingStrategy}}
## Trading Strategy
{{tradingStrategy}}
{{/if}}

---

# Your Capabilities
These are the actions you can perform for your owner:

{{actionsWithDescriptions}}

---

# Your Task
Write a warm, personalized welcome message that:
1. Introduces yourself by name and personality
2. Briefly explains what you can do for the user based on your available actions
3. Invites them to start chatting or give you a task
4. Stays true to your personality and character

Keep it concise (2-3 paragraphs max) and engaging. Don't list every action - summarize your capabilities naturally.

Output ONLY this XML format:
<response>
<thought>Brief reasoning about how to introduce yourself</thought>
<text>Your welcome message to the user</text>
</response>`;

export const POST = withErrorHandling(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ agentId: string }> }
  ) => {
    const { agentId } = await params;
    logger.info(
      'Agent onboarding endpoint hit',
      { agentId },
      'AgentOnboarding'
    );

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
    const agentName = agentWithConfig.displayName || 'AI Agent';

    // Get runtime
    const runtime = await agentRuntimeManager.getRuntime(agentId);

    // Create a dummy message for state composition
    const onboardingMessage: Memory = {
      id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
      entityId: user.id as `${string}-${string}-${string}-${string}-${string}`,
      roomId: agentId as `${string}-${string}-${string}-${string}-${string}`,
      content: { text: 'Hello, introduce yourself!' },
      createdAt: Date.now(),
    };

    // Compose state with ACTIONS provider to get actionsWithDescriptions
    // Use strict filtering (3rd param = true) to ONLY run the specified providers
    // This prevents all Babylon A2A providers from running unnecessarily
    const state = await runtime.composeState(
      onboardingMessage,
      ['ACTIONS'],
      true
    );

    // Add custom values to state
    state.values = {
      ...state.values,
      agentName,
      system: agentConfig?.systemPrompt || 'You are a helpful AI assistant.',
      personality: agentConfig?.personality || '',
      tradingStrategy: agentConfig?.tradingStrategy || '',
    };

    // Build prompt using composePromptFromState (handles Handlebars-style template)
    const prompt = composePromptFromState({
      state,
      template: onboardingTemplate,
    });

    // Generate the welcome message
    const modelType =
      agentConfig?.modelTier === 'pro'
        ? ModelType.TEXT_LARGE
        : ModelType.TEXT_SMALL;

    let welcomeMessage =
      "Hello! I'm your new AI agent. I'm here to help you with market analysis, trading, and more. Feel free to ask me anything!";

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await runtime.useModel(modelType, {
          prompt,
          temperature: 0.7,
        });

        const parsed = parseKeyValueXml(response);
        if (parsed?.text) {
          welcomeMessage = parsed.text as string;
          logger.debug(
            `[Onboarding] Generated message on attempt ${attempt}`,
            { preview: welcomeMessage.substring(0, 100) },
            'AgentOnboarding'
          );
          break;
        }

        // Fallback: Try regex extraction
        const textMatch = response.match(/<text>([\s\S]*?)<\/text>/i);
        if (textMatch?.[1]) {
          welcomeMessage = textMatch[1].trim();
          break;
        }

        logger.warn(
          `[Onboarding] Failed to parse response (attempt ${attempt})`,
          { preview: response.substring(0, 200) },
          'AgentOnboarding'
        );
      } catch (error) {
        logger.error(
          `[Onboarding] Error generating message (attempt ${attempt})`,
          { error: error instanceof Error ? error.message : 'Unknown error' },
          'AgentOnboarding'
        );
      }
    }

    // Save the welcome message to agent chat history
    const messageId = uuidv4();
    const messageTime = new Date();

    await db.agentMessage.create({
      data: {
        id: messageId,
        agentUserId: agentId,
        role: 'assistant',
        content: welcomeMessage,
        modelUsed:
          agentConfig?.modelTier === 'pro'
            ? GROQ_MODELS.PRO.displayName
            : GROQ_MODELS.FREE.displayName,
        pointsCost: 0, // Onboarding message is free
        metadata: {
          type: 'onboarding',
          generated: true,
        },
        createdAt: messageTime,
      },
    });

    // Post onboarding message to team chat (Command Center)
    // Use ensureTeamChat to create the team chat if it doesn't exist yet
    try {
      logger.info(
        `Attempting to post onboarding to team chat for user ${user.id}`,
        { agentId },
        'AgentOnboarding'
      );

      const teamChat = await teamChatService.ensureTeamChat(user.id);
      console.log('ONBOARDING - ensureTeamChat result:', teamChat);

      logger.info(
        `ensureTeamChat result`,
        {
          teamChat: teamChat
            ? { chatId: teamChat.chatId, groupId: teamChat.groupId }
            : null,
        },
        'AgentOnboarding'
      );

      if (!teamChat) {
        logger.warn(
          `Failed to create/get team chat for onboarding message`,
          { userId: user.id },
          'AgentOnboarding'
        );
      } else {
        const teamChatMessageId = await generateSnowflakeId();

        logger.info(
          `Inserting onboarding message to team chat`,
          { chatId: teamChat.chatId, messageId: teamChatMessageId, agentId },
          'AgentOnboarding'
        );

        const insertResult = await db
          .insert(messagesTable)
          .values({
            id: teamChatMessageId,
            chatId: teamChat.chatId,
            senderId: agentId,
            content: welcomeMessage,
            type: 'user',
            createdAt: messageTime,
          })
          .onConflictDoNothing();
        console.log('ONBOARDING - Message insert result:', insertResult);

        logger.info(
          `Message inserted, now broadcasting via SSE`,
          { chatId: teamChat.chatId, messageId: teamChatMessageId },
          'AgentOnboarding'
        );

        // Broadcast the message via SSE so it appears in real-time
        await broadcastChatMessage(teamChat.chatId, {
          id: teamChatMessageId,
          content: welcomeMessage,
          chatId: teamChat.chatId,
          senderId: agentId,
          type: 'user',
          createdAt: messageTime.toISOString(),
          isGameChat: false,
          isDMChat: false,
        });

        logger.info(
          `Onboarding message posted to team chat`,
          { chatId: teamChat.chatId, messageId: teamChatMessageId },
          'AgentOnboarding'
        );
      }
    } catch (error) {
      // Don't fail the whole request if team chat message fails
      console.error('ONBOARDING ERROR - Failed to post to team chat:', error);
      logger.error(
        `Failed to post onboarding message to team chat`,
        { error: error instanceof Error ? error.stack : 'Unknown' },
        'AgentOnboarding'
      );
    }

    logger.info(
      `Onboarding message generated for agent ${agentId}`,
      { messageId },
      'AgentOnboarding'
    );

    return NextResponse.json({
      success: true,
      messageId,
      message: welcomeMessage,
    });
  }
);

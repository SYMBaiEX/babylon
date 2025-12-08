/**
 * Autonomous Batch Response Service
 *
 * Handles batch evaluation and response to pending interactions:
 * - Comments to agent's posts
 * - Replies to agent's comments
 * - New messages in chats
 *
 * Instead of responding to everything, this service:
 * 1. Gathers all pending interactions
 * 2. Presents them to the agent with context
 * 3. Agent decides which ones warrant a response (boolean array)
 * 4. Executes responses for approved interactions
 */

import { countTokensSync, truncateToTokenLimitSync } from '@babylon/api';
import {
  and,
  chatParticipants,
  chats,
  comments,
  db,
  desc,
  eq,
  gte,
  isNull,
  messages,
  ne,
  posts,
  users,
} from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { parseKeyValueXml } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

interface PendingInteraction {
  type: 'comment_on_post' | 'comment_on_comment' | 'chat_message';
  id: string;
  chatId?: string;
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
  author: string;
  content: string;
  context: string;
  timestamp: Date;
}

interface ResponseDecision {
  shouldRespond: boolean;
  priority?: 'low' | 'medium' | 'high';
  reasoning?: string;
}

export class AutonomousBatchResponseService {
  /**
   * Build a comment thread from a root comment
   * Returns all comments in the thread in chronological order
   */
  private buildCommentThread(
    rootCommentId: string,
    allComments: Array<{
      id: string;
      parentCommentId: string | null;
      authorId: string;
      content: string;
      createdAt: Date;
      author?: { displayName: string | null; username: string | null } | null;
    }>
  ): typeof allComments {
    const thread: typeof allComments = [];

    // Start with the root comment
    const rootComment = allComments.find((c) => c.id === rootCommentId);
    if (rootComment) {
      thread.push(rootComment);
    }

    // Recursively find all replies in the thread
    const findReplies = (parentId: string) => {
      const replies = allComments
        .filter((c) => c.parentCommentId === parentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const reply of replies) {
        thread.push(reply);
        findReplies(reply.id); // Recursively get replies to replies
      }
    };

    findReplies(rootCommentId);

    return thread;
  }

  /**
   * Gather all pending interactions that might need responses
   *
   * Collects comments on agent's posts, replies to agent's comments,
   * and new chat messages that the agent hasn't responded to.
   *
   * @param agentUserId - Unique identifier for the agent
   * @returns Array of pending interactions requiring potential responses
   *
   * @remarks
   * - Limited to interactions from last 24 hours
   * - Filters out interactions agent already responded to
   * - Includes context for each interaction
   */
  async gatherPendingInteractions(
    agentUserId: string
  ): Promise<PendingInteraction[]> {
    const interactions: PendingInteraction[] = [];

    // Get comments on agent's posts
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // First get agent's posts
    const agentPosts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.authorId, agentUserId), isNull(posts.deletedAt)));
    const agentPostIds = agentPosts.map((p) => p.id);

    if (agentPostIds.length > 0) {
      // Get all comments on agent's posts (including agent's own replies for context)
      const allCommentsOnPosts = await db.query.comments.findMany({
        where: (comments, { and: andFn, gte: gteFn, inArray: inArrayFn }) =>
          andFn(
            gteFn(comments.createdAt, oneDayAgo),
            inArrayFn(comments.postId, agentPostIds)
          ),
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          post: {
            columns: {
              id: true,
              content: true,
            },
          },
        },
        orderBy: (comments, { asc: ascFn }) => [ascFn(comments.createdAt)],
      });

      // Group comments by their root thread (top-level comments without parentCommentId)
      // and build thread context
      const topLevelComments = allCommentsOnPosts.filter(
        (c) => !c.parentCommentId && c.authorId !== agentUserId
      );

      for (const topComment of topLevelComments) {
        if (!topComment.post) continue;

        // Build the full thread for this comment
        const threadComments = this.buildCommentThread(
          topComment.id,
          allCommentsOnPosts
        );

        // Find the last message in the thread
        const lastMessage = threadComments[threadComments.length - 1];

        // Only add if the last message is from a user (not the agent)
        // This means the thread is waiting for agent response
        if (lastMessage && lastMessage.authorId !== agentUserId) {
          // Build thread context showing the conversation flow
          const threadContext = threadComments
            .map((c) => {
              const authorName =
                c.authorId === agentUserId
                  ? 'You'
                  : c.author?.displayName || c.author?.username || 'User';
              return `${authorName}: "${c.content}"`;
            })
            .join('\n→ ');

          interactions.push({
            type: 'comment_on_post',
            id: lastMessage.id,
            postId: topComment.postId,
            commentId: lastMessage.id, // Reply to the last comment in thread
            author:
              lastMessage.author?.displayName ||
              lastMessage.author?.username ||
              'Unknown',
            content: lastMessage.content,
            context: `Your post: "${topComment.post.content}"\n\nThread:\n${threadContext}`,
            timestamp: lastMessage.createdAt,
          });
        }
      }
    }

    // Get replies to agent's comments on OTHER people's posts
    // (replies on agent's own posts are already handled above with full thread context)
    const myComments = await db
      .select({
        id: comments.id,
        postId: comments.postId,
        content: comments.content,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(eq(comments.authorId, agentUserId))
      .orderBy(desc(comments.createdAt))
      .limit(50);

    // Filter to only comments on other people's posts
    const myCommentsOnOthersPosts = myComments.filter(
      (c) => !agentPostIds.includes(c.postId)
    );
    const myCommentIdsOnOthersPosts = myCommentsOnOthersPosts.map((c) => c.id);

    if (myCommentIdsOnOthersPosts.length > 0) {
      // Get ALL comments in threads starting from agent's comments recursively
      // This handles unlimited depth of nested replies
      const allCommentsInThreads: Array<{
        id: string;
        parentCommentId: string | null;
        authorId: string;
        content: string;
        createdAt: Date;
        author: {
          id: string;
          username: string | null;
          displayName: string | null;
        } | null;
      }> = [];

      // Start with agent's original comments
      const agentComments = await db.query.comments.findMany({
        where: (comments, { and: andFn, gte: gteFn, inArray: inArrayFn }) =>
          andFn(
            gteFn(comments.createdAt, oneDayAgo),
            inArrayFn(comments.id, myCommentIdsOnOthersPosts)
          ),
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: (comments, { asc: ascFn }) => [ascFn(comments.createdAt)],
      });
      allCommentsInThreads.push(...agentComments);

      // Recursively fetch all replies at any depth
      let parentIds = myCommentIdsOnOthersPosts;
      const MAX_DEPTH = 10; // Safety limit to prevent infinite loops
      for (let depth = 0; depth < MAX_DEPTH && parentIds.length > 0; depth++) {
        const replies = await db.query.comments.findMany({
          where: (comments, { and: andFn, gte: gteFn, inArray: inArrayFn }) =>
            andFn(
              gteFn(comments.createdAt, oneDayAgo),
              inArrayFn(comments.parentCommentId, parentIds)
            ),
          with: {
            author: {
              columns: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
          orderBy: (comments, { asc: ascFn }) => [ascFn(comments.createdAt)],
        });

        if (replies.length === 0) break;

        allCommentsInThreads.push(...replies);
        parentIds = replies.map((r) => r.id);
      }

      // For each of agent's comments on other posts, build the thread and check if response needed
      for (const agentComment of myCommentsOnOthersPosts) {
        // Build the thread starting from this agent comment
        const threadComments = this.buildCommentThread(
          agentComment.id,
          allCommentsInThreads.map((c) => ({
            id: c.id,
            parentCommentId: c.parentCommentId,
            authorId: c.authorId,
            content: c.content,
            createdAt: c.createdAt,
            author: c.author,
          }))
        );

        // Find the last message in the thread
        const lastMessage = threadComments[threadComments.length - 1];

        // Only add if the last message is from a user (not the agent)
        // AND the thread has more than just the agent's original comment
        if (
          lastMessage &&
          lastMessage.authorId !== agentUserId &&
          threadComments.length > 1
        ) {
          // Build thread context showing the conversation flow
          const threadContext = threadComments
            .map((c) => {
              const authorName =
                c.authorId === agentUserId
                  ? 'You'
                  : c.author?.displayName || c.author?.username || 'User';
              return `${authorName}: "${c.content}"`;
            })
            .join('\n→ ');

          interactions.push({
            type: 'comment_on_comment',
            id: lastMessage.id,
            commentId: lastMessage.id, // Reply to the last comment in thread
            parentCommentId: lastMessage.parentCommentId || undefined,
            author:
              lastMessage.author?.displayName ||
              lastMessage.author?.username ||
              'Unknown',
            content: lastMessage.content,
            context: `Thread on someone else's post:\n${threadContext}`,
            timestamp: lastMessage.createdAt,
          });
        }
      }
    }

    // Get unread chat messages
    const agentChats = await db
      .select({
        chatId: chatParticipants.chatId,
        chat: chats,
      })
      .from(chatParticipants)
      .leftJoin(chats, eq(chatParticipants.chatId, chats.id))
      .where(eq(chatParticipants.userId, agentUserId));

    for (const chatParticipant of agentChats) {
      const chat = chatParticipant.chat;
      if (!chat) continue;

      // Get recent messages from others in this chat
      const chatMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chat.id),
            ne(messages.senderId, agentUserId),
            gte(messages.createdAt, oneDayAgo)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(3);

      if (chatMessages.length === 0) continue;

      // Get recent conversation context
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(5);

      const contextMessages = recentMessages
        .reverse()
        .map(
          (m) => `${m.senderId === agentUserId ? 'You' : 'User'}: ${m.content}`
        )
        .join('\n');

      const latestMessage = chatMessages[0];
      if (latestMessage) {
        interactions.push({
          type: 'chat_message',
          id: latestMessage.id,
          chatId: chat.id,
          author: 'User', // Simplified since we don't have sender relation
          content: latestMessage.content,
          context: `Chat: ${chat.name || (chat.isGroup ? 'Group' : 'DM')}\nRecent:\n${contextMessages}`,
          timestamp: latestMessage.createdAt,
        });
      }
    }

    // Sort by timestamp (oldest first for fairness)
    interactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return interactions;
  }

  /**
   * Evaluate which interactions warrant a response using AI
   *
   * Uses LLM to analyze pending interactions and determine which ones
   * warrant a response based on agent personality and interaction quality.
   *
   * @param agentUserId - Unique identifier for the agent
   * @param _runtime - Agent runtime (used for W&B model access)
   * @param interactions - Array of pending interactions to evaluate
   * @returns Array of response decisions (one per interaction)
   * @throws Error if agent not found or LLM response parsing fails
   *
   * @remarks
   * - Caps interactions at 30 to prevent context overflow
   * - Uses small model for fast evaluation
   * - Has 20 second timeout to prevent hanging
   * - Returns boolean array indicating which interactions to respond to
   */
  async evaluateInteractions(
    agentUserId: string,
    _runtime: IAgentRuntime,
    interactions: PendingInteraction[]
  ): Promise<ResponseDecision[]> {
    if (interactions.length === 0) {
      return [];
    }

    // Cap interactions to prevent context overflow (30 max)
    const cappedInteractions = interactions.slice(0, 30);
    if (cappedInteractions.length < interactions.length) {
      logger.info(
        `Capped interactions from ${interactions.length} to 30 to prevent context overflow`,
        undefined,
        'AutonomousBatchResponse'
      );
    }
    const evaluateInteractions = cappedInteractions;

    const [agent] = await db
      .select({
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = await getAgentConfig(agentUserId);

    // Build evaluation prompt with XML output format
    const prompt = `${config?.systemPrompt ?? 'You are an AI agent on Babylon.'}

You are ${agent.displayName}, an AI agent on Babylon. You need to decide which interactions warrant a response.

Guidelines:
- Respond to direct questions or mentions
- Respond to substantive comments that add value
- Skip spam, simple acknowledgments, or low-value interactions
- Consider your energy and focus - be selective
- Prioritize meaningful conversations

Pending Interactions (${evaluateInteractions.length}):

${evaluateInteractions
  .map(
    (interaction, idx) => `
Interaction ${idx}: Type: ${interaction.type}
Author: ${interaction.author}
Content: "${interaction.content}"
Context: ${interaction.context}
Time: ${new Date(interaction.timestamp).toLocaleString()}
---`
  )
  .join('\n')}

Task: For each interaction above (${evaluateInteractions.length} total), decide if you should respond (true or false).

# Required Output Format
Return only this XML structure with comma-separated true/false values (one per interaction, in order):

<response>
<decisions>true, false, true, ...</decisions>
</response>

Example for 5 interactions:
<response>
<decisions>true, false, true, false, true</decisions>
</response>

Do NOT include any explanations, only the XML format above.`;

    // Ensure prompt fits within 32K context limit (W&B trained models)
    const estimatedTokens = countTokensSync(prompt);
    let finalPrompt = prompt;

    if (estimatedTokens > 30000) {
      // 30K with 2K safety margin
      logger.warn(
        `Evaluation prompt too long: ${estimatedTokens} tokens, truncating`,
        undefined,
        'AutonomousBatchResponse'
      );
      const truncated = truncateToTokenLimitSync(prompt, 30000, {
        ellipsis: true,
      });
      finalPrompt = truncated.text;
      logger.info(
        `Truncated to ${truncated.tokens} tokens`,
        undefined,
        'AutonomousBatchResponse'
      );
    }

    // Use large model for batch evaluation with retry loop
    const MAX_ATTEMPTS = 3;
    let decisions: boolean[] | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const isRetry = attempt > 1;
        const currentPrompt = isRetry
          ? `${finalPrompt}\n\nREMINDER: You MUST output valid XML. Start with <response> and include <decisions> with comma-separated true/false values.`
          : finalPrompt;

        // Add timeout to prevent hanging (30 seconds max for larger model)
        const decisionText = await Promise.race([
          callGroqDirect({
            prompt: currentPrompt,
            system: config?.systemPrompt ?? undefined,
            modelSize: 'large', // Large model: Better at structured outputs and counting
            runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
            temperature: isRetry ? 0.5 : 0.6,
            maxTokens: 16384,
            actionType: 'evaluate_interactions',
            purpose: 'evaluation', // RLAIF: This is an evaluation/reasoning call
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Timeout'));
            }, 30000); // 30 second timeout
          }),
        ]);

        // Extract <response>...</response> block before parsing
        const responseMatch = decisionText.match(
          /<response>([\s\S]*?)<\/response>/i
        );
        if (!responseMatch) {
          logger.warn(
            'No <response> block found in batch evaluation',
            {
              agentUserId,
              attempt,
              raw: decisionText.substring(0, 500),
            },
            'AutonomousBatchResponse'
          );
          continue;
        }

        // Parse the extracted XML response
        const parsed = parseKeyValueXml(responseMatch[0]) as {
          decisions?: string;
        } | null;

        if (!parsed?.decisions) {
          logger.warn(
            'Failed to parse decisions from XML response',
            {
              agentUserId,
              attempt,
              raw: responseMatch[0].substring(0, 200),
            },
            'AutonomousBatchResponse'
          );
          continue;
        }

        // Parse comma-separated true/false values
        const decisionsRaw = parsed.decisions
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);

        // Convert to boolean array
        let parsedDecisions = decisionsRaw.map((d) => d === 'true');

        // Ensure we have the right number of decisions
        if (parsedDecisions.length !== evaluateInteractions.length) {
          logger.warn(
            `Decision count mismatch: ${parsedDecisions.length} vs ${evaluateInteractions.length}. Adjusting to match.`,
            undefined,
            'AutonomousBatchResponse'
          );

          if (parsedDecisions.length < evaluateInteractions.length) {
            // Pad with false values for missing decisions
            const paddingNeeded =
              evaluateInteractions.length - parsedDecisions.length;
            parsedDecisions = [
              ...parsedDecisions,
              ...Array(paddingNeeded).fill(false),
            ];
            logger.info(
              `Padded ${paddingNeeded} missing decisions with false`,
              undefined,
              'AutonomousBatchResponse'
            );
          } else {
            // Truncate excess decisions
            parsedDecisions = parsedDecisions.slice(
              0,
              evaluateInteractions.length
            );
          }
        }

        // Success!
        decisions = parsedDecisions;
        break;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg === 'Timeout') {
          logger.warn(
            `Interaction evaluation timeout (attempt ${attempt}/${MAX_ATTEMPTS})`,
            { agentUserId },
            'AutonomousBatchResponse'
          );
        } else {
          logger.warn(
            `Interaction evaluation attempt ${attempt} failed`,
            { agentUserId, error: errorMsg },
            'AutonomousBatchResponse'
          );
        }
      }
    }

    // If all attempts failed, return all false (don't respond to anything)
    if (!decisions) {
      logger.error(
        `Failed to evaluate interactions after ${MAX_ATTEMPTS} attempts, defaulting to no responses`,
        { agentUserId },
        'AutonomousBatchResponse'
      );
      decisions = evaluateInteractions.map(() => false);
    }

    return decisions.map((shouldRespond) => ({ shouldRespond }));
  }

  /**
   * Generate and post responses for approved interactions
   *
   * Generates responses using LLM and posts them as comments or messages
   * based on interaction type. Continues processing even if individual
   * responses fail.
   *
   * @param agentUserId - Unique identifier for the agent
   * @param _runtime - Agent runtime (used for W&B model access)
   * @param interactions - Array of interactions to respond to
   * @param decisions - Array of response decisions (from evaluateInteractions)
   * @returns Number of responses successfully created
   * @throws Error if agent not found
   *
   * @remarks
   * - Only processes interactions marked with shouldRespond: true
   * - Uses small model for fast response generation
   * - Has 15 second timeout per response
   * - Adds 1 second delay between responses to avoid spam
   * - Continues processing even if individual responses fail
   */
  async executeResponses(
    agentUserId: string,
    _runtime: IAgentRuntime,
    interactions: PendingInteraction[],
    decisions: ResponseDecision[]
  ): Promise<number> {
    const [agent] = await db
      .select({
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent) {
      throw new Error('Agent not found');
    }

    const respConfig = await getAgentConfig(agentUserId);

    let responsesCreated = 0;

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      const decision = decisions[i];

      if (!interaction || !decision || !decision.shouldRespond) continue;

      // Generate response with retry loop
      const responsePrompt = `${respConfig?.systemPrompt ?? 'You are an AI agent on Babylon.'}

You are ${agent.displayName}, responding to an interaction.

Context: ${interaction.context}

${interaction.author} said: "${interaction.content}"

Task: Write a thoughtful, engaging response (1-2 sentences, under 200 characters).
Be authentic to your personality.
Add value to the conversation.

# Required Output Format
<response>
<text>your response here</text>
</response>`;

      // Truncate if needed (unlikely for individual responses but safe)
      const respTokens = countTokensSync(responsePrompt);
      let finalRespPrompt = responsePrompt;
      if (respTokens > 30000) {
        const truncated = truncateToTokenLimitSync(responsePrompt, 30000, {
          ellipsis: true,
        });
        finalRespPrompt = truncated.text;
      }

      // Use large model for response generation with retry
      const RESPONSE_MAX_ATTEMPTS = 3;
      let cleanContent: string | null = null;

      for (let attempt = 1; attempt <= RESPONSE_MAX_ATTEMPTS; attempt++) {
        try {
          const isRetry = attempt > 1;
          const currentPrompt = isRetry
            ? `${finalRespPrompt}\n\nREMINDER: You MUST output valid XML. Start with <response> and include <text> with your response.`
            : finalRespPrompt;

          const responseContent = await Promise.race([
            callGroqDirect({
              prompt: currentPrompt,
              system: respConfig?.systemPrompt ?? undefined,
              modelSize: 'large', // Large model: Higher quality responses
              runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
              temperature: isRetry ? 0.6 : 0.8,
              maxTokens: 16384,
              actionType: 'execute_response',
              purpose: 'response', // RLAIF: This is a response generation call
            }),
            new Promise<string>((_, reject) => {
              setTimeout(() => {
                reject(new Error('Timeout'));
              }, 20000); // 20 second timeout
            }),
          ]);

          // Extract <response>...</response> block
          const responseMatch = responseContent.match(
            /<response>([\s\S]*?)<\/response>/i
          );
          if (!responseMatch) {
            logger.warn(
              'No <response> block found in response generation',
              {
                interactionId: interaction.id,
                attempt,
                raw: responseContent.substring(0, 300),
              },
              'AutonomousBatchResponse'
            );
            continue;
          }

          // Parse the extracted XML response
          const parsed = parseKeyValueXml(responseMatch[0]) as {
            text?: string;
          } | null;

          if (!parsed?.text || parsed.text.trim().length === 0) {
            logger.warn(
              'Failed to parse XML response in response generation',
              {
                interactionId: interaction.id,
                attempt,
                raw: responseContent.substring(0, 300),
              },
              'AutonomousBatchResponse'
            );
            continue;
          }

          // Success!
          cleanContent = parsed.text.trim().replace(/^["']|["']$/g, '');
          break;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          if (errorMsg === 'Timeout') {
            logger.warn(
              `Response generation timeout (attempt ${attempt}/${RESPONSE_MAX_ATTEMPTS})`,
              { interactionId: interaction.id },
              'AutonomousBatchResponse'
            );
          } else {
            logger.warn(
              `Response generation attempt ${attempt} failed`,
              { interactionId: interaction.id, error: errorMsg },
              'AutonomousBatchResponse'
            );
          }
        }
      }

      if (!cleanContent || cleanContent.length < 5) {
        logger.warn(
          `Failed to generate valid response for interaction ${interaction.id}`,
          undefined,
          'AutonomousBatchResponse'
        );
        continue;
      }

      // Post the response based on type
      if (interaction.type === 'comment_on_post' && interaction.postId) {
        // Reply TO the specific comment (as a child comment in the thread)
        await db.insert(comments).values({
          id: await generateSnowflakeId(),
          content: cleanContent,
          postId: interaction.postId,
          authorId: agentUserId,
          parentCommentId: interaction.commentId || interaction.id, // Reply to the specific comment
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        responsesCreated++;
        logger.info(
          `Agent replied to comment ${interaction.commentId || interaction.id} on post ${interaction.postId}`,
          undefined,
          'AutonomousBatchResponse'
        );
      } else if (
        interaction.type === 'comment_on_comment' &&
        interaction.commentId
      ) {
        // Reply to comment on comment
        const [parentComment] = await db
          .select({ postId: comments.postId })
          .from(comments)
          .where(eq(comments.id, interaction.commentId))
          .limit(1);

        if (parentComment) {
          await db.insert(comments).values({
            id: await generateSnowflakeId(),
            content: cleanContent,
            postId: parentComment.postId,
            authorId: agentUserId,
            parentCommentId: interaction.commentId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          responsesCreated++;
          logger.info(
            `Agent responded to comment reply ${interaction.commentId}`,
            undefined,
            'AutonomousBatchResponse'
          );
        }
      } else if (interaction.type === 'chat_message' && interaction.chatId) {
        // Send chat message
        await db.insert(messages).values({
          id: await generateSnowflakeId(),
          chatId: interaction.chatId,
          senderId: agentUserId,
          content: cleanContent,
          createdAt: new Date(),
        });
        responsesCreated++;
        logger.info(
          `Agent responded in chat ${interaction.chatId}`,
          undefined,
          'AutonomousBatchResponse'
        );
      }

      // Small delay to avoid spam
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return responsesCreated;
  }

  /**
   * Main entry point: Process all pending interactions in batch
   *
   * Orchestrates the complete batch response workflow:
   * 1. Gathers all pending interactions
   * 2. Evaluates which warrant responses
   * 3. Executes responses for approved interactions
   *
   * @param agentUserId - Unique identifier for the agent
   * @param _runtime - Agent runtime (used for W&B model access)
   * @returns Number of responses successfully created
   *
   * @example
   * ```typescript
   * const count = await batchService.processBatch('agent-123', runtime);
   * console.log(`Processed ${count} responses`);
   * ```
   */
  async processBatch(
    agentUserId: string,
    _runtime: IAgentRuntime
  ): Promise<number> {
    logger.info(
      `Starting batch response processing for agent ${agentUserId}`,
      undefined,
      'AutonomousBatchResponse'
    );

    // Step 1: Gather all pending interactions
    const interactions = await this.gatherPendingInteractions(agentUserId);

    if (interactions.length === 0) {
      logger.info(
        'No pending interactions to process',
        undefined,
        'AutonomousBatchResponse'
      );
      return 0;
    }

    logger.info(
      `Found ${interactions.length} pending interactions`,
      undefined,
      'AutonomousBatchResponse'
    );

    // Step 2: Evaluate which ones warrant responses
    const decisions = await this.evaluateInteractions(
      agentUserId,
      _runtime,
      interactions
    );

    const responseCount = decisions.filter((d) => d.shouldRespond).length;
    logger.info(
      `Agent decided to respond to ${responseCount}/${interactions.length} interactions`,
      undefined,
      'AutonomousBatchResponse'
    );

    if (responseCount === 0) {
      return 0;
    }

    // Step 3: Generate and post responses
    const responsesCreated = await this.executeResponses(
      agentUserId,
      _runtime,
      interactions,
      decisions
    );

    logger.info(
      `Successfully created ${responsesCreated} responses`,
      undefined,
      'AutonomousBatchResponse'
    );

    return responsesCreated;
  }
}

export const autonomousBatchResponseService =
  new AutonomousBatchResponseService();

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
  inArray,
  isNull,
  messages,
  ne,
  posts,
  users,
} from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
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
      const commentsOnPostsRaw = await db.query.comments.findMany({
        where: (
          comments,
          { and: andFn, ne: neFn, gte: gteFn, inArray: inArrayFn }
        ) =>
          andFn(
            neFn(comments.authorId, agentUserId),
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
        orderBy: (comments, { desc: descFn }) => [descFn(comments.createdAt)],
        limit: 20,
      });

      for (const comment of commentsOnPostsRaw) {
        if (!comment.post) continue;
        interactions.push({
          type: 'comment_on_post',
          id: comment.id,
          postId: comment.postId,
          author:
            comment.author?.displayName ||
            comment.author?.username ||
            'Unknown',
          content: comment.content,
          context: `Your post: "${comment.post.content}"`,
          timestamp: comment.createdAt,
        });
      }
    }

    // Get replies to agent's comments
    const myComments = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.authorId, agentUserId))
      .orderBy(desc(comments.createdAt))
      .limit(50);
    const myCommentIds = myComments.map((c) => c.id);

    if (myCommentIds.length > 0) {
      const repliesToCommentsRaw = await db
        .select({
          reply: comments,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          },
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(
          and(
            inArray(comments.parentCommentId, myCommentIds),
            ne(comments.authorId, agentUserId),
            gte(comments.createdAt, oneDayAgo)
          )
        )
        .orderBy(desc(comments.createdAt))
        .limit(20);

      // Get parent comment content separately
      const parentCommentIds = [
        ...new Set(
          repliesToCommentsRaw
            .map((r) => r.reply.parentCommentId)
            .filter(Boolean)
        ),
      ] as string[];
      const parentComments =
        parentCommentIds.length > 0
          ? await db
              .select({ id: comments.id, content: comments.content })
              .from(comments)
              .where(inArray(comments.id, parentCommentIds))
          : [];
      const parentCommentMap = new Map(
        parentComments.map((pc) => [pc.id, pc.content])
      );

      for (const row of repliesToCommentsRaw) {
        interactions.push({
          type: 'comment_on_comment',
          id: row.reply.id,
          commentId: row.reply.id,
          parentCommentId: row.reply.parentCommentId || undefined,
          author: row.author?.displayName || row.author?.username || 'Unknown',
          content: row.reply.content,
          context: `Your comment: "${parentCommentMap.get(row.reply.parentCommentId || '') || ''}"`,
          timestamp: row.reply.createdAt,
        });
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

    // Build evaluation prompt
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
[${idx}] Type: ${interaction.type}
Author: ${interaction.author}
Content: "${interaction.content}"
Context: ${interaction.context}
Time: ${new Date(interaction.timestamp).toLocaleString()}
---`
  )
  .join('\n')}

Task: For each interaction above, decide if you should respond.

Output ONLY a JSON array of booleans, one per interaction in order.
Example: [true, false, true, false, false, true, ...]

Array:`;

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

    // Use large model for batch evaluation - better at consistent counting
    // Add timeout to prevent hanging (30 seconds max for larger model)
    const decisionText = await Promise.race([
      callGroqDirect({
        prompt: finalPrompt,
        system: config?.systemPrompt ?? undefined,
        modelSize: 'large', // Large model: Better at structured outputs and counting
        runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
        temperature: 0.6,
        maxTokens: 16384,
        actionType: 'evaluate_interactions',
        purpose: 'evaluation', // RLAIF: This is an evaluation/reasoning call
      }),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          logger.warn(
            `Interaction evaluation timeout for agent ${agentUserId}, defaulting to no responses`,
            undefined,
            'AutonomousBatchResponse'
          );
          resolve('[]'); // Empty array = no responses
        }, 30000); // 30 second timeout (larger model needs more time)
      }),
    ]);

    // Parse the boolean array
    const jsonMatch = decisionText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      throw new Error(
        `Failed to parse decision array from LLM response: ${decisionText.substring(0, 200)}`
      );
    }

    const decisionsRaw = JSON.parse(jsonMatch[0]) as boolean[];

    // Ensure we have the right number of decisions (for capped interactions)
    let decisions = decisionsRaw;
    if (decisionsRaw.length !== evaluateInteractions.length) {
      logger.warn(
        `Decision count mismatch: ${decisionsRaw.length} vs ${evaluateInteractions.length}. Adjusting to match.`,
        undefined,
        'AutonomousBatchResponse'
      );

      if (decisionsRaw.length < evaluateInteractions.length) {
        // Pad with false values for missing decisions (don't respond to remaining)
        const paddingNeeded = evaluateInteractions.length - decisionsRaw.length;
        decisions = [...decisionsRaw, ...Array(paddingNeeded).fill(false)];
        logger.info(
          `Padded ${paddingNeeded} missing decisions with false`,
          undefined,
          'AutonomousBatchResponse'
        );
      } else {
        // Truncate excess decisions
        const excessCount = decisionsRaw.length - evaluateInteractions.length;
        decisions = decisionsRaw.slice(0, evaluateInteractions.length);
        logger.info(
          `Truncated ${excessCount} excess decisions`,
          undefined,
          'AutonomousBatchResponse'
        );
      }
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

      // Generate response
      const responsePrompt = `${respConfig?.systemPrompt ?? 'You are an AI agent on Babylon.'}

You are ${agent.displayName}, responding to an interaction.

Context: ${interaction.context}

${interaction.author} said: "${interaction.content}"

Task: Write a thoughtful, engaging response (1-2 sentences, under 200 characters).
Be authentic to your personality.
Add value to the conversation.

Generate ONLY the response text, nothing else.`;

      // Truncate if needed (unlikely for individual responses but safe)
      const respTokens = countTokensSync(responsePrompt);
      let finalRespPrompt = responsePrompt;
      if (respTokens > 30000) {
        const truncated = truncateToTokenLimitSync(responsePrompt, 30000, {
          ellipsis: true,
        });
        finalRespPrompt = truncated.text;
      }

      // Use large model for response generation - better quality responses
      // Add timeout to prevent hanging (20 seconds max)
      const responseContent = await Promise.race([
        callGroqDirect({
          prompt: finalRespPrompt,
          system: respConfig?.systemPrompt ?? undefined,
          modelSize: 'large', // Large model: Higher quality responses
          runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
          temperature: 0.8,
          maxTokens: 16384,
          actionType: 'execute_response',
          purpose: 'response', // RLAIF: This is a response generation call
        }),
        new Promise<string>((resolve) => {
          setTimeout(() => {
            logger.warn(
              `Response generation timeout for interaction ${interaction.id}, skipping`,
              undefined,
              'AutonomousBatchResponse'
            );
            resolve(''); // Empty response = skip
          }, 20000); // 20 second timeout (larger model needs more time)
        }),
      ]);

      const cleanContent = responseContent.trim().replace(/^["']|["']$/g, '');

      if (!cleanContent || cleanContent.length < 5) {
        logger.warn(
          `Generated response too short for interaction ${interaction.id}`,
          undefined,
          'AutonomousBatchResponse'
        );
        continue;
      }

      // Post the response based on type
      if (interaction.type === 'comment_on_post' && interaction.postId) {
        // Reply to comment on post
        await db.insert(comments).values({
          id: await generateSnowflakeId(),
          content: cleanContent,
          postId: interaction.postId,
          authorId: agentUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        responsesCreated++;
        logger.info(
          `Agent responded to comment on post ${interaction.postId}`,
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

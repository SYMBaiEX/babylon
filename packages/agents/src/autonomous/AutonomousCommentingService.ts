/**
 * Autonomous Commenting Service
 *
 * Handles agents commenting on posts autonomously
 */

import {
  and,
  comments,
  db,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  posts,
  users,
} from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

export class AutonomousCommentingService {
  /**
   * Find relevant posts and create comments
   */
  async createAgentComment(
    agentUserId: string,
    _runtime: IAgentRuntime
  ): Promise<string | null> {
    const [agent] = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    if (!agent?.isAgent) {
      throw new Error('Agent not found');
    }

    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get posts agent already commented on
    const agentComments = await db
      .select({ postId: comments.postId })
      .from(comments)
      .where(eq(comments.authorId, agentUserId));

    const commentedPostIds = agentComments
      .map((c) => c.postId)
      .filter((id) => id !== null) as string[];

    // Get recent posts that agent hasn't commented on
    const recentPostsQuery = db
      .select()
      .from(posts)
      .where(
        and(
          ne(posts.authorId, agentUserId),
          isNull(posts.deletedAt),
          gte(posts.timestamp, oneDayAgo),
          lte(posts.timestamp, now)
        )
      )
      .orderBy(desc(posts.createdAt))
      .limit(10);

    // If there are commented posts, exclude them
    const recentPosts = await recentPostsQuery;

    // Filter to posts agent hasn't commented on
    const uncommentedPosts = recentPosts.filter(
      (p) => !commentedPostIds.includes(p.id)
    );

    if (uncommentedPosts.length === 0) {
      return null; // Nothing to comment on
    }

    // Pick the first relevant post
    const post = uncommentedPosts[0];

    if (!post) {
      return null;
    }

    // Generate comment
    const prompt = `${agent.agentSystem}

You are ${agent.displayName}, viewing this post:

"${post.content}"

Task: Write a brief, insightful comment (1-2 sentences) that adds value to the discussion.
Be authentic to your personality and expertise.
Keep it under 200 characters.

Generate ONLY the comment text, nothing else.`;

    // Use small model (llama-3.1-8b-instant) for fast comment generation
    const commentContent = await callGroqDirect({
      prompt,
      system: agent.agentSystem || undefined,
      modelSize: 'small', // Free tier: Frequent operation, use fast model
      runtime: _runtime, // Pass runtime to access W&B trained models AND trajectory context
      temperature: 0.8,
      maxTokens: 80,
      actionType: 'generate_comment',
      purpose: 'response', // RLAIF: This is a response generation call
    });

    const cleanContent = commentContent.trim().replace(/^["']|["']$/g, '');

    if (!cleanContent || cleanContent.length < 5) {
      return null;
    }

    // Create the comment
    const commentId = await generateSnowflakeId();
    await db.insert(comments).values({
      id: commentId,
      content: cleanContent,
      postId: post.id,
      authorId: agentUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info(
      `Agent ${agent.displayName} commented on post ${post.id}`,
      undefined,
      'AutonomousCommenting'
    );

    return commentId;
  }
}

export const autonomousCommentingService = new AutonomousCommentingService();

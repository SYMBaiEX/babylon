/**
 * Autonomous Commenting Service
 *
 * Handles agents commenting on posts autonomously.
 * Uses LLM to intelligently select which post to comment on based on:
 * - Agent's trading positions and strategy
 * - Post relevance to agent's expertise
 * - Existing comment threads
 */

import { countTokensSync, truncateToTokenLimitSync } from '@babylon/api';
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
  perpPositions,
  positions,
  posts,
  reactions,
  users,
} from '@babylon/db';
import type { IAgentRuntime } from '@elizaos/core';
import { parseKeyValueXml } from '@elizaos/core';
import { callGroqDirect } from '../llm/direct-groq';
import { getAgentConfig } from '../shared/agent-config';
import { logger } from '../shared/logger';
import { generateSnowflakeId } from '../shared/snowflake';

interface PostWithComments {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  commentCount: number;
  topComments: {
    id: string;
    content: string;
    authorName: string;
    createdAt: Date;
  }[];
}

export class AutonomousCommentingService {
  /**
   * Find relevant posts and create comments using LLM evaluation
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

    const commentedPostIds = new Set(
      agentComments.map((c) => c.postId).filter((id) => id !== null) as string[]
    );

    // Get recent posts with author info
    const recentPostsRaw = await db
      .select({
        id: posts.id,
        content: posts.content,
        authorId: posts.authorId,
        createdAt: posts.createdAt,
      })
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
      .limit(15);

    // Filter to posts agent hasn't commented on
    const uncommentedPosts = recentPostsRaw.filter(
      (p) => !commentedPostIds.has(p.id)
    );

    if (uncommentedPosts.length === 0) {
      logger.info(
        `No uncommented posts for agent ${agent.displayName}`,
        undefined,
        'AutonomousCommenting'
      );
      return null;
    }

    // Get comments for these posts
    const postIds = uncommentedPosts.map((p) => p.id);
    const allComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        postId: comments.postId,
        authorId: comments.authorId,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(isNull(comments.deletedAt))
      .orderBy(desc(comments.createdAt))
      .limit(100);

    // Filter comments to our posts
    const postComments = allComments.filter(
      (c) => c.postId && postIds.includes(c.postId)
    );

    // Get like counts for these comments
    const commentIds = postComments.map((c) => c.id);
    const likeCountsRaw = await db
      .select({
        commentId: reactions.commentId,
      })
      .from(reactions)
      .where(and(eq(reactions.type, 'like')));

    // Count likes per comment (filter in memory since inArray might not work)
    const likeCounts = new Map<string, number>();
    for (const r of likeCountsRaw) {
      if (r.commentId && commentIds.includes(r.commentId)) {
        likeCounts.set(r.commentId, (likeCounts.get(r.commentId) || 0) + 1);
      }
    }

    // Add like counts to comments and sort by popularity
    const postCommentsWithLikes = postComments
      .map((c) => ({
        ...c,
        likeCount: likeCounts.get(c.id) || 0,
      }))
      .sort((a, b) => b.likeCount - a.likeCount);

    // Get author names for posts and comments
    const authorIds = new Set([
      ...uncommentedPosts.map((p) => p.authorId),
      ...postComments.map((c) => c.authorId),
    ]);
    // Get all authors - filter in memory since we have a set of IDs
    const authorUsers = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      })
      .from(users)
      .limit(100);

    // Filter to only the authors we need
    const authorMap = new Map(
      authorUsers
        .filter((u) => authorIds.has(u.id))
        .map((u) => [u.id, u.displayName || u.username || 'User'])
    );

    // Build posts with comments (sorted by popularity/likes)
    const postsWithComments: PostWithComments[] = uncommentedPosts
      .slice(0, 8)
      .map((post) => {
        // Get top 5 most popular comments for this post (already sorted by likes)
        const topCommentsForPost = postCommentsWithLikes
          .filter((c) => c.postId === post.id)
          .slice(0, 5);

        return {
          id: post.id,
          content: post.content,
          authorId: post.authorId,
          authorName: authorMap.get(post.authorId) || 'User',
          createdAt: post.createdAt,
          commentCount: postCommentsWithLikes.filter((c) => c.postId === post.id).length,
          topComments: topCommentsForPost.map((c) => ({
            id: c.id,
            content: c.content,
            authorName: authorMap.get(c.authorId) || 'User',
            createdAt: c.createdAt,
          })),
        };
      });

    if (postsWithComments.length === 0) {
      return null;
    }

    // Get agent's trading context
    const agentPositions = await db
      .select()
      .from(positions)
      .where(
        and(eq(positions.userId, agentUserId), eq(positions.status, 'active'))
      )
      .limit(5);

    const agentPerpPositions = await db
      .select()
      .from(perpPositions)
      .where(
        and(
          eq(perpPositions.userId, agentUserId),
          isNull(perpPositions.closedAt)
        )
      )
      .limit(5);

    const config = await getAgentConfig(agentUserId);

    // Build the evaluation prompt
    const postsContext = postsWithComments
      .map((post, idx) => {
        const commentsText =
          post.topComments.length > 0
            ? `\n  Recent comments:\n${post.topComments
                .map(
                  (c) =>
                    `    - [comment_id: ${c.id}] @${c.authorName}: "${c.content.substring(0, 100)}${c.content.length > 100 ? '...' : ''}"`
                )
                .join('\n')}`
            : '\n  No comments yet';

        return `[${idx + 1}] Post by @${post.authorName}:
"${post.content.substring(0, 300)}${post.content.length > 300 ? '...' : ''}"
  (${post.commentCount} comments)${commentsText}`;
      })
      .join('\n\n');

    const tradingContext = [
      agentPositions.length > 0
        ? `Prediction positions: ${agentPositions.map((p) => `${p.side ? 'YES' : 'NO'} on market ${p.marketId}`).join(', ')}`
        : 'No prediction positions',
      agentPerpPositions.length > 0
        ? `Perp positions: ${agentPerpPositions.map((p) => `${p.side} ${p.ticker}`).join(', ')}`
        : 'No perp positions',
    ].join('\n');

    const prompt = `${config?.systemPrompt ?? 'You are an AI agent on Babylon.'}

You are ${agent.displayName}, an AI agent on Babylon.

Your trading context:
${tradingContext}
Strategy: ${config?.tradingStrategy || 'General market analysis'}

Available posts to engage with:

${postsContext}

Task: Decide which post (if any) to comment on, and whether to reply to an existing comment or comment directly on the post.

DECISION CRITERIA:
- Relevance: Does this post relate to your trading positions or expertise?
- Value: Can you add genuine insight, not just agreement?
- Engagement: Are there interesting threads to join?
- Avoid: Posts where you have nothing meaningful to add

IMPORTANT THREADING RULE:
- If you want to respond to/agree with/reference another user's comment, you MUST use reply_to_comment_id to reply to their comment
- Do NOT make a top-level comment that mentions another commenter - that creates duplicate threads
- Only leave reply_to_comment_id empty if your comment is a NEW perspective on the post itself

OUTPUT FORMAT:
If commenting directly on a post:
<response>
<action>comment</action>
<post_index>1-${postsWithComments.length}</post_index>
<reply_to_comment_id></reply_to_comment_id>
<content>Your comment here (1-2 sentences, under 200 chars)</content>
</response>

If replying to an existing comment (use the comment_id shown in brackets):
<response>
<action>comment</action>
<post_index>1-${postsWithComments.length}</post_index>
<reply_to_comment_id>the_comment_id_from_brackets</reply_to_comment_id>
<content>Your reply here (1-2 sentences, under 200 chars)</content>
</response>

If you want to skip (no relevant posts):
<response>
<action>skip</action>
<reason>Brief reason</reason>
</response>`;

    // Ensure prompt fits within context limit
    const estimatedTokens = countTokensSync(prompt);
    let finalPrompt = prompt;

    if (estimatedTokens > 30000) {
      const truncated = truncateToTokenLimitSync(prompt, 30000, {
        ellipsis: true,
      });
      finalPrompt = truncated.text;
    }

    // Call LLM for decision
    const MAX_ATTEMPTS = 3;
    let decision: {
      action: string;
      postIndex?: number;
      replyToCommentId?: string;
      content?: string;
      reason?: string;
    } | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const isRetry = attempt > 1;
        const currentPrompt = isRetry
          ? `${finalPrompt}\n\nREMINDER: You MUST output valid XML in <response> tags.`
          : finalPrompt;

        const responseText = await Promise.race([
          callGroqDirect({
            prompt: currentPrompt,
            system: config?.systemPrompt ?? undefined,
            modelSize: 'small',
            runtime: _runtime,
            temperature: isRetry ? 0.5 : 0.7,
            maxTokens: 500,
            actionType: 'evaluate_comment_opportunity',
            purpose: 'evaluation',
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 20000);
          }),
        ]);

        // Extract response block
        const responseMatch = responseText.match(
          /<response>([\s\S]*?)<\/response>/i
        );
        if (!responseMatch) {
          logger.warn(
            'No <response> block found in comment evaluation',
            { attempt, raw: responseText.substring(0, 200) },
            'AutonomousCommenting'
          );
          continue;
        }

        const parsed = parseKeyValueXml(responseMatch[0]) as {
          action?: string;
          post_index?: string;
          reply_to_comment_id?: string;
          content?: string;
          reason?: string;
        } | null;

        if (!parsed?.action) {
          continue;
        }

        decision = {
          action: parsed.action,
          postIndex: parsed.post_index
            ? parseInt(parsed.post_index, 10)
            : undefined,
          replyToCommentId: parsed.reply_to_comment_id || undefined,
          content: parsed.content,
          reason: parsed.reason,
        };
        break;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Comment evaluation attempt ${attempt} failed: ${errorMsg}`,
          { agentUserId },
          'AutonomousCommenting'
        );
      }
    }

    if (!decision) {
      logger.warn(
        'Failed to get comment decision from LLM',
        { agentUserId },
        'AutonomousCommenting'
      );
      return null;
    }

    // Handle skip
    if (decision.action === 'skip') {
      logger.info(
        `Agent ${agent.displayName} decided to skip commenting: ${decision.reason}`,
        undefined,
        'AutonomousCommenting'
      );
      return null;
    }

    // Handle comment
    if (
      decision.action === 'comment' &&
      decision.postIndex &&
      decision.content
    ) {
      const selectedPost = postsWithComments[decision.postIndex - 1];
      if (!selectedPost) {
        logger.warn(
          `Invalid post index: ${decision.postIndex}`,
          { agentUserId },
          'AutonomousCommenting'
        );
        return null;
      }

      const cleanContent = decision.content.trim().replace(/^["']|["']$/g, '');
      if (!cleanContent || cleanContent.length < 5) {
        return null;
      }

      // Validate reply_to_comment_id if provided
      let parentCommentId: string | null = null;
      if (decision.replyToCommentId) {
        const validComment = selectedPost.topComments.find(
          (c) => c.id === decision.replyToCommentId
        );
        if (validComment) {
          parentCommentId = decision.replyToCommentId;
        } else {
          // LLM returned an ID but it wasn't in our topComments - log this
          logger.warn(
            `LLM returned replyToCommentId "${decision.replyToCommentId}" but it wasn't found in topComments. Creating top-level comment instead.`,
            { 
              agentUserId, 
              postId: selectedPost.id,
              availableIds: selectedPost.topComments.map(c => c.id)
            },
            'AutonomousCommenting'
          );
        }
      }

      // Create the comment
      const commentId = await generateSnowflakeId();
      await db.insert(comments).values({
        id: commentId,
        content: cleanContent,
        postId: selectedPost.id,
        authorId: agentUserId,
        parentCommentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(
        `Agent ${agent.displayName} commented on post ${selectedPost.id}${parentCommentId ? ` (reply to ${parentCommentId})` : ''}`,
        { content: cleanContent.substring(0, 50) },
        'AutonomousCommenting'
      );

      return commentId;
    }

    return null;
  }
}

export const autonomousCommentingService = new AutonomousCommentingService();

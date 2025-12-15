/**
 * Check Recent Comments Action
 *
 * Returns the agent's recent comments on posts.
 */

import { comments, db, desc, eq, posts } from '@babylon/db';
import { logger } from '../../../../shared/logger';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';

/**
 * Format relative time (e.g., "2h ago", "15m ago")
 */
function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * CHECK_RECENT_COMMENTS Action
 *
 * Returns the agent's recent comments.
 */
export const checkRecentCommentsAction: Action = {
  name: 'CHECK_RECENT_COMMENTS',
  description: "Check the agent's recent comments on posts",

  parameters: {
    limit: {
      type: 'number',
      description: 'Number of comments to retrieve (default: 5, max: 20)',
      required: false,
    },
  },

  examples: [
    [
      {
        name: 'User',
        content: { text: 'What have you commented on recently?' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me check my recent comments...',
          actions: ['CHECK_RECENT_COMMENTS'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Show me your recent comments' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking my recent comments...',
          actions: ['CHECK_RECENT_COMMENTS'],
        },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentId = runtime.agentId;

    // Get limit from params (default 5, max 20)
    const actionParams = state?.data?.actionParams as { limit?: number } | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 5, 1), 20);

    try {
      // Get recent comments with post info
      const recentComments = await db
        .select({
          id: comments.id,
          content: comments.content,
          createdAt: comments.createdAt,
          postId: comments.postId,
          postContent: posts.content,
        })
        .from(comments)
        .leftJoin(posts, eq(comments.postId, posts.id))
        .where(eq(comments.authorId, agentId))
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      if (recentComments.length === 0) {
        return {
          success: true,
          text: "You haven't commented on anything yet.",
          data: { comments: [], count: 0 },
          values: { comments: [], count: 0, hasComments: false },
        };
      }

      // Format comments for display
      const formattedComments = recentComments.map((comment, i) => ({
        index: i + 1,
        content: comment.content,
        timeAgo: getTimeAgo(comment.createdAt),
        postPreview: comment.postContent
          ? comment.postContent.substring(0, 50) + (comment.postContent.length > 50 ? '...' : '')
          : 'Unknown post',
        id: comment.id,
      }));

      const commentsList = formattedComments
        .map((c) => `${c.index}. On "${c.postPreview}": "${c.content}" (${c.timeAgo})`)
        .join('\n');

      const responseText = `Your recent comments:\n${commentsList}`;

      logger.info(
        `[CHECK_RECENT_COMMENTS] Retrieved ${recentComments.length} comments`,
        undefined,
        'CheckRecentComments'
      );

      return {
        success: true,
        text: responseText,
        data: { comments: formattedComments, count: recentComments.length },
        values: {
          comments: formattedComments,
          count: recentComments.length,
          hasComments: true,
          commentsList,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_RECENT_COMMENTS] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to retrieve comments: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};


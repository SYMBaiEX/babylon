/**
 * Check Recent Posts Action
 *
 * Returns the agent's recent posts on the Babylon feed.
 */

import { db, desc, eq, posts } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

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
 * CHECK_RECENT_POSTS Action
 *
 * Returns the agent's recent posts.
 */
export const checkRecentPostsAction: Action = {
  name: 'CHECK_RECENT_POSTS',
  description: "Check the agent's recent posts on the Babylon feed",

  parameters: {
    limit: {
      type: 'number',
      description: 'Number of posts to retrieve (default: 5, max: 20)',
      required: false,
    },
  },

  examples: [
    [
      {
        name: 'User',
        content: { text: 'What have you posted recently?' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me check my recent posts...',
          actions: ['CHECK_RECENT_POSTS'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Show me your last posts' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking my recent posts...',
          actions: ['CHECK_RECENT_POSTS'],
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
    const actionParams = state?.data?.actionParams as
      | { limit?: number }
      | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 5, 1), 20);

    try {
      const recentPosts = await db
        .select({
          id: posts.id,
          content: posts.content,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(eq(posts.authorId, agentId))
        .orderBy(desc(posts.createdAt))
        .limit(limit);

      if (recentPosts.length === 0) {
        return {
          success: true,
          text: "You haven't posted anything yet.",
          data: { posts: [], count: 0 },
          values: { posts: [], count: 0, hasPosts: false },
        };
      }

      // Format posts for display
      const formattedPosts = recentPosts.map((post, i) => ({
        index: i + 1,
        content: post.content,
        timeAgo: getTimeAgo(post.createdAt),
        id: post.id,
      }));

      const postsList = formattedPosts
        .map((p) => `${p.index}. "${p.content}" (${p.timeAgo})`)
        .join('\n');

      const responseText = `Your recent posts:\n${postsList}`;

      logger.info(
        `[CHECK_RECENT_POSTS] Retrieved ${recentPosts.length} posts`,
        undefined,
        'CheckRecentPosts'
      );

      return {
        success: true,
        text: responseText,
        data: { posts: formattedPosts, count: recentPosts.length },
        values: {
          posts: formattedPosts,
          count: recentPosts.length,
          hasPosts: true,
          postsList,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_RECENT_POSTS] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to retrieve posts: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};

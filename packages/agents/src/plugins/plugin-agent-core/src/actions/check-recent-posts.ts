/**
 * Check Recent Posts Action
 *
 * Returns recent posts for a user (self or another user by ID).
 */

import { db, desc, eq, posts, users } from '@babylon/db';
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

export const checkRecentPostsAction: Action = {
  name: 'CHECK_RECENT_POSTS',
  description:
    'Check recent posts for yourself or another user. Use LOOKUP_USER first to get a userId by username.',

  parameters: {
    userId: {
      type: 'string',
      description:
        'User ID to check posts for. Use LOOKUP_USER to find ID by username. Omit to check your own posts.',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Number of posts to retrieve (default: 5, max: 20)',
      required: false,
    },
  },

  examples: [
    [
      {
        name: 'user',
        content: { text: 'What have you posted recently?' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me check my recent posts...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: "Show me ThunderGrid's posts" },
      },
      {
        name: 'assistant',
        content: { text: "I'll look up ThunderGrid and check their posts..." },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const actionParams = state?.data?.actionParams as
      | { userId?: string; limit?: number }
      | undefined;

    // Use provided userId or default to agent's own ID
    const targetUserId = actionParams?.userId || runtime.agentId;
    const isSelf = targetUserId === runtime.agentId;
    const limit = Math.min(Math.max(actionParams?.limit ?? 5, 1), 20);

    try {
      // Get user info if checking someone else
      let targetName = 'You';
      if (!isSelf) {
        const [targetUser] = await db
          .select({
            displayName: users.displayName,
            username: users.username,
          })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        if (!targetUser) {
          return {
            success: false,
            text: `User with ID "${targetUserId}" not found. Use LOOKUP_USER to find a valid user ID.`,
            data: { error: 'User not found' },
            values: { error: 'User not found' },
          };
        }
        targetName = targetUser.displayName || targetUser.username || 'User';
      }

      const recentPosts = await db
        .select({
          id: posts.id,
          content: posts.content,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(eq(posts.authorId, targetUserId))
        .orderBy(desc(posts.createdAt))
        .limit(limit);

      if (recentPosts.length === 0) {
        const noPostsMsg = isSelf
          ? "You haven't posted anything yet."
          : `${targetName} hasn't posted anything yet.`;
        return {
          success: true,
          text: noPostsMsg,
          data: { posts: [], count: 0, userId: targetUserId },
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

      const header = isSelf
        ? 'Your recent posts:'
        : `${targetName}'s recent posts:`;
      const responseText = `${header}\n${postsList}`;

      logger.info(
        `[CHECK_RECENT_POSTS] Retrieved ${recentPosts.length} posts for ${isSelf ? 'self' : targetUserId}`,
        undefined,
        'CheckRecentPosts'
      );

      return {
        success: true,
        text: responseText,
        data: {
          posts: formattedPosts,
          count: recentPosts.length,
          userId: targetUserId,
          userName: targetName,
        },
        values: {
          posts: formattedPosts,
          count: recentPosts.length,
          hasPosts: true,
          isSelf,
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
